/**
 * @file Lint Rule Registry
 */

import {
  circularRequiresCheck,
  duplicateNameCheck,
  invalidGlobCheck,
  invalidRequiresCheck,
  missingDescriptionRule,
  ruleSizeCheck,
  unreachableRuleCheck,
} from './best-practices.js';
import { deprecatedFieldsRule } from './deprecated-fields.js';

import type { LintRule } from '../types.js';

/**
 * All available lint rules
 */
export const ALL_LINT_RULES: LintRule[] = [
  // Deprecated fields
  deprecatedFieldsRule,

  // Best practices
  missingDescriptionRule,
  unreachableRuleCheck,
  ruleSizeCheck,
  duplicateNameCheck,
  invalidGlobCheck,
  invalidRequiresCheck,
  circularRequiresCheck,
];

/**
 * Get all lint rules
 */
export function getAllLintRules(): LintRule[] {
  return [...ALL_LINT_RULES];
}

/**
 * Get a lint rule by ID
 */
export function getLintRuleById(id: string): LintRule | undefined {
  return ALL_LINT_RULES.find((r) => r.id === id);
}
