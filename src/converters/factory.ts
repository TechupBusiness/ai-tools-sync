/**
 * @file Factory Platform Converter
 */

import { ConvertError } from './types.js';
import {
  coerceBoolean,
  inferNameFromPath,
  normalizeGlobs,
  normalizeStringArray,
  normalizeTargets,
} from './utils.js';

import type {
  ConvertOptions,
  ConversionIssue,
  GenericConversion,
  ParsedPlatformFileInput,
} from './types.js';
import type { Command } from '@/parsers/command.js';
import type { Persona, PersonaTool } from '@/parsers/persona.js';
import type { Rule } from '@/parsers/rule.js';
import type { FactoryExtension, TargetType } from '@/parsers/types.js';

import { DEFAULT_TARGETS } from '@/parsers/types.js';
import { getGenericModelName } from '@/transformers/model-mapper.js';
import { getGenericToolName, isKnownGenericTool } from '@/transformers/tool-mapper.js';
import { err, ok, type Result } from '@/utils/result.js';

type ConversionDetail = { conversion: GenericConversion; issues: ConversionIssue[] };

const GENERIC_FIELDS = [
  'name',
  'description',
  'globs',
  'always_apply',
  'alwaysApply',
  'targets',
  'version',
  'tools',
  'model',
  'factory',
  'reasoningEffort',
  'allowed-tools',
];

export function convertFactory(
  input: ParsedPlatformFileInput,
  options: ConvertOptions = {}
): Result<ConversionDetail, ConvertError> {
  const issues: ConversionIssue[] = [];
  const warnings: string[] = [];
  const frontmatter = input.frontmatter ?? {};

  const name = resolveName(frontmatter.name, input.relativePath, options, issues);
  if (!name) {
    return err(new ConvertError('Missing name for Factory content', issues));
  }

  const targets = normalizeTargets(frontmatter.targets) ?? DEFAULT_TARGETS;

  switch (input.kind) {
    case 'rule':
      return ok(buildRuleConversion({ input, name, targets, warnings, issues }));
    case 'persona':
      return ok(buildPersonaConversion({ input, name, targets, warnings, issues }));
    case 'command':
      return ok(buildCommandConversion({ input, name, targets, warnings, issues }));
    default:
      return err(
        new ConvertError(`Unsupported Factory content kind: ${input.kind}`, [
          ...issues,
          {
            level: 'error',
            message: `Unsupported Factory kind "${input.kind}"`,
            path: input.relativePath,
          },
        ])
      );
  }
}

function buildRuleConversion(params: {
  input: ParsedPlatformFileInput;
  name: string;
  targets: TargetType[];
  warnings: string[];
  issues: ConversionIssue[];
}): ConversionDetail {
  const { input, name, targets, warnings, issues } = params;
  const fm = input.frontmatter ?? {};

  const rule: Rule = {
    name,
    targets,
  };

  if (typeof fm.description === 'string') {
    rule.description = fm.description;
  }

  const alwaysApply = coerceBoolean(fm.always_apply ?? fm.alwaysApply);
  if (alwaysApply !== undefined) {
    rule.always_apply = alwaysApply;
  }

  const globs = normalizeGlobs(fm.globs);
  if (globs.length > 0) {
    rule.globs = globs;
  }

  const factoryExtension = buildFactoryExtension(fm);
  if (Object.keys(factoryExtension).length > 0) {
    rule.factory = factoryExtension;
  }

  const conversion: GenericConversion = {
    kind: 'rule',
    frontmatter: rule,
    body: input.body,
    source: { platform: 'factory', path: input.sourcePath },
    warnings,
  };

  collectWarnings(factoryExtension, warnings, issues, input.relativePath);

  return { conversion, issues };
}

function buildPersonaConversion(params: {
  input: ParsedPlatformFileInput;
  name: string;
  targets: TargetType[];
  warnings: string[];
  issues: ConversionIssue[];
}): ConversionDetail {
  const { input, name, targets, warnings, issues } = params;
  const fm = input.frontmatter ?? {};

  const persona: Persona = {
    name,
    targets,
  };

  if (typeof fm.description === 'string') {
    persona.description = fm.description;
  }

  const tools = normalizeStringArray(fm.tools ?? fm['allowed-tools']);
  const { genericTools, extensionTools } = mapFactoryTools(
    tools,
    issues,
    warnings,
    input.relativePath
  );
  if (genericTools.length > 0) {
    persona.tools = genericTools;
  }

  const model = typeof fm.model === 'string' ? fm.model : undefined;
  const mappedModel = model ? getGenericModelName(model, 'factory') : undefined;
  const factoryExtension = buildFactoryExtension(fm);

  if (mappedModel) {
    persona.model = mappedModel;
  } else if (model) {
    factoryExtension.model = model;
    warnings.push(`Unknown Factory model "${model}" preserved under factory.model`);
    issues.push({
      level: 'warning',
      message: `Unknown Factory model "${model}" preserved`,
      path: input.relativePath,
    });
  }

  const reasoningEffort = fm.reasoningEffort;
  if (isReasoningEffort(reasoningEffort)) {
    factoryExtension.reasoningEffort = reasoningEffort;
  }

  if (Array.isArray(fm['allowed-tools'])) {
    factoryExtension['allowed-tools'] = fm['allowed-tools'] as string[];
  } else if (extensionTools.length > 0) {
    factoryExtension['allowed-tools'] = extensionTools;
  }

  if (Object.keys(factoryExtension).length > 0) {
    persona.factory = factoryExtension;
  }

  const conversion: GenericConversion = {
    kind: 'persona',
    frontmatter: persona,
    body: input.body,
    source: { platform: 'factory', path: input.sourcePath },
    warnings,
  };

  collectWarnings(factoryExtension, warnings, issues, input.relativePath);

  return { conversion, issues };
}

