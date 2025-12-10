import path from 'node:path';

import {
  GenerateError,
  type GenerateIssue,
  type GenerateOptions,
  type GenerateResult,
  type GeneratedFile,
  type GenericKind,
  type Priority,
} from './types.js';

import type { TemplateDefinition } from '@/creators/templates.js';
import type { LintResult } from '@/linters/types.js';
import type { Command } from '@/parsers/command.js';
import type { Hook } from '@/parsers/hook.js';
import type { Persona } from '@/parsers/persona.js';
import type { ParsedRule, Rule } from '@/parsers/rule.js';
import type { TargetType } from '@/parsers/types.js';
import type { ManifestV2 } from '@/utils/manifest.js';

import { getAiPaths, loadConfigWithDefaults, resolveConfigDir } from '@/config/loader.js';
import { applyBodyTemplate, getTemplate } from '@/creators/templates.js';
import { writeGeneratedFile } from '@/creators/writer.js';
import { toSlug } from '@/generators/base.js';
import { parseCommand } from '@/parsers/command.js';
import { parseHook } from '@/parsers/hook.js';
import { parsePersona } from '@/parsers/persona.js';
import { parseRule } from '@/parsers/rule.js';
import { DEFAULT_TARGETS as PARSER_DEFAULT_TARGETS, validateTargets } from '@/parsers/types.js';
import { serializeFrontmatter } from '@/transformers/frontmatter.js';
import { isGenericModel, mapModel } from '@/transformers/model-mapper.js';
import { isKnownGenericTool, mapTool } from '@/transformers/tool-mapper.js';
import { updateToolFolderGitignores } from '@/utils/gitignore.js';
import { err, ok } from '@/utils/result.js';

interface NormalizedName {
  slug: string;
  issues: GenerateIssue[];
}

interface NormalizedTargets {
  targets: TargetType[];
  issues: GenerateIssue[];
}

interface NormalizedList {
  values: string[];
  warnings: string[];
}

