import * as path from 'node:path';

import { dirExists, fileExists, glob, readFile, readJson } from '../utils/fs.js';
import { err, ok, type Result } from '../utils/result.js';

import type { Rule } from '../parsers/rule.js';

/**
 * Supported package manager ecosystems
 */
export type PackageEcosystem =
  | 'npm' // Node.js - package.json
  | 'pip' // Python - requirements.txt, pyproject.toml, Pipfile
  | 'go' // Go - go.mod
  | 'cargo' // Rust - Cargo.toml
  | 'composer' // PHP - composer.json
  | 'gem' // Ruby - Gemfile
  | 'pub' // Dart/Flutter - pubspec.yaml
  | 'maven' // Java - pom.xml
  | 'gradle' // Java/Kotlin - build.gradle
  | 'nuget'; // .NET - *.csproj

/**
 * Namespace prefixes for condition identifiers
 */
export type ConditionNamespace =
  | PackageEcosystem // npm:react, pip:django, etc.
  | 'file' // file:tsconfig.json
  | 'dir' // dir:.github/workflows
  | 'pkg' // pkg:type (package.json fields)
  | 'var'; // var:custom_variable (user-defined)

/**
 * Parsed identifier with namespace
 */
export interface ParsedIdentifier {
  /** The namespace prefix */
  namespace: ConditionNamespace;
  /** The identifier after the colon */
  name: string;
}

/**
 * A single condition (can be existence check or comparison)
 */
export interface ParsedCondition {
  /** The namespaced identifier */
  identifier: ParsedIdentifier;
  /** Whether this is negated (!) */
  negated: boolean;
  /** Comparison operator (if any) - null means existence check */
  operator: ComparisonOperator | null;
  /** Value to compare (if operator present) */
  value: string | number | boolean | null;
}

/**
 * Supported comparison operators
 */
export type ComparisonOperator = '==' | '!=' | '>' | '<' | '>=' | '<=';

/**
 * Supported logical operators
 */
export type LogicalOperator = '&&' | '||';

/**
 * A compound condition with logical operators
 */
export interface CompoundCondition {
  /** Individual conditions */
  conditions: ParsedCondition[];
  /** Logical operators between conditions (length = conditions.length - 1) */
  operators: LogicalOperator[];
}

/**
 * Result of evaluating a condition
 */
export interface EvaluationResult {
  /** Whether the condition passed */
  matches: boolean;
  /** Human-readable explanation of evaluation */
  reason: string;
  /** Identifiers that were checked */
  checkedIdentifiers: string[];
}

/**
 * Project context - lazily populated as conditions are evaluated
 */
export interface ProjectContext {
  /** Project root directory */
  projectRoot: string;
  /** Cached dependency lookups by ecosystem */
  dependencyCache: Map<PackageEcosystem, Map<string, string | boolean>>;
  /** Cached file existence checks */
  fileCache: Map<string, boolean>;
  /** User-defined variables from config.yaml */
  variables: Record<string, string | number | boolean>;
  /** Package.json contents (if exists) */
  packageJson?: Record<string, unknown>;
}

/**
 * Error types for condition evaluation
 */
export type ConditionErrorCode =
  | 'PARSE_ERROR'
  | 'UNKNOWN_NAMESPACE'
  | 'INVALID_OPERATOR'
  | 'ECOSYSTEM_NOT_FOUND';

/**
 * Condition evaluation error
 */
export interface ConditionError {
  code: ConditionErrorCode;
  message: string;
  /** The condition expression that caused the error */
  expression: string;
  /** Position in expression where error occurred (if applicable) */
  position?: number;
}

const IDENTIFIER_PATTERN = /^([a-z]+):(.+)$/i;
const COMPARISON_PATTERN = /^(!?)(.+?)\s*(==|!=|>=?|<=?)\s*(.+)$/;
const EXISTENCE_PATTERN = /^(!?)(.+)$/;
const LOGICAL_OPERATOR_PATTERN = /(&&|\|\|)/g;

const VALID_NAMESPACES: ConditionNamespace[] = [
  'npm',
  'pip',
  'go',
  'cargo',
  'composer',
  'gem',
  'pub',
  'maven',
  'gradle',
  'nuget',
  'file',
  'dir',
  'pkg',
  'var',
];

