/**
 * @file Platform to Generic Converter Orchestrator
 */

import path from 'node:path';

import { convertClaude } from './claude.js';
import { convertCursor } from './cursor.js';
import { convertFactory } from './factory.js';
import {
  ConvertError,
  type ConvertOptions,
  type ConversionIssue,
  type ConvertResult,
  type GenericConversion,
  type ParsedPlatformFileInput,
  type Platform,
  type PlatformFileInput,
} from './types.js';
import { inferNameFromPath } from './utils.js';

import { lintRules } from '@/linters/rule-linter.js';
import { parseCommand } from '@/parsers/command.js';
import { parseFrontmatter } from '@/parsers/frontmatter.js';
import { parseHook } from '@/parsers/hook.js';
import { parsePersona } from '@/parsers/persona.js';
import { parseRule } from '@/parsers/rule.js';
import { DEFAULT_TARGETS, formatParseError } from '@/parsers/types.js';
import { err, ok, type Result } from '@/utils/result.js';
import { serializeYaml } from '@/utils/yaml.js';

type ConverterFn = (
  input: ParsedPlatformFileInput,
  options: ConvertOptions
) => ReturnType<typeof convertCursor>;

type ParsedRuleType = ReturnType<typeof parseRule> extends { ok: true; value: infer R } ? R : never;

const converters: Record<Platform, ConverterFn> = {
  cursor: convertCursor,
  claude: convertClaude,
  factory: convertFactory,
};

export function convertPlatformFile(
  input: PlatformFileInput,
  options: ConvertOptions = {}
): ConvertResult {
  const parsedInputResult = prepareInput(input);
  if (!parsedInputResult.ok) {
    return err(parsedInputResult.error);
  }

  const parsedInput = parsedInputResult.value.input;
  const issues: ConversionIssue[] = [...parsedInputResult.value.issues];

  if (isAlreadyGeneric(parsedInput.relativePath)) {
    const infoIssue: ConversionIssue = {
      level: 'info',
      message: 'File appears to already be in .ai-tool-sync format, skipping conversion',
      path: parsedInput.relativePath,
    };
    return err(new ConvertError(infoIssue.message, [...issues, infoIssue]));
  }

  if (parsedInput.kind === 'mixed') {
    const mixedIssue: ConversionIssue = {
      level: 'warning',
      message: 'File contains multiple sections (mixed); copy to input/ for manual split',
      path: parsedInput.relativePath,
    };
    return err(new ConvertError(mixedIssue.message, [...issues, mixedIssue]));
  }

  if (parsedInput.kind === 'unknown' || parsedInput.kind === 'config') {
    if (!options.includeUnknown) {
      const unknownIssue: ConversionIssue = {
        level: 'error',
        message: `Unknown content kind "${parsedInput.kind}"`,
        path: parsedInput.relativePath,
      };
      return err(new ConvertError(unknownIssue.message, [...issues, unknownIssue]));
    }
    parsedInput.kind = 'rule';
    issues.push({
      level: 'info',
      message: 'Treated unknown content as rule for best-effort conversion',
      path: parsedInput.relativePath,
    });
  }

  const converter = converters[parsedInput.platform];
  if (!converter) {
    const issue: ConversionIssue = {
      level: 'error',
      message: `Unsupported platform "${parsedInput.platform}"`,
      path: parsedInput.relativePath,
    };
    return err(new ConvertError(issue.message, [...issues, issue]));
  }

  const converted = converter(parsedInput, options);
  if (!converted.ok) {
    return err(converted.error);
  }

  const conversionIssues = [...issues, ...converted.value.issues];
  const validated = validateConversion(converted.value.conversion, options, conversionIssues);
  if (!validated.ok) {
    return err(validated.error);
  }

  const finalIssues = validated.value.issues;
  const warnings = finalIssues
    .filter((issue) => issue.level === 'warning')
    .map((issue) => issue.message);

  const conversion: GenericConversion = {
    ...validated.value.conversion,
    warnings: Array.from(new Set([...(validated.value.conversion.warnings ?? []), ...warnings])),
  };

  const errors = finalIssues.filter((issue) => issue.level === 'error');
  if (errors.length > 0) {
    return err(new ConvertError(errors[0]?.message ?? 'Conversion failed', finalIssues));
  }

  if ((options.strict ?? false) && warnings.length > 0) {
    return err(new ConvertError('Conversion warnings present in strict mode', finalIssues));
  }

  return ok([conversion]);
}