interface NormalizedPriority {
  value: Priority;
  issues: GenerateIssue[];
}

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const configDirName = options.configDir ?? (await resolveConfigDir({ projectRoot }));
  const config = await loadConfigWithDefaults({ projectRoot, configDir: configDirName });

  const template = getTemplate(options.kind, options.template);
  if (!template) {
    return err(
      new GenerateError('Unknown template', [
        {
          level: 'error',
          field: 'template',
          message: `Template not found: ${options.template ?? `${options.kind}/basic`}`,
          suggestion: 'Use a known template id such as rule/basic.',
        },
      ])
    );
  }

  const nameResult = normalizeName(options.name);
  if (hasError(nameResult.issues)) {
    return err(new GenerateError('Invalid name', nameResult.issues));
  }

  const targetsResult = normalizeTargets(
    options.targets ?? config.targets,
    template.frontmatter.targets
  );
  if (hasError(targetsResult.issues)) {
    return err(new GenerateError('Invalid targets', targetsResult.issues));
  }

  const templateFrontmatter = template.frontmatter as Partial<Rule | Persona | Command | Hook>;
  const templateTools = extractTools(templateFrontmatter);
  const templateModel = (templateFrontmatter as Partial<Persona>).model;

  const globsResult = normalizeList(options.globs);
  const toolsResult = normalizeTools(options.tools ?? templateTools, targetsResult.targets);
  const modelResult = normalizeModel(options.model ?? templateModel, targetsResult.targets);
  const priorityResult = normalizePriority(options.priority);
  if (hasError(priorityResult.issues)) {
    return err(new GenerateError('Invalid priority', priorityResult.issues));
  }

  const description = options.description?.trim();
  const body = selectBody(options.body, template, nameResult.slug);

  const { frontmatter, issues, warnings } = buildFrontmatter({
    kind: options.kind,
    name: nameResult.slug,
    ...(description !== undefined ? { description } : {}),
    targets: targetsResult.targets,
    globs: globsResult.values,
    tools: toolsResult.values,
    ...(modelResult.value !== undefined ? { model: modelResult.value } : {}),
    ...(options.execute !== undefined ? { execute: options.execute } : {}),
    priority: priorityResult.value,
    template,
  });

  const errorIssues = [
    ...issues,
    ...nameResult.issues,
    ...targetsResult.issues,
    ...priorityResult.issues,
  ];
  if (hasError(errorIssues)) {
    return err(new GenerateError('Invalid options', errorIssues));
  }

  const content = buildMarkdown(frontmatter, body);
  const parsedResult = parseGeneratedContent(options.kind, content);

  let parsedFrontmatter: Rule | Persona | Command | Hook;
  let parsedBody: string;
  let parseWarnings: string[] = [];
  const parsedForLint = parsedResult.ok ? (parsedResult.value as ParsedRule) : undefined;

  if (parsedResult.ok) {
    parsedFrontmatter = parsedResult.value.frontmatter;
    parsedBody = parsedResult.value.content;
  } else {
    const personaToolWarnings = getPersonaToolWarnings(options.kind, parsedResult.error);
    if (personaToolWarnings) {
      parseWarnings = personaToolWarnings;
      parsedFrontmatter = frontmatter as unknown as Persona;
      parsedBody = body;
    } else {
      return err(new GenerateError(parsedResult.error.message, toIssues(parsedResult.error)));
    }
  }

  const lintWarnings =
    options.runLint && options.kind === 'rule' && parsedForLint !== undefined
      ? await runRuleLint(parsedForLint)
      : [];

  const aiPaths = getAiPaths(projectRoot, configDirName);
  const targetPath = resolveTargetPath(options.kind, aiPaths, nameResult.slug);
  const writeResult = await writeGeneratedFile(targetPath, content, {
    ...(options.overwrite !== undefined ? { overwrite: options.overwrite } : {}),
    ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
  });

  if (!writeResult.ok) {
    return err(writeResult.error);
  }

  const gitignoreWarnings = await updateGitignoreIfNeeded({
    projectRoot,
    aiPaths,
    ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
  });

  const allWarnings = [
    ...warnings,
    ...globsResult.warnings,
    ...toolsResult.warnings,
    ...modelResult.warnings,
    ...lintWarnings,
    ...gitignoreWarnings,
    ...writeResult.value.warnings,
  ];

  const generated: GeneratedFile = {
    kind: options.kind,
    path: targetPath,
    frontmatter: parsedFrontmatter,
    body: parsedBody,
    warnings: [...allWarnings, ...parseWarnings],
  };

  return ok(generated);
}

function normalizeName(name: string): NormalizedName {
  const issues: GenerateIssue[] = [];
  const trimmed = name.trim();
  if (!trimmed) {
    issues.push({
      level: 'error',
      field: 'name',
      message: 'Name is required',
      suggestion: 'Provide a non-empty name (e.g., "database rule").',
    });
    return { slug: '', issues };
  }

  const slug = toSlug(trimmed);
  if (!slug) {
    issues.push({
      level: 'error',
      field: 'name',
      message: 'Name must include alphanumeric characters',
      suggestion: 'Use letters and numbers; underscores and spaces are converted to hyphens.',
    });
    return { slug, issues };
  }

  if (slug !== trimmed) {
    issues.push({
      level: 'warning',
      field: 'name',
      message: `Name normalized to slug: ${slug}`,
    });
  }

  return { slug, issues };
}

function normalizeTargets(
  targets: string[] | undefined,
  templateTargets?: string[]
): NormalizedTargets {
  const issues: GenerateIssue[] = [];
  const baseTargets = targets ?? templateTargets ?? PARSER_DEFAULT_TARGETS;
  const normalized = baseTargets.map((t) => t.toLowerCase().trim()).filter(Boolean);
  const validation = validateTargets(normalized);

  if (validation.length > 0) {
    for (const error of validation) {
      issues.push({
        level: 'error',
        field: error.path,
        message: error.message,
      });
    }
  }

  return {
    targets: validation.length === 0 ? (normalized as TargetType[]) : PARSER_DEFAULT_TARGETS,
    issues,
  };
}