function stripQuotes(value: string): string {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/**
 * Parse a namespaced identifier
 *
 * Examples:
 * - "npm:react" → { namespace: "npm", name: "react" }
 * - "file:tsconfig.json" → { namespace: "file", name: "tsconfig.json" }
 * - "npm:@scope/package" → { namespace: "npm", name: "@scope/package" }
 */
export function parseIdentifier(identifier: string): Result<ParsedIdentifier, ConditionError> {
  const match = IDENTIFIER_PATTERN.exec(identifier.trim());

  if (!match) {
    return err({
      code: 'PARSE_ERROR',
      message: `Invalid identifier format: "${identifier}". Expected "namespace:name"`,
      expression: identifier,
    });
  }

  const namespace = match[1];
  const name = match[2];

  if (!namespace || !name) {
    return err({
      code: 'PARSE_ERROR',
      message: `Invalid identifier format: "${identifier}". Expected "namespace:name"`,
      expression: identifier,
    });
  }

  const lowerNamespace = namespace.toLowerCase();

  if (!VALID_NAMESPACES.includes(lowerNamespace as ConditionNamespace)) {
    return err({
      code: 'UNKNOWN_NAMESPACE',
      message: `Unknown namespace: "${namespace}". Valid: ${VALID_NAMESPACES.join(', ')}`,
      expression: identifier,
    });
  }

  return ok({
    namespace: lowerNamespace as ConditionNamespace,
    name: stripQuotes(name),
  });
}

/**
 * Parse value from condition (handles quotes, booleans, numbers)
 */
export function parseValue(valueStr: string): string | number | boolean {
  const trimmed = valueStr.trim();

  // Boolean
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Quoted string
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // Number
  const num = Number(trimmed);
  if (!Number.isNaN(num)) return num;

  // Unquoted string
  return trimmed;
}

/**
 * Parse a single condition term
 *
 * Formats:
 * - "npm:react" → existence check
 * - "!npm:react" → negated existence
 * - "pkg:type == \"module\"" → comparison
 * - "var:count > 5" → numeric comparison
 */
export function parseConditionTerm(term: string): Result<ParsedCondition, ConditionError> {
  const trimmed = term.trim();

  // Try comparison first
  const compMatch = COMPARISON_PATTERN.exec(trimmed);
  if (compMatch) {
    const negation = compMatch[1] ?? '';
    const identifierStr = compMatch[2];
    const operator = compMatch[3];
    const valueStr = compMatch[4];

    if (!identifierStr || !operator || valueStr === undefined) {
      return err({
        code: 'PARSE_ERROR',
        message: `Cannot parse condition: "${trimmed}"`,
        expression: trimmed,
      });
    }

    const identResult = parseIdentifier(identifierStr.trim());
    if (!identResult.ok) return identResult;

    return ok({
      identifier: identResult.value,
      negated: negation === '!',
      operator: operator as ComparisonOperator,
      value: parseValue(valueStr),
    });
  }

  // Existence check
  const existMatch = EXISTENCE_PATTERN.exec(trimmed);
  if (existMatch) {
    const negation = existMatch[1] ?? '';
    const identifierStr = existMatch[2];

    if (!identifierStr) {
      return err({
        code: 'PARSE_ERROR',
        message: `Cannot parse condition: "${trimmed}"`,
        expression: trimmed,
      });
    }

    const identResult = parseIdentifier(identifierStr.trim());
    if (!identResult.ok) return identResult;

    return ok({
      identifier: identResult.value,
      negated: negation === '!',
      operator: null,
      value: null,
    });
  }

  return err({
    code: 'PARSE_ERROR',
    message: `Cannot parse condition: "${trimmed}"`,
    expression: trimmed,
  });
}

/**
 * Parse a condition expression into individual terms and logical operators
 */
export function parseConditionExpression(
  expression: string
): Result<CompoundCondition, ConditionError> {
  const trimmed = expression.trim();

  if (trimmed === '') {
    return ok({ conditions: [], operators: [] });
  }

  const conditions: ParsedCondition[] = [];
  const operators: LogicalOperator[] = [];

  const matches = [...trimmed.matchAll(LOGICAL_OPERATOR_PATTERN)];

  if (matches.length === 0) {
    const single = parseConditionTerm(trimmed);
    if (!single.ok) return single;
    return ok({ conditions: [single.value], operators: [] });
  }

  let startIndex = 0;

  for (const match of matches) {
    const matchIndex = match.index ?? 0;
    const op = match[0] as LogicalOperator;
    const segment = trimmed.slice(startIndex, matchIndex).trim();

    if (segment === '') {
      return err({
        code: 'PARSE_ERROR',
        message: 'Missing condition between logical operators',
        expression: expression,
        position: matchIndex,
      });
    }

    const parsed = parseConditionTerm(segment);
    if (!parsed.ok) return parsed;
    conditions.push(parsed.value);
    operators.push(op);
    startIndex = matchIndex + op.length;
  }

  const finalSegment = trimmed.slice(startIndex).trim();
  if (finalSegment === '') {
    return err({
      code: 'PARSE_ERROR',
      message: 'Trailing logical operator without condition',
      expression: expression,
      position: startIndex,
    });
  }
  const lastParsed = parseConditionTerm(finalSegment);
  if (!lastParsed.ok) return lastParsed;
  conditions.push(lastParsed.value);

  return ok({ conditions, operators });
}

/**
 * Build a fresh project context
 */
export function buildProjectContext(
  projectRoot: string,
  variables: Record<string, string | number | boolean> = {}
): ProjectContext {
  return {
    projectRoot,
    dependencyCache: new Map(),
    fileCache: new Map(),
    variables,
  };
}

async function cachedFileExists(filePath: string, context: ProjectContext): Promise<boolean> {
  if (context.fileCache.has(filePath)) {
    return context.fileCache.get(filePath) ?? false;
  }

  const exists = await fileExists(filePath);
  context.fileCache.set(filePath, exists);
  return exists;
}

async function cachedDirExists(dirPath: string, context: ProjectContext): Promise<boolean> {
  if (context.fileCache.has(dirPath)) {
    return context.fileCache.get(dirPath) ?? false;
  }

  const exists = await dirExists(dirPath);
  context.fileCache.set(dirPath, exists);
  return exists;
}

/**
 * Check if a dependency exists in the given ecosystem (with caching)
 */
async function checkDependency(
  ecosystem: PackageEcosystem,
  packageName: string,
  context: ProjectContext
): Promise<Result<boolean, ConditionError>> {
  const cachedDeps = context.dependencyCache.get(ecosystem);
  if (cachedDeps?.has(packageName)) {
    return ok(cachedDeps.get(packageName) !== false);
  }

  const deps = await loadEcosystemDependencies(ecosystem, context.projectRoot);
  const ecosystemCache = cachedDeps ?? new Map<string, string | boolean>();

  for (const [name, version] of Object.entries(deps)) {
    ecosystemCache.set(name, version);
  }

  const hasDependency = Object.prototype.hasOwnProperty.call(deps, packageName);

  if (!hasDependency) {
    ecosystemCache.set(packageName, false);
  }

  context.dependencyCache.set(ecosystem, ecosystemCache);

  return ok(hasDependency);
}

/**
 * Load dependencies for a specific ecosystem
 */
async function loadEcosystemDependencies(
  ecosystem: PackageEcosystem,
  projectRoot: string
): Promise<Record<string, string | boolean>> {
  switch (ecosystem) {
    case 'npm':
      return loadNpmDependencies(projectRoot);
    case 'pip':
      return loadPipDependencies(projectRoot);
    case 'go':
      return loadGoDependencies(projectRoot);
    case 'cargo':
      return loadCargoDependencies(projectRoot);
    case 'composer':
      return loadComposerDependencies(projectRoot);
    case 'gem':
      return loadGemDependencies(projectRoot);
    case 'pub':
      return loadPubDependencies(projectRoot);
    case 'maven':
      return loadMavenDependencies(projectRoot);
    case 'gradle':
      return loadGradleDependencies(projectRoot);
    case 'nuget':
      return loadNugetDependencies(projectRoot);
    default:
      return {};
  }
}

async function loadNpmDependencies(projectRoot: string): Promise<Record<string, string>> {
  const pkgPath = path.join(projectRoot, 'package.json');
  const result = await readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(pkgPath);

  if (!result.ok) {
    return {};
  }

  return {
    ...(result.value.dependencies ?? {}),
    ...(result.value.devDependencies ?? {}),
  };
}

async function loadPipDependencies(projectRoot: string): Promise<Record<string, string | boolean>> {
  const deps: Record<string, string | boolean> = {};

  // requirements.txt
  const reqPath = path.join(projectRoot, 'requirements.txt');
  if (await fileExists(reqPath)) {
    const content = await readFile(reqPath);
    if (content.ok) {
      const lines = content.value.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([a-zA-Z0-9_.-]+)/);
        if (match) {
          const packageName = match[1];
          if (packageName) {
            deps[packageName] = true;
          }
        }
      }
    }
  }

  // pyproject.toml (very light parsing)
  const pyprojectPath = path.join(projectRoot, 'pyproject.toml');
  if (await fileExists(pyprojectPath)) {
    const content = await readFile(pyprojectPath);
    if (content.ok) {
      const depMatches = content.value.matchAll(/["']([a-zA-Z0-9_.-]+)["']/g);
      for (const match of depMatches) {
        const packageName = match[1];
        if (packageName) {
          deps[packageName] = true;
        }
      }
    }
  }

  // Pipfile
  const pipfilePath = path.join(projectRoot, 'Pipfile');
  if (await fileExists(pipfilePath)) {
    const content = await readFile(pipfilePath);
    if (content.ok) {
      const depMatches = content.value.matchAll(/["']([a-zA-Z0-9_.-]+)["']/g);
      for (const match of depMatches) {
        const packageName = match[1];
        if (packageName) {
          deps[packageName] = true;
        }
      }
    }
  }

  return deps;
}

async function loadGoDependencies(projectRoot: string): Promise<Record<string, string | boolean>> {
  const deps: Record<string, string | boolean> = {};
  const goModPath = path.join(projectRoot, 'go.mod');

  if (!(await fileExists(goModPath))) {
    return deps;
  }

  const content = await readFile(goModPath);
  if (!content.ok) {
    return deps;
  }

  let inRequireBlock = false;
  const lines = content.value.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('//')) continue;
    if (line.startsWith('require (')) {
      inRequireBlock = true;
      continue;
    }
    if (inRequireBlock && line.startsWith(')')) {
      inRequireBlock = false;
      continue;
    }

    if (line.startsWith('require ')) {
      const match = line.match(/^require\s+([^\s]+)\s+([^\s]+)/);
      if (match) {
        const packageName = match[1];
        const version = match[2];
        if (packageName && version) {
          deps[packageName] = version;
        }
      }
      continue;
    }

    if (inRequireBlock) {
      const match = line.match(/^([^\s]+)\s+([^\s]+)/);
      if (match) {
        const packageName = match[1];
        const version = match[2];
        if (packageName && version) {
          deps[packageName] = version;
        }
      }
    }
  }

  return deps;
}

async function loadCargoDependencies(
  projectRoot: string
): Promise<Record<string, string | boolean>> {
  const deps: Record<string, string | boolean> = {};
  const cargoPath = path.join(projectRoot, 'Cargo.toml');

  if (!(await fileExists(cargoPath))) {
    return deps;
  }

  const content = await readFile(cargoPath);
  if (!content.ok) {
    return deps;
  }

  const lines = content.value.split('\n');
  let inDependencies = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('[')) {
      inDependencies = line === '[dependencies]' || line === '[dev-dependencies]';
      continue;
    }

    if (!inDependencies) continue;

    const match = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*["']?([a-zA-Z0-9_.-]+)?/);
    if (match) {
      const packageName = match[1];
      if (packageName) {
        deps[packageName] = match[2] ?? true;
      }
    }
  }

  return deps;
}

