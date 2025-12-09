/**
 * @file Linter Types
 * @description Shared types for rule linting
 */

import type { ParsedRule } from '../parsers/rule.js';

/**
 * Severity levels for lint issues
 */
export type LintSeverity = 'error' | 'warning' | 'info';

/**
 * A single lint issue found in a rule
 */
export interface LintIssue {
  /** Unique rule identifier (e.g., "deprecated-field", "missing-description") */
  ruleId: string;
  /** Human-readable message */
  message: string;
  /** Severity level */
  severity: LintSeverity;
  /** Path to the problematic field (e.g., "frontmatter.globs[0]") */
  path?: string;
  /** The problematic value */
  value?: unknown;
  /** Suggested fix or action */
  suggestion?: string;
  /** Line number in source file (if available) */
  line?: number;
}

/**
 * Result of linting a single rule file
 */
export interface RuleLintResult {
  /** Path to the rule file */
  filePath: string;
  /** Rule name (from frontmatter) */
  ruleName: string;
  /** All issues found */
  issues: LintIssue[];
  /** Convenience: has any errors */
  hasErrors: boolean;
  /** Convenience: has any warnings */
  hasWarnings: boolean;
}

/**
 * Result of linting all rules
 */
export interface LintResult {
  /** Results per rule file */
  rules: RuleLintResult[];
  /** Total counts by severity */
  summary: {
    errors: number;
    warnings: number;
    info: number;
    filesLinted: number;
    filesWithIssues: number;
  };
  /** Overall success (no errors) */
  success: boolean;
}

/**
 * Options for the linter
 */
export interface LintOptions {
  /** Treat warnings as errors */
  strict?: boolean;
  /** Specific lint rules to run (empty = all) */
  rules?: string[];
  /** Rules to skip */
  ignore?: string[];
  /** Include info-level issues */
  includeInfo?: boolean;
  /** Fix auto-fixable issues (future) */
  fix?: boolean;
}

/**
 * A single lint rule definition
 */
export interface LintRule {
  /** Unique identifier (e.g., "no-deprecated-fields") */
  id: string;
  /** Short description */
  description: string;
  /** Default severity */
  defaultSeverity: LintSeverity;
  /** Check a parsed rule and return issues */
  check: (rule: ParsedRule, context: LintContext) => LintIssue[];
}

/**
 * Context passed to lint rules
 */
export interface LintContext {
  /** All rules being linted (for cross-rule checks) */
  allRules: ParsedRule[];
  /** Project configuration */
  config?: unknown;
}