function normalizeList(values?: string[]): NormalizedList {
  if (!values) {
    return { values: [], warnings: [] };
  }

  const flattened = values.flatMap((value) => value.split(/[,\s]+/));
  const cleaned = flattened.map((v) => v.trim()).filter(Boolean);
  return { values: [...new Set(cleaned)], warnings: [] };
}

function normalizeTools(values: string[] | undefined, targets: TargetType[]): NormalizedList {
  if (!values || values.length === 0) {
    return { values: [], warnings: [] };
  }

  const base = normalizeList(values);
  const normalizedValues = [...new Set(base.values.map((tool) => tool.toLowerCase()))];
  const warningSet = new Set<string>(base.warnings);

  for (const tool of normalizedValues) {
    if (!isKnownGenericTool(tool)) {
      warningSet.add(
        `Tool '${tool}' is not a known generic tool; kept as-is. If intended, consider adding a mapping or filing an issue.`
      );
    }

    for (const target of targets) {
      const mapped = mapTool(tool, target, { preserveUnknown: false });
      if (mapped === undefined) {
        warningSet.add(`Tool '${tool}' may not map to target '${target}' (preserved).`);
      }
    }
  }

  return { values: normalizedValues, warnings: [...warningSet] };
}

function normalizePriority(priority?: Priority): NormalizedPriority {
  if (!priority) {
    return { value: 'medium', issues: [] };
  }

  if (priority === 'low' || priority === 'medium' || priority === 'high') {
    return { value: priority, issues: [] };
  }

  return {
    value: 'medium',
    issues: [
      {
        level: 'error',
        field: 'priority',
        message: `Invalid priority: ${String(priority)}`,
        suggestion: 'Use one of: low, medium, high.',
      },
    ],
  };
}

interface NormalizedModel {
  value?: string;
  warnings: string[];
}

function normalizeModel(
  model: string | undefined,
  targets: TargetType[],
  templateDefault?: string
): NormalizedModel {
  const warningSet = new Set<string>();
  const resolved = model ?? templateDefault;

  if (resolved === undefined) {
    return { warnings: [] };
  }

  const normalized = isGenericModel(resolved) ? resolved.toLowerCase() : resolved.trim();

  if (!isGenericModel(normalized)) {
    warningSet.add(`Model '${normalized}' may not map to all targets (preserved).`);
  }

  for (const target of targets) {
    const mapped = mapModel(normalized, target);
    if (mapped === normalized && !isGenericModel(normalized)) {
      warningSet.add(`Model '${normalized}' kept for target '${target}' (no mapping found).`);
    }
  }

  return { value: normalized, warnings: [...warningSet] };
}

function selectBody(
  body: string | undefined,
  template: TemplateDefinition<GenericKind>,
  name: string
): string {
  if (body !== undefined) {
    return body;
  }
  return applyBodyTemplate(template.body, name);
}

