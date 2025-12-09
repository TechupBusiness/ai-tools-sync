/**
 * @file Cursor Platform Converter
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
import type { Hook, HookEvent } from '@/parsers/hook.js';
import type { Persona, PersonaTool } from '@/parsers/persona.js';
import type { Rule } from '@/parsers/rule.js';
import type { CursorExtension, TargetType } from '@/parsers/types.js';

import { DEFAULT_TARGETS } from '@/parsers/types.js';
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
  'execute',
  'args',
  'allowedTools',
  'variables',
  'cursor',
];

export function convertCursor(
  input: ParsedPlatformFileInput,
  options: ConvertOptions = {}
): Result<ConversionDetail, ConvertError> {
  const issues: ConversionIssue[] = [];
  const warnings: string[] = [];
  const frontmatter = input.frontmatter ?? {};

  const name = resolveName(frontmatter.name, input.relativePath, options, issues);
  if (!name) {
    return err(new ConvertError('Missing name for Cursor content', issues));
  }

  const targets = normalizeTargets(frontmatter.targets) ?? DEFAULT_TARGETS;

  switch (input.kind) {
    case 'rule':
      return ok(buildRuleConversion({ input, name, targets, warnings, issues }));
    case 'command':
      return ok(buildCommandConversion({ input, name, targets, warnings, issues }));
    case 'persona':
      return ok(buildPersonaConversion({ input, name, targets, warnings, issues }));
    case 'hook':
      return ok(buildHookConversion({ input, name, targets, warnings, issues }));
    default:
      return err(
        new ConvertError(`Unsupported Cursor content kind: ${input.kind}`, [
          ...issues,
          {
            level: 'error',
            message: `Unsupported Cursor kind "${input.kind}"`,
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

  const cursorExtension = buildCursorExtension(fm);
  if (Object.keys(cursorExtension).length > 0) {
    rule.cursor = cursorExtension;
  }

  const conversion: GenericConversion = {
    kind: 'rule',
    frontmatter: rule,
    body: input.body,
    source: { platform: 'cursor', path: input.sourcePath },
    warnings,
  };

  collectWarningsFromExtension(cursorExtension, input, issues, warnings);

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

  const globs = normalizeGlobs(fm.globs);
  if (globs.length > 0) {
    command.globs = globs;
  }

  const rawAllowed = normalizeStringArray(fm.allowedTools);
  const cursorExtension = buildCursorExtension(fm);

  if (rawAllowed.length > 0) {
    const mappedAllowed = mapCursorTools(rawAllowed, issues, warnings, input.relativePath);
    command.allowedTools = mappedAllowed;
    cursorExtension.allowedTools = rawAllowed;
  }

  if (Array.isArray(fm.variables)) {
    const variables = fm.variables
      .filter(
        (variable): variable is { name: unknown; description?: unknown; default?: unknown } =>
          typeof variable === 'object' && variable !== null && 'name' in variable
      )
      .map((variable) => {
        const cmdVar: { name: string; description?: string; default?: string } = {
          name: String(variable.name),
        };
        if (typeof variable.description === 'string') {
          cmdVar.description = variable.description;
        }
        if (typeof variable.default === 'string') {
          cmdVar.default = variable.default;
        }
        return cmdVar;
      });

    if (variables.length > 0) {
      command.variables = variables;
    }
  }

  if (Object.keys(cursorExtension).length > 0) {
    command.cursor = cursorExtension;
  }

  const conversion: GenericConversion = {
    kind: 'command',
    frontmatter: command,
    body: input.body,
    source: { platform: 'cursor', path: input.sourcePath },
    warnings,
  };

  collectWarningsFromExtension(cursorExtension, input, issues, warnings);

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
  if (tools.length > 0) {
    const mappedTools = mapCursorTools(tools, issues, warnings, input.relativePath);
    if (mappedTools.length > 0) {
      persona.tools = mappedTools;
    }
  }

  const cursorExtension = buildCursorExtension(fm);
  if (Object.keys(cursorExtension).length > 0) {
    persona.cursor = cursorExtension;
  }

  const conversion: GenericConversion = {
    kind: 'persona',
    frontmatter: persona,
    body: input.body,
    source: { platform: 'cursor', path: input.sourcePath },
    warnings,
  };

  collectWarningsFromExtension(cursorExtension, input, issues, warnings);

  return { conversion, issues };
}

function buildHookConversion(params: {
  input: ParsedPlatformFileInput;
  name: string;
  targets: TargetType[];
  warnings: string[];
  issues: ConversionIssue[];
}): ConversionDetail {
  const { input, name, targets, warnings, issues } = params;
  const fm = input.frontmatter ?? {};

  const event = isHookEvent(fm.event) ? fm.event : 'UserPromptSubmit';
  const hook: Hook = {
    name,
    targets,
    event,
  };

  if (typeof fm.description === 'string') {
    hook.description = fm.description;
  }

  const cursorExtension = buildCursorExtension(fm);
  if (Object.keys(cursorExtension).length > 0) {
    hook.cursor = cursorExtension;
  }

  const conversion: GenericConversion = {
    kind: 'hook',
    frontmatter: hook,
    body: input.body,
    source: { platform: 'cursor', path: input.sourcePath },
    warnings,
  };

  collectWarningsFromExtension(cursorExtension, input, issues, warnings);

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

function buildCursorExtension(
  fm: Record<string, unknown>
): CursorExtension & Record<string, unknown> {
  const extension: CursorExtension & Record<string, unknown> =
    typeof fm.cursor === 'object' && fm.cursor !== null && !Array.isArray(fm.cursor)
      ? { ...(fm.cursor as Record<string, unknown>) }
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

function mapCursorTools(
  tools: string[],
  issues: ConversionIssue[],
  warnings: string[],
  relativePath: string
): PersonaTool[] {
  const mapped: PersonaTool[] = [];

  for (const tool of tools) {
    const generic = getGenericToolName(tool, 'cursor');
    if (generic && isKnownGenericTool(generic)) {
      mapped.push(generic);
    } else {
      issues.push({
        level: 'warning',
        message: `Unknown Cursor tool "${tool}" preserved as-is`,
        path: relativePath,
      });
      warnings.push(`Unknown Cursor tool "${tool}" preserved as-is`);
    }
  }

  return mapped;
}

function isHookEvent(event: unknown): event is HookEvent {
  const allowed: HookEvent[] = [
    'PreToolUse',
    'PostToolUse',
    'UserPromptSubmit',
    'Notification',
    'Stop',
    'SubagentStop',
    'SessionStart',
    'SessionEnd',
    'PreCompact',
  ];
  return typeof event === 'string' && (allowed as string[]).includes(event);
}

function collectWarningsFromExtension(
  extension: CursorExtension & Record<string, unknown>,
  input: ParsedPlatformFileInput,
  issues: ConversionIssue[],
  warnings: string[]
): void {
  const extensionKeys = Object.keys(extension);
  if (extensionKeys.length === 0) {
    return;
  }

  const unknownKeys = extensionKeys.filter(
    (key) => !['allowedTools', 'globs', 'description', 'alwaysApply'].includes(key)
  );
  if (unknownKeys.length > 0) {
    const message = `Preserved Cursor-specific fields: ${unknownKeys.join(', ')}`;
    issues.push({
      level: 'info',
      message,
      path: input.relativePath,
    });
    warnings.push(...unknownKeys.map((key) => `Preserved Cursor field "${key}"`));
  }
}
