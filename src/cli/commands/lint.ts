/**
 * @file Lint Command
 */

/* eslint-disable no-console */

import * as path from 'node:path';

import { loadConfig } from '../../config/loader.js';
import { lintRules, summarizeRuleResults, getEnabledLintRules } from '../../linters/rule-linter.js';
import { getAllLintRules, getLintRuleById } from '../../linters/rules/index.js';
import {
  schemaComplianceIssueFromParseError,
  schemaComplianceIssuesFromValidation,
} from '../../linters/rules/schema-compliance.js';
import { createLocalLoader } from '../../loaders/local.js';
import {
  printHeader,
  printSubHeader,
  printSuccess,
  printWarning,
  printError,
  printSummary,
  printNewLine,
  printKeyValue,
} from '../output.js';

import type { LintOptions, LintResult, LintIssue, RuleLintResult } from '../../linters/types.js';
import type { LoadError } from '../../loaders/base.js';

/**
 * Options for the lint command
 */
export interface LintCommandOptions extends LintOptions {
  /** Project root directory */
  projectRoot?: string;
  /** Configuration directory name */
  configDir?: string;
  /** Enable verbose output */
  verbose?: boolean;
  /** List available lint rules */
  listRules?: boolean;
}

/**
 * Execute the lint command
 */
export async function lint(options: LintCommandOptions = {}): Promise<LintResult> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());

  // List rules mode
  if (options.listRules) {
    printHeader('Available Lint Rules');
    const rules = getAllLintRules();
    for (const rule of rules) {
      printKeyValue(rule.id, `[${rule.defaultSeverity}] ${rule.description}`);
    }
    return emptyLintResult();
  }

  printHeader('Lint Rules');

  // Load config
  const configResult = await loadConfig({ projectRoot, configDir: options.configDir });
  if (!configResult.ok) {
    printError(`Failed to load configuration: ${configResult.error.message}`);
    return failureLintResult();
  }

  const config = configResult.value;

  // Load rules
  printSubHeader('Loading rules');
  const localLoader = createLocalLoader();
  const loadResult = await localLoader.load(config.aiDir, {
    basePath: config.projectRoot,
    continueOnError: true,
  });

  if (loadResult.rules.length === 0 && (!loadResult.errors || loadResult.errors.length === 0)) {
    printWarning('No rules found to lint');
    return emptyLintResult();
  }

  printSuccess(`Found ${loadResult.rules.length} rule(s)`);

  // Determine enabled lint rules and surface unknown IDs
  const unknownRuleIds = (options.rules ?? []).filter((id) => !getLintRuleById(id));
  if (unknownRuleIds.length > 0) {
    printWarning(`Unknown lint rule ID(s): ${unknownRuleIds.join(', ')} (skipping)`);
  }

  const lintOptions: LintOptions = {};
  if (options.strict !== undefined) lintOptions.strict = options.strict;
  if (options.rules && options.rules.length > 0) lintOptions.rules = options.rules;
  if (options.ignore && options.ignore.length > 0) lintOptions.ignore = options.ignore;
  if (options.includeInfo !== undefined) lintOptions.includeInfo = options.includeInfo;

  const enabledLintRules = getEnabledLintRules(lintOptions);
  if (enabledLintRules.length === 0) {
    printWarning('No lint rules enabled after filters - skipping lint checks');
  }

  // Run linter
  printSubHeader('Running lint checks');

  const lintResult = lintRules(loadResult.rules, lintOptions);

  if (!lintResult.ok) {
    printError(`Linting failed: ${lintResult.error.message}`);
    return failureLintResult();
  }

  const parseIssueResults = buildParseErrorResults(loadResult.errors);
  let combinedResults: RuleLintResult[] = lintResult.value.rules;

  if (parseIssueResults.length > 0) {
    combinedResults = [...parseIssueResults, ...combinedResults];
  }

  const summary = summarizeRuleResults(combinedResults);
  const success = (options.strict ? summary.errors + summary.warnings : summary.errors) === 0;
  const finalResult: LintResult = {
    rules: combinedResults,
    summary,
    success,
  };

  // Print results
  for (const ruleResult of finalResult.rules) {
    if (ruleResult.issues.length === 0) {
      if (options.verbose) {
        printSuccess(`${ruleResult.filePath}: OK`);
      }
      continue;
    }

    printNewLine();
    printSubHeader(ruleResult.filePath);

    for (const issue of ruleResult.issues) {
      printLintIssue(issue);
    }
  }

  // Summary
  printNewLine();
  printSummary({
    success: finalResult.success,
    message: finalResult.success
      ? `Linted ${finalResult.summary.filesLinted} file(s) with no errors`
      : `Found ${finalResult.summary.errors} error(s), ${finalResult.summary.warnings} warning(s)`,
  });

  if (options.verbose) {
    printKeyValue('Files linted', String(finalResult.summary.filesLinted));
    printKeyValue('Files with issues', String(finalResult.summary.filesWithIssues));
    printKeyValue('Errors', String(finalResult.summary.errors));
    printKeyValue('Warnings', String(finalResult.summary.warnings));
    if (options.includeInfo) {
      printKeyValue('Info', String(finalResult.summary.info));
    }
  }

  return finalResult;
}

/**
 * Print a lint issue with appropriate formatting
 */
function printLintIssue(issue: LintIssue): void {
  const prefix = issue.path ? `${issue.path}: ` : '';
  const message = `${prefix}${issue.message} (${issue.ruleId})`;

  switch (issue.severity) {
    case 'error':
      printError(message);
      break;
    case 'warning':
      printWarning(message);
      break;
    case 'info':
      console.log(`  ℹ ${message}`);
      break;
  }

  if (issue.suggestion) {
    console.log(`    → ${issue.suggestion}`);
  }
}

function emptyLintResult(): LintResult {
  return {
    rules: [],
    summary: { errors: 0, warnings: 0, info: 0, filesLinted: 0, filesWithIssues: 0 },
    success: true,
  };
}

function failureLintResult(): LintResult {
  return {
    rules: [],
    summary: { errors: 1, warnings: 0, info: 0, filesLinted: 0, filesWithIssues: 0 },
    success: false,
  };
}

function buildParseErrorResults(errors?: LoadError[]): RuleLintResult[] {
  if (!errors) {
    return [];
  }

  const parseErrors = errors.filter((error) => error.type === 'rule');
  const results: RuleLintResult[] = [];

  for (const error of parseErrors) {
    const parseError = error.parseError;
    let issues: LintIssue[] = [];

    if (parseError?.validationErrors && parseError.validationErrors.length > 0) {
      issues = schemaComplianceIssuesFromValidation(parseError.validationErrors, parseError);
    } else if (parseError) {
      issues = [schemaComplianceIssueFromParseError(parseError)];
    } else {
      issues = [
        {
          ruleId: 'schema-compliance',
          severity: 'error',
          message: error.message,
        },
      ];
    }

    const hasErrors = issues.some((i) => i.severity === 'error');
    const hasWarnings = issues.some((i) => i.severity === 'warning');

    results.push({
      filePath: error.path,
      ruleName: parseError?.filePath ?? error.path,
      issues,
      hasErrors,
      hasWarnings,
    });
  }

  return results;
}