function buildCommandConversion(params: {
  input: ParsedPlatformFileInput;
  name: string;
  targets: TargetType[];
  warnings: string[];
  issues: ConversionIssue[];
}): ConversionDetail {
  const { input, name, targets, warnings, issues } = params;
  const fm = input.frontmatter ?? {};

  const command: Command = {
    name,
    targets,
  };

  if (typeof fm.description === 'string') {
    command.description = fm.description;
  }
  if (typeof fm.execute === 'string') {
    command.execute = fm.execute;
  }

  const tools = normalizeStringArray(fm.tools);
  const { genericTools, extensionTools } = mapFactoryTools(
    tools,
    issues,
    warnings,
    input.relativePath
  );
  if (genericTools.length > 0) {
    command.allowedTools = genericTools;
  }

  const factoryExtension = buildFactoryExtension(fm);
  if (extensionTools.length > 0) {
    factoryExtension.tools = extensionTools;
  }

  if (Object.keys(factoryExtension).length > 0) {
    command.factory = factoryExtension;
  }

  const conversion: GenericConversion = {
    kind: 'command',
    frontmatter: command,
    body: input.body,
    source: { platform: 'factory', path: input.sourcePath },
    warnings,
  };

  collectWarnings(factoryExtension, warnings, issues, input.relativePath);

  return { conversion, issues };
}

function resolveName(
  value: unknown,
  relativePath: string,
  options: ConvertOptions,
  issues: ConversionIssue[]
): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (options.inferNameFromPath !== false) {
    const inferred = inferNameFromPath(relativePath);
    issues.push({
      level: 'warning',
      message: 'Name not found in frontmatter, inferred from filename',
      path: relativePath,
      suggestion: `Using "${inferred}"`,
    });
    return inferred;
  }

  issues.push({
    level: 'error',
    message: 'Name is required but missing',
    path: relativePath,
  });
  return undefined;
}

function buildFactoryExtension(
  fm: Record<string, unknown>
): FactoryExtension & Record<string, unknown> {
  const extension: FactoryExtension & Record<string, unknown> =
    typeof fm.factory === 'object' && fm.factory !== null && !Array.isArray(fm.factory)
      ? { ...(fm.factory as Record<string, unknown>) }
      : {};

  const extras = collectExtras(fm, GENERIC_FIELDS);
  for (const [key, value] of Object.entries(extras)) {
    extension[key] = value;
  }

  return extension;
}

function collectExtras(
  frontmatter: Record<string, unknown>,
  exclude: string[]
): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!exclude.includes(key)) {
      extras[key] = value;
    }
  }
  return extras;
}

function mapFactoryTools(
  tools: string[],
  issues: ConversionIssue[],
  warnings: string[],
  relativePath: string
): { genericTools: PersonaTool[]; extensionTools: string[] } {
  const genericTools: PersonaTool[] = [];
  const extensionTools: string[] = [];

  for (const tool of tools) {
    const generic = getGenericToolName(tool, 'factory');
    if (generic && isKnownGenericTool(generic)) {
      genericTools.push(generic);
    } else {
      extensionTools.push(tool);
      warnings.push(`Unknown Factory tool "${tool}" preserved under factory.tools`);
      issues.push({
        level: 'warning',
        message: `Unknown Factory tool "${tool}" preserved`,
        path: relativePath,
      });
    }
  }

  return { genericTools, extensionTools };
}

function collectWarnings(
  extension: FactoryExtension & Record<string, unknown>,
  warnings: string[],
  issues: ConversionIssue[],
  relativePath: string
): void {
  const keys = Object.keys(extension);
  if (keys.length === 0) {
    return;
  }

  const preserved = keys.filter(
    (key) => !['tools', 'model', 'reasoningEffort', 'allowed-tools'].includes(key)
  );
  if (preserved.length > 0) {
    const message = `Preserved Factory-specific fields: ${preserved.join(', ')}`;
    warnings.push(...preserved.map((key) => `Preserved Factory field "${key}"`));
    issues.push({
      level: 'info',
      message,
      path: relativePath,
    });
  }
}

type ReasoningEffort = NonNullable<FactoryExtension['reasoningEffort']>;

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return value === 'low' || value === 'medium' || value === 'high';
}
