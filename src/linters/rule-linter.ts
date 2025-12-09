/**
 * @file Rule Linter
 */

import { err, ok, type Result } from '../utils/result.js';

import { LintError } from './errors.js';
import { getAllLintRules } from './rules/index.js';

import type {
  LintContext,
  LintIssue,
  LintOptions,
  LintResult,
  LintRule,
  RuleLintResult,
} from './types.js';
import type { ParsedRule } from '../parsers/rule.js';

/**
 * Lint all parsed rules
 */
export function lintRules(
  rules: ParsedRule[],
  options: LintOptions = {}
): Result<LintResult, Error> {
  try {
    const lintRulesToRun = getEnabledLintRules(options);
    const context: LintContext = { allRules: rules };

    const ruleResults: RuleLintResult[] = [];

    for (const rule of rules) {
      const issues: LintIssue[] = [];

      for (const lintRule of lintRulesToRun) {
        const ruleIssues = lintRule.check(rule, context);
        issues.push(...ruleIssues);
      }

      const filteredIssues = options.includeInfo
        ? issues
        : issues.filter((i) => i.severity !== 'info');

      const hasErrors = filteredIssues.some((i) => i.severity === 'error');
      const hasWarnings = filteredIssues.some((i) => i.severity === 'warning');

      ruleResults.push({
        filePath: rule.filePath ?? 'unknown',
        ruleName: rule.frontmatter.name,
        issues: filteredIssues,
        hasErrors,
        hasWarnings,
      });
    }

    const summary = summarizeRuleResults(ruleResults);
    const effectiveErrors = options.strict ? summary.errors + summary.warnings : summary.errors;

    return ok({
      rules: ruleResults,
      summary,
      success: effectiveErrors === 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(
      new LintError(
        `Linting failed: ${message}`,
        error instanceof Error ? { cause: error } : undefined
      )
    );
  }
}

/**
 * Get enabled lint rules based on options
 */
export function getEnabledLintRules(options: LintOptions): LintRule[] {
  const allRules = getAllLintRules();

  let enabled = options.rules?.length
    ? allRules.filter((r) => options.rules!.includes(r.id))
    : allRules;

  if (options.ignore?.length) {
    enabled = enabled.filter((r) => !options.ignore!.includes(r.id));
  }

  return enabled;
}

/**
 * Summarize lint results
 */
export function summarizeRuleResults(ruleResults: RuleLintResult[]): LintResult['summary'] {
  let errors = 0;
  let warnings = 0;
  let info = 0;
  let filesWithIssues = 0;

  for (const result of ruleResults) {
    if (result.issues.length > 0) {
      filesWithIssues += 1;
    }

    for (const issue of result.issues) {
      if (issue.severity === 'error') {
        errors += 1;
      } else if (issue.severity === 'warning') {
        warnings += 1;
      } else {
        info += 1;
      }
    }
  }

  return {
    errors,
    warnings,
    info,
    filesLinted: ruleResults.length,
    filesWithIssues,
  };
}
