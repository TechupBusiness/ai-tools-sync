/**
 * @file Deprecated Fields Lint Rule
 */

import type { ParsedRule } from '../../parsers/rule.js';
import type { LintIssue, LintRule } from '../types.js';

/**
 * Deprecated field mappings: old field -> { replacement, since }
 */
const DEPRECATED_FIELDS: Record<string, { replacement?: string; since: string; message?: string }> =
  {
    alwaysApply: {
      replacement: 'always_apply',
      since: '1.0.0',
      message: 'Use snake_case field name for consistency with generic format',
    },
  };

/**
 * Check for deprecated fields in frontmatter
 */
export const deprecatedFieldsRule: LintRule = {
  id: 'no-deprecated-fields',
  description: 'Disallow deprecated frontmatter fields',
  defaultSeverity: 'warning',

  check(rule: ParsedRule): LintIssue[] {
    const issues: LintIssue[] = [];
    const frontmatter = rule.frontmatter as unknown as Record<string, unknown>;

    for (const [field, info] of Object.entries(DEPRECATED_FIELDS)) {
      if (field in frontmatter) {
        const suggestion = info.replacement
          ? `Use '${info.replacement}' instead. ${info.message ?? ''}`.trim()
          : info.message;

        const issue: LintIssue = {
          ruleId: 'no-deprecated-fields',
          severity: 'warning',
          path: `frontmatter.${field}`,
          value: frontmatter[field],
          message: `Field '${field}' is deprecated since v${info.since}`,
        };

        if (suggestion) {
          issue.suggestion = suggestion;
        }

        issues.push(issue);
      }
    }

    return issues;
  },
};