function buildFrontmatter(input: {
  kind: GenericKind;
  name: string;
  description?: string;
  targets: TargetType[];
  globs: string[];
  tools: string[];
  model?: string;
  execute?: string;
  priority: Priority;
  template: TemplateDefinition<GenericKind>;
}): {
  frontmatter: Record<string, unknown>;
  issues: GenerateIssue[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const issues: GenerateIssue[] = [];
  const trimmedDescription = input.description?.trim();

  if (input.kind === 'rule') {
    const templateFrontmatter = input.template.frontmatter as Partial<Rule>;
    const frontmatter: Record<string, unknown> = {
      ...templateFrontmatter,
      name: input.name,
      targets: input.targets,
      always_apply: templateFrontmatter.always_apply ?? false,
      globs: input.globs.length > 0 ? input.globs : (templateFrontmatter.globs ?? []),
      priority: input.priority,
    };

    if (trimmedDescription) {
      frontmatter.description = trimmedDescription;
    }

    if (templateFrontmatter.version) {
      frontmatter.version = templateFrontmatter.version;
    }

    return { frontmatter, issues, warnings };
  }

  if (input.kind === 'persona') {
    const templateFrontmatter = input.template.frontmatter as Partial<Persona>;
    const templateToolsValue: unknown = templateFrontmatter.tools;
    const templateTools = isStringArray(templateToolsValue) ? templateToolsValue : undefined;
    const tools = input.tools.length > 0 ? input.tools : (templateTools ?? []);
    const frontmatter: Record<string, unknown> = {
      ...templateFrontmatter,
      name: input.name,
      targets: input.targets,
      tools,
      model: input.model ?? templateFrontmatter.model ?? 'default',
    };

    if (trimmedDescription) {
      frontmatter.description = trimmedDescription;
    }

    if (templateFrontmatter.version) {
      frontmatter.version = templateFrontmatter.version;
    }

    return { frontmatter, issues, warnings };
  }

  if (input.kind === 'command') {
    const templateFrontmatter = input.template.frontmatter as Partial<Command>;
    if (!input.execute) {
      issues.push({
        level: 'error',
        field: 'execute',
        message: 'Command execute value is required',
        suggestion: 'Provide an execute script or command (e.g., "npm run lint").',
      });
    }

    const frontmatter: Record<string, unknown> = {
      ...templateFrontmatter,
      name: input.name,
      targets: input.targets,
      execute: input.execute,
    };

    if (trimmedDescription) {
      frontmatter.description = trimmedDescription;
    }

    if (input.globs.length > 0) {
      frontmatter.globs = input.globs;
    } else if (templateFrontmatter.globs) {
      frontmatter.globs = templateFrontmatter.globs;
    }

    if (input.tools.length > 0) {
      frontmatter.allowedTools = input.tools;
    }

    if (templateFrontmatter.version) {
      frontmatter.version = templateFrontmatter.version;
    }

    return { frontmatter, issues, warnings };
  }

  // hook
  const templateFrontmatter = input.template.frontmatter as Partial<Hook>;
  const frontmatter: Record<string, unknown> = {
    ...templateFrontmatter,
    name: input.name,
    targets: input.targets,
  };

  if (trimmedDescription) {
    frontmatter.description = trimmedDescription;
  }

  if (templateFrontmatter.version) {
    frontmatter.version = templateFrontmatter.version;
  }

  return { frontmatter, issues, warnings };
}

function buildMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  const serialized = serializeFrontmatter(frontmatter);
  const normalizedBody = body.trimEnd();
  return `---\n${serialized}\n---\n\n${normalizedBody}\n`;
}

function parseGeneratedContent(kind: GenericKind, content: string) {
  switch (kind) {
    case 'rule':
      return parseRule(content);
    case 'persona':
      return parsePersona(content);
    case 'command':
      return parseCommand(content);
    case 'hook':
      return parseHook(content);
  }
}

function resolveTargetPath(
  kind: GenericKind,
  paths: ReturnType<typeof getAiPaths>,
  slug: string
): string {
  switch (kind) {
    case 'rule':
      return path.join(paths.rulesDir, `${slug}.md`);
    case 'persona':
      return path.join(paths.personasDir, `${slug}.md`);
    case 'command':
      return path.join(paths.commandsDir, `${slug}.md`);
    case 'hook':
      return path.join(paths.hooksDir, `${slug}.md`);
  }
}

function hasError(issues: GenerateIssue[]): boolean {
  return issues.some((issue) => issue.level === 'error');
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function hasValidationErrors(
  error: unknown
): error is { validationErrors: Array<{ path: string; message: string }> } {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'validationErrors' in error &&
    Array.isArray((error as { validationErrors?: unknown }).validationErrors)
  );
}

function toIssues(error: unknown): GenerateIssue[] {
  if (hasValidationErrors(error)) {
    return error.validationErrors.map<GenerateIssue>((validation) => ({
      level: 'error',
      field: validation.path,
      message: validation.message,
    }));
  }

  const message = error instanceof Error ? error.message : 'Generation failed';
  return [
    {
      level: 'error',
      message,
    },
  ];
}