async function loadComposerDependencies(
  projectRoot: string
): Promise<Record<string, string | boolean>> {
  const composerPath = path.join(projectRoot, 'composer.json');
  const result = await readJson<{
    require?: Record<string, string>;
    'require-dev'?: Record<string, string>;
  }>(composerPath);

  if (!result.ok) {
    return {};
  }

  return {
    ...(result.value.require ?? {}),
    ...(result.value['require-dev'] ?? {}),
  };
}

async function loadGemDependencies(projectRoot: string): Promise<Record<string, string | boolean>> {
  const deps: Record<string, string | boolean> = {};
  const gemfilePath = path.join(projectRoot, 'Gemfile');

  if (await fileExists(gemfilePath)) {
    const content = await readFile(gemfilePath);
    if (content.ok) {
      const matches = content.value.matchAll(/gem\s+["']([a-zA-Z0-9_-]+)["']/g);
      for (const match of matches) {
        const packageName = match[1];
        if (packageName) {
          deps[packageName] = true;
        }
      }
    }
  }

  return deps;
}

async function loadPubDependencies(projectRoot: string): Promise<Record<string, string | boolean>> {
  const deps: Record<string, string | boolean> = {};
  const pubspecPath = path.join(projectRoot, 'pubspec.yaml');

  if (!(await fileExists(pubspecPath))) {
    return deps;
  }

  const content = await readFile(pubspecPath);
  if (!content.ok) {
    return deps;
  }

  let inDependencies = false;
  const lines = content.value.split('\n');

  for (const rawLine of lines) {
    const line = rawLine;
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;

    if (/^dev_dependencies:/.test(trimmed) || /^dependencies:/.test(trimmed)) {
      inDependencies = true;
      continue;
    }

    if (inDependencies && /^\w/.test(trimmed)) {
      const match = trimmed.match(/^([a-zA-Z0-9_-]+):/);
      if (match) {
        const packageName = match[1];
        if (packageName) {
          deps[packageName] = true;
        }
      }
    } else if (inDependencies && /^ /.test(line) === false) {
      // Exit dependencies block on dedent
      inDependencies = false;
    }
  }

  return deps;
}

async function loadMavenDependencies(
  projectRoot: string
): Promise<Record<string, string | boolean>> {
  const deps: Record<string, string | boolean> = {};
  const pomPath = path.join(projectRoot, 'pom.xml');

  if (!(await fileExists(pomPath))) {
    return deps;
  }

  const content = await readFile(pomPath);
  if (!content.ok) {
    return deps;
  }

  const matches = content.value.matchAll(/<artifactId>([^<]+)<\/artifactId>/g);
  for (const match of matches) {
    const artifactId = match[1];
    if (artifactId) {
      deps[artifactId] = true;
    }
  }

  return deps;
}

async function loadGradleDependencies(
  projectRoot: string
): Promise<Record<string, string | boolean>> {
  const deps: Record<string, string | boolean> = {};

  const gradleFiles = ['build.gradle', 'build.gradle.kts'].map((file) =>
    path.join(projectRoot, file)
  );

  for (const gradlePath of gradleFiles) {
    if (!(await fileExists(gradlePath))) continue;
    const content = await readFile(gradlePath);
    if (!content.ok) continue;

    const matches = content.value.matchAll(/['"]([a-zA-Z0-9_.-]+):([a-zA-Z0-9_.-]+):[^'"]+['"]/g);
    for (const match of matches) {
      const group = match[1];
      const artifact = match[2];
      if (group && artifact) {
        deps[artifact] = true;
        deps[`${group}:${artifact}`] = true;
      }
    }
  }

  return deps;
}

async function loadNugetDependencies(
  projectRoot: string
): Promise<Record<string, string | boolean>> {
  const deps: Record<string, string | boolean> = {};
  const matches = await glob('*.csproj', { cwd: projectRoot, absolute: true, dot: true });
  const candidates = [...matches];

  const packagesConfig = path.join(projectRoot, 'packages.config');
  if (await fileExists(packagesConfig)) {
    candidates.push(packagesConfig);
  }

  for (const filePath of candidates) {
    const content = await readFile(filePath);
    if (!content.ok) continue;

    const packageMatches = content.value.matchAll(/Include=["']([^"']+)["']/g);
    for (const match of packageMatches) {
      const packageName = match[1];
      if (packageName) {
        deps[packageName] = true;
      }
    }

    const idMatches = content.value.matchAll(/id=["']([^"']+)["']/g);
    for (const match of idMatches) {
      const packageId = match[1];
      if (packageId) {
        deps[packageId] = true;
      }
    }
  }

  return deps;
}

/**
 * Evaluate a single condition against project context
 */
export async function evaluateSingleCondition(
  condition: ParsedCondition,
  context: ProjectContext
): Promise<Result<boolean, ConditionError>> {
  const { identifier, negated, operator, value } = condition;
  const { namespace, name } = identifier;

  let exists = false;
  let actualValue: string | number | boolean | undefined;

  switch (namespace) {
    case 'npm':
    case 'pip':
    case 'go':
    case 'cargo':
    case 'composer':
    case 'gem':
    case 'pub':
    case 'maven':
    case 'gradle':
    case 'nuget': {
      const depResult = await checkDependency(namespace, name, context);
      if (!depResult.ok) return depResult;
      exists = depResult.value;
      break;
    }

    case 'file': {
      const filePath = path.join(context.projectRoot, name);
      exists = await cachedFileExists(filePath, context);
      break;
    }

    case 'dir': {
      const dirPath = path.join(context.projectRoot, name);
      exists = await cachedDirExists(dirPath, context);
      break;
    }

    case 'pkg': {
      if (!context.packageJson) {
        const pkgResult = await readJson<Record<string, unknown>>(
          path.join(context.projectRoot, 'package.json')
        );
        if (pkgResult.ok) {
          context.packageJson = pkgResult.value;
        } else {
          context.packageJson = {};
        }
      }
      actualValue = context.packageJson[name] as string | number | boolean | undefined;
      exists = actualValue !== undefined;
      break;
    }

    case 'var': {
      actualValue = context.variables[name];
      exists = actualValue !== undefined;
      break;
    }

    default: {
      const unknownNamespace: unknown = namespace;
      return err({
        code: 'UNKNOWN_NAMESPACE',
        message: `Unknown namespace: ${String(unknownNamespace)}`,
        expression: `${String(unknownNamespace)}:${name}`,
      });
    }
  }

  // Existence check (no operator)
  if (operator === null) {
    const result = negated ? !exists : exists;
    return ok(result);
  }

  // Comparison check
  if (actualValue === undefined) {
    return ok(negated ? true : false);
  }

  let comparisonResult = false;
  switch (operator) {
    case '==':
      // eslint-disable-next-line eqeqeq
      comparisonResult = actualValue == value;
      break;
    case '!=':
      // eslint-disable-next-line eqeqeq
      comparisonResult = actualValue != value;
      break;
    case '>':
      comparisonResult = Number(actualValue) > Number(value);
      break;
    case '<':
      comparisonResult = Number(actualValue) < Number(value);
      break;
    case '>=':
      comparisonResult = Number(actualValue) >= Number(value);
      break;
    case '<=':
      comparisonResult = Number(actualValue) <= Number(value);
      break;
    default: {
      const invalidOperator: unknown = operator;
      return err({
        code: 'INVALID_OPERATOR',
        message: `Invalid operator: ${String(invalidOperator)}`,
        expression: `${namespace}:${name}`,
      });
    }
  }

  return ok(negated ? !comparisonResult : comparisonResult);
}

function applyLogicalOperators(values: boolean[], operators: LogicalOperator[]): boolean {
  if (values.length === 0) {
    return true;
  }

  let groupValue: boolean = values[0] ?? false;
  const groups: boolean[] = [];

  for (let i = 0; i < operators.length; i += 1) {
    const operator = operators[i];
    const nextValue = values[i + 1];

    if (nextValue === undefined) {
      continue;
    }

    if (operator === '&&') {
      groupValue = groupValue && nextValue;
    } else if (operator === '||') {
      groups.push(groupValue);
      groupValue = nextValue;
    }
  }

  groups.push(groupValue);

  return groups.some(Boolean);
}

function formatIdentifier(condition: ParsedCondition): string {
  const prefix = condition.negated ? '!' : '';
  return `${prefix}${condition.identifier.namespace}:${condition.identifier.name}`;
}

/**
 * Evaluate a condition expression against the project context
 */
export async function evaluateConditionExpression(
  expression: string,
  context: ProjectContext
): Promise<Result<EvaluationResult, ConditionError>> {
  const parsedResult = parseConditionExpression(expression);
  if (!parsedResult.ok) return parsedResult;

  const { conditions, operators } = parsedResult.value;

  if (conditions.length === 0) {
    return ok({
      matches: true,
      reason: 'No condition provided, defaulting to include',
      checkedIdentifiers: [],
    });
  }

  const checkedIdentifiers: string[] = [];
  const values: boolean[] = [];

  for (const condition of conditions) {
    const result = await evaluateSingleCondition(condition, context);
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
    checkedIdentifiers.push(formatIdentifier(condition));
  }

  const matches = applyLogicalOperators(values, operators);
  const reason = matches ? 'All conditions satisfied' : 'Condition failed';

  return ok({
    matches,
    reason,
    checkedIdentifiers,
  });
}

/**
 * Determine if a rule should be included based on its when condition
 */
export async function shouldIncludeRule(
  rule: Rule,
  context: ProjectContext
): Promise<Result<boolean, ConditionError>> {
  const when = rule.when?.trim();

  if (!when) {
    return ok(true);
  }

  const evaluation = await evaluateConditionExpression(when, context);
  if (!evaluation.ok) {
    return evaluation;
  }

  return ok(evaluation.value.matches);
}