function prepareInput(
  input: PlatformFileInput
): Result<{ input: ParsedPlatformFileInput; issues: ConversionIssue[] }, ConvertError> {
  const parseResult = parseFrontmatter<Record<string, unknown>>(input.content);
  if (!parseResult.ok) {
    const issue: ConversionIssue = {
      level: 'error',
      message: parseResult.error.message,
      path: input.relativePath,
    };
    if (parseResult.error.line !== undefined) {
      issue.line = parseResult.error.line;
    }
    if (parseResult.error.column !== undefined) {
      issue.column = parseResult.error.column;
    }
    if (parseResult.error.source !== undefined) {
      issue.value = parseResult.error.source;
    }
    return err(new ConvertError('Failed to parse frontmatter', [issue]));
  }

  const parsed = parseResult.value;
  const issues: ConversionIssue[] = [];

  if (parsed.isEmpty) {
    issues.push({
      level: 'warning',
      message: 'No frontmatter detected; generating minimal metadata',
      path: input.relativePath,
    });
  }

  const parsedInput: ParsedPlatformFileInput = {
    ...input,
    frontmatter: parsed.data ?? {},
    body: parsed.content ?? '',
    hasFrontmatter: !parsed.isEmpty,
    targets: DEFAULT_TARGETS,
  };

  if (
    !parsedInput.frontmatter.name &&
    (input.kind === 'rule' || input.kind === 'persona' || input.kind === 'command')
  ) {
    const inferred = inferNameFromPath(input.relativePath);
    parsedInput.frontmatter.name = inferred;
    issues.push({
      level: 'warning',
      message: 'Name inferred from filename due to missing frontmatter name',
      path: input.relativePath,
      suggestion: `Using "${inferred}"`,
    });
  }

  return ok({ input: parsedInput, issues });
}

function validateConversion(
  conversion: GenericConversion,
  options: ConvertOptions,
  incomingIssues: ConversionIssue[]
): Result<{ conversion: GenericConversion; issues: ConversionIssue[] }, ConvertError> {
  const issues = [...incomingIssues];
  const markdownResult = buildMarkdown(conversion);
  if (!markdownResult.ok) {
    const issue: ConversionIssue = {
      level: 'error',
      message: markdownResult.error.message,
      path: conversion.source.path,
    };
    return err(new ConvertError(issue.message, [...issues, issue]));
  }

  const markdown = markdownResult.value;
  const parseOutcome = parseConverted(conversion.kind, markdown, conversion.source.path);

  if (!parseOutcome.ok) {
    const issue: ConversionIssue = {
      level: 'error',
      message: formatParseError(parseOutcome.error),
      path: conversion.source.path,
    };
    return err(new ConvertError(issue.message, [...issues, issue]));
  }

  if (options.runLint && conversion.kind === 'rule') {
    const parsedRule = parseOutcome.value as ParsedRuleType;
    const lintResult = lintRules([parsedRule], { strict: options.strict ?? false });
    if (!lintResult.ok) {
      const lintIssue: ConversionIssue = {
        level: 'error',
        message: lintResult.error.message,
        path: conversion.source.path,
      };
      return err(new ConvertError(lintIssue.message, [...issues, lintIssue]));
    }

    const lintIssues = lintResult.value.rules.flatMap((rule) =>
      rule.issues.map<ConversionIssue>((lintIssue) => ({
        level:
          lintIssue.severity === 'error'
            ? 'error'
            : lintIssue.severity === 'warning'
              ? 'warning'
              : 'info',
        message: lintIssue.message,
        path: rule.filePath,
      }))
    );

    issues.push(...lintIssues);

    if (!lintResult.value.success) {
      const blocking = lintIssues.find((issue) => issue.level === 'error');
      if (blocking) {
        return err(new ConvertError(blocking.message, issues));
      }
      if (options.strict ?? false) {
        return err(new ConvertError('Lint warnings present in strict mode', issues));
      }
    }
  }

  return ok({ conversion, issues });
}

function buildMarkdown(conversion: GenericConversion) {
  const yaml = serializeYaml(conversion.frontmatter, { sortKeys: false });
  if (!yaml.ok) {
    return err(yaml.error);
  }

  const frontmatter = yaml.value.trimEnd();
  const body = conversion.body?.trimStart() ?? '';

  return ok(`---\n${frontmatter}\n---\n\n${body}`);
}

function parseConverted(kind: GenericConversion['kind'], content: string, filePath: string) {
  switch (kind) {
    case 'rule':
      return parseRule(content, filePath);
    case 'persona':
      return parsePersona(content, filePath);
    case 'command':
      return parseCommand(content, filePath);
    case 'hook':
      return parseHook(content, filePath);
  }

  return err(
    new ConvertError('Unsupported generic kind', [
      {
        level: 'error',
        message: 'Unsupported kind',
        path: filePath,
      },
    ])
  );
}

function isAlreadyGeneric(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join('/');
  return normalized.includes('.ai-tool-sync/');
}