function getPersonaToolWarnings(kind: GenericKind, error: unknown): string[] | null {
  if (kind !== 'persona') {
    return null;
  }

  if (!hasValidationErrors(error)) {
    return null;
  }

  const validations = error.validationErrors;
  if (!validations.length) {
    return null;
  }

  if (validations.some((v) => typeof v.path !== 'string' || !v.path.startsWith('tools'))) {
    return null;
  }

  return validations.map((validation) => {
    const path = validation.path ?? 'tools';
    const message = validation.message ?? 'Unknown tool';
    return `Tool warning (${path}): ${message} (kept as-is).`;
  });
}

function extractTools(frontmatter: Partial<Rule | Persona | Command | Hook>): string[] | undefined {
  const value = (frontmatter as { tools?: unknown }).tools;
  return isStringArray(value) ? value : undefined;
}

function ensureTrailingSlash(value: string): string {
  if (!value) {
    return value;
  }
  return value.endsWith('/') ? value : `${value}/`;
}

async function updateGitignoreIfNeeded(params: {
  projectRoot: string;
  aiPaths: ReturnType<typeof getAiPaths>;
  dryRun?: boolean;
}): Promise<string[]> {
  const warnings: string[] = [];
  const aiDirRelative = path.relative(params.projectRoot, params.aiPaths.aiDir);
  const topLevel = aiDirRelative.split(path.sep)[0] ?? '';
  const managedFolders = new Set(['.cursor', '.claude', '.factory']);

  if (!managedFolders.has(topLevel)) {
    return warnings;
  }

  const directories = [
    params.aiPaths.rulesDir,
    params.aiPaths.personasDir,
    params.aiPaths.commandsDir,
    params.aiPaths.hooksDir,
  ]
    .map((dir) => path.relative(params.projectRoot, dir))
    .filter((dir) => dir && !dir.startsWith('..'))
    .map(ensureTrailingSlash);

  if (directories.length === 0) {
    return warnings;
  }

  const manifest: ManifestV2 = {
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    files: [],
    directories,
  };

  try {
    const result = await updateToolFolderGitignores(params.projectRoot, manifest, {
      ...(params.dryRun !== undefined ? { dryRun: params.dryRun } : {}),
    });

    if (!result.ok) {
      warnings.push(`Failed to update .gitignore for ${topLevel}: ${result.error.message}`);
      return warnings;
    }

    for (const folderResult of result.value) {
      if (!folderResult.changed && !folderResult.created) {
        continue;
      }

      const action = params.dryRun ? 'Would update' : folderResult.created ? 'Created' : 'Updated';
      warnings.push(
        `${action} ${folderResult.folder}/.gitignore with: ${folderResult.paths.join(', ')}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown gitignore error';
    warnings.push(`Failed to update .gitignore: ${message}`);
  }

  return warnings;
}

async function runRuleLint(rule: ParsedRule): Promise<string[]> {
  try {
    const module = await import('@/linters/rule-linter.js');
    const lintRulesFn = module.lintRules;

    if (!lintRulesFn) {
      return ['Rule lint not available, skipping: lintRules not found'];
    }

    const lintResult = await Promise.resolve(lintRulesFn([rule]));
    if (!lintResult.ok) {
      return [`Rule lint failed: ${lintResult.error.message}`];
    }
    return lintIssuesToWarnings(lintResult.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown lint error';
    return [`Rule lint not available, skipping: ${message}`];
  }
}

function lintIssuesToWarnings(result: LintResult): string[] {
  const warnings: string[] = [];
  for (const file of result.rules) {
    for (const issue of file.issues) {
      const prefix = issue.path ? `${issue.path}: ` : '';
      warnings.push(`Lint ${issue.severity} in ${file.filePath}: ${prefix}${issue.message}`);
    }
  }
  return warnings;
}
