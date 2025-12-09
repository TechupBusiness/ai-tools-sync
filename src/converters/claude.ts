/**
 * @file Claude Platform Converter
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
import type { ClaudeExtension, TargetType } from '@/parsers/types.js';

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
  'claude',
];

export function convertClaude(
  input: ParsedPlatformFileInput,
  options: ConvertOptions = {}
): Result<ConversionDetail, ConvertError> {
  const issues: ConversionIssue[] = [];
  const warnings: string[] = [];
  const frontmatter = input.frontmatter ?? {};

  const name = resolveName(frontmatter.name, input.relativePath, options, issues);
  if (!name) {
    return err(new ConvertError('Missing name for Claude content', issues));
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
        new ConvertError(`Unsupported Claude content kind: ${input.kind}`, [
          ...issues,
          {
            level: 'error',
            message: `Unsupported Claude kind "${input.kind}"`,
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

  const claudeExtension = buildClaudeExtension(fm);
  if (Object.keys(claudeExtension).length > 0) {
    rule.claude = claudeExtension;
  }

  const conversion: GenericConversion = {
    kind: 'rule',
    frontmatter: rule,
    body: input.body,
    source: { platform: 'claude', path: input.sourcePath },
    warnings,
  };

  collectWarningFromExtension(claudeExtension, warnings, issues, input.relativePath);

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

  const tools = normalizeStringArray(fm.tools);
  const { genericTools, extensionTools } = mapClaudeTools(
    tools,
    issues,
    warnings,
    input.relativePath
  );
  if (genericTools.length > 0) {
    persona.tools = genericTools;
  }

  const model = typeof fm.model === 'string' ? fm.model : undefined;
  const mappedModel = model ? getGenericModelName(model, 'claude') : undefined;
  const claudeExtension = buildClaudeExtension(fm);

  if (mappedModel) {
    persona.model = mappedModel;
  } else if (model) {
    claudeExtension.model = model;
    warnings.push(`Unknown Claude model "${model}" preserved under claude.model`);
    issues.push({
      level: 'warning',
      message: `Unknown Claude model "${model}" preserved`,
      path: input.relativePath,
    });
  }

  if (extensionTools.length > 0) {
    claudeExtension.tools = extensionTools;
  }

  if (Object.keys(claudeExtension).length > 0) {
    persona.claude = claudeExtension;
  }

  const conversion: GenericConversion = {
    kind: 'persona',
    frontmatter: persona,
    body: input.body,
    source: { platform: 'claude', path: input.sourcePath },
    warnings,
  };

  collectWarningFromExtension(claudeExtension, warnings, issues, input.relativePath);

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
  const { genericTools, extensionTools } = mapClaudeTools(
    tools,
    issues,
    warnings,
    input.relativePath
  );
  if (genericTools.length > 0) {
    command.allowedTools = genericTools;
  }

  const claudeExtension = buildClaudeExtension(fm);
  if (extensionTools.length > 0) {
    claudeExtension.tools = extensionTools;
  }

  if (Object.keys(claudeExtension).length > 0) {
    command.claude = claudeExtension;
  }

  const conversion: GenericConversion = {
    kind: 'command',
    frontmatter: command,
    body: input.body,
    source: { platform: 'claude', path: input.sourcePath },
    warnings,
  };

  collectWarningFromExtension(claudeExtension, warnings, issues, input.relativePath);

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

function buildClaudeExtension(
  fm: Record<string, unknown>
): ClaudeExtension & Record<string, unknown> {
  const extension: ClaudeExtension & Record<string, unknown> =
    typeof fm.claude === 'object' && fm.claude !== null && !Array.isArray(fm.claude)
      ? { ...(fm.claude as Record<string, unknown>) }
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

function mapClaudeTools(
  tools: string[],
  issues: ConversionIssue[],
  warnings: string[],
  relativePath: string
): { genericTools: PersonaTool[]; extensionTools: string[] } {
  const genericTools: PersonaTool[] = [];
  const extensionTools: string[] = [];

  for (const tool of tools) {
    const generic = getGenericToolName(tool, 'claude');
    if (generic && isKnownGenericTool(generic)) {
      genericTools.push(generic);
    } else {
      extensionTools.push(tool);
      warnings.push(`Unknown Claude tool "${tool}" preserved under claude.tools`);
      issues.push({
        level: 'warning',
        message: `Unknown Claude tool "${tool}" preserved`,
        path: relativePath,
      });
    }
  }

  return { genericTools, extensionTools };
}

function collectWarningFromExtension(
  extension: ClaudeExtension & Record<string, unknown>,
  warnings: string[],
  issues: ConversionIssue[],
  relativePath: string
): void {
  const keys = Object.keys(extension);
  if (keys.length === 0) {
    return;
  }

  const preserved = keys.filter((key) => !['tools', 'model'].includes(key));
  if (preserved.length > 0) {
    const message = `Preserved Claude-specific fields: ${preserved.join(', ')}`;
    warnings.push(...preserved.map((key) => `Preserved Claude field "${key}"`));
    issues.push({
      level: 'info',
      message,
      path: relativePath,
    });
  }
}
