/**
 * @file Schema Compliance Helpers
 */

import type { ContentValidationError, ParseError } from '../../parsers/types.js';
import type { LintIssue } from '../types.js';

const RULE_ID = 'schema-compliance';

/**
 * Convert a parser validation error into lint issues.
 */
export function schemaComplianceIssuesFromValidation(
  validationErrors: ContentValidationError[],
  parseError?: ParseError
): LintIssue[] {
  return validationErrors.map<LintIssue>((error) => {
    const issue: LintIssue = {
      ruleId: RULE_ID,
      severity: 'error',
      path: error.path,
      value: error.value,
      message: error.message,
    };

    if (parseError?.line !== undefined) {
      issue.line = parseError.line;
    }

    return issue;
  });
}

/**
 * Convert a parse error into a lint issue.
 */
export function schemaComplianceIssueFromParseError(parseError: ParseError): LintIssue {
  const issue: LintIssue = {
    ruleId: RULE_ID,
    severity: 'error',
    message: parseError.message,
  };

  if (parseError.filePath) {
    issue.path = 'frontmatter';
  }
  if (parseError.line !== undefined) {
    issue.line = parseError.line;
  }

  return issue;
}
