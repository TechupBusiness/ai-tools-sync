import path from 'node:path';

import {
  printError,
  printGeneratedFile,
  printHeader,
  printSummary,
  printWarning,
} from '../output.js';

import type {
  GenerateIssue,
  GenerateOptions,
  GenerateResult,
  GeneratedFile,
  GenericKind,
} from '@/creators/types.js';

import { generate } from '@/creators/generator.js';

export interface CreateCommandOptions extends Omit<GenerateOptions, 'kind' | 'name'> {
  verbose?: boolean;
}

export interface CreateCommandResult {
  success: boolean;
  file?: GeneratedFile;
  issues?: GenerateIssue[];
}

export async function create(
  kind: GenericKind,
  name: string,
  options: CreateCommandOptions = {}
): Promise<CreateCommandResult> {
  printHeader('Create Generic File');

  const generateOptions: GenerateOptions = {
    ...options,
    kind,
    name,
  };

  const result: GenerateResult = await generate(generateOptions);

  if (!result.ok) {
    printError(result.error.message);
    if (result.error.issues) {
      for (const issue of result.error.issues) {
        const prefix = issue.field ? `${issue.field}: ` : '';
        const suggestion = issue.suggestion ? ` (${issue.suggestion})` : '';
        printWarning(`${prefix}${issue.message}${suggestion}`);
      }
    }

    return {
      success: false,
      issues: result.error.issues ?? [],
    };
  }

  const file = result.value;
  const relativePath = path.relative(options.projectRoot ?? process.cwd(), file.path);

  const changeType = options.dryRun ? 'skipped' : options.overwrite ? 'updated' : 'created';
  printGeneratedFile(relativePath, changeType);

  if (file.warnings.length > 0) {
    for (const warning of file.warnings) {
      printWarning(warning);
    }
  }

  printSummary({
    success: true,
    dryRun: options.dryRun,
    message: options.dryRun
      ? `Previewed ${kind} ${relativePath}`
      : `Created ${kind} at ${relativePath}`,
  });

  return {
    success: true,
    file,
  };
}
