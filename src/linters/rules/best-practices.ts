/**
 * @file Best Practice Lint Rules
 */

import type { ParsedRule } from '../../parsers/rule.js';
import type { LintContext, LintIssue, LintRule } from '../types.js';

/**
 * Check for missing description
 */
export const missingDescriptionRule: LintRule = {
  id: 'require-description',
  description: 'Require description in frontmatter',
  defaultSeverity: 'warning',

  check(rule: ParsedRule): LintIssue[] {
    if (!rule.frontmatter.description) {
      return [
        {
          ruleId: 'require-description',
          severity: 'warning',
          path: 'frontmatter.description',
          message: 'Rule is missing a description',
          suggestion: 'Add a description to help users understand what this rule does',
        },
      ];
    }
    return [];
  },
};

/**
 * Check for rules without globs that aren't always_apply
 */
export const unreachableRuleCheck: LintRule = {
  id: 'no-unreachable-rule',
  description: 'Warn when rule may never trigger',
  defaultSeverity: 'warning',

  check(rule: ParsedRule): LintIssue[] {
    const { always_apply, globs } = rule.frontmatter;

    if (!always_apply && (!globs || globs.length === 0)) {
      return [
        {
          ruleId: 'no-unreachable-rule',
          severity: 'warning',
          path: 'frontmatter',
          message: 'Rule has no globs and always_apply is false - it may never trigger',
          suggestion: 'Add glob patterns or set always_apply: true',
        },
      ];
    }
    return [];
  },
};

/**
 * Check for very large rule content
 */
export const ruleSizeCheck: LintRule = {
  id: 'max-rule-size',
  description: 'Warn when rule content is too large',
  defaultSeverity: 'info',

  check(rule: ParsedRule): LintIssue[] {
    const contentSize = rule.content.length;
    const MAX_SIZE = 10000; // 10KB

    if (contentSize > MAX_SIZE) {
      return [
        {
          ruleId: 'max-rule-size',
          severity: 'info',
          message: `Rule content is ${Math.round(contentSize / 1024)}KB (exceeds ${
            MAX_SIZE / 1000
          }KB recommendation)`,
          suggestion: 'Consider splitting into smaller, focused rules',
        },
      ];
    }
    return [];
  },
};

/**
 * Check for duplicate rule names
 */
export const duplicateNameCheck: LintRule = {
  id: 'no-duplicate-names',
  description: 'Disallow duplicate rule names',
  defaultSeverity: 'error',

  check(rule: ParsedRule, context: LintContext): LintIssue[] {
    const duplicates = context.allRules.filter(
      (r) => r.frontmatter.name === rule.frontmatter.name && r.filePath !== rule.filePath
    );

    if (duplicates.length > 0) {
      return [
        {
          ruleId: 'no-duplicate-names',
          severity: 'error',
          path: 'frontmatter.name',
          value: rule.frontmatter.name,
          message: `Duplicate rule name '${rule.frontmatter.name}'`,
          suggestion: `Also defined in: ${duplicates.map((d) => d.filePath ?? 'unknown').join(', ')}`,
        },
      ];
    }
    return [];
  },
};

/**
 * Check for invalid glob patterns
 */
export const invalidGlobCheck: LintRule = {
  id: 'valid-glob-patterns',
  description: 'Validate glob pattern syntax',
  defaultSeverity: 'error',

  check(rule: ParsedRule): LintIssue[] {
    const issues: LintIssue[] = [];
    const globs = rule.frontmatter.globs ?? [];

    for (const [i, glob] of globs.entries()) {
      if (glob.includes('\\')) {
        issues.push({
          ruleId: 'valid-glob-patterns',
          severity: 'error',
          path: `frontmatter.globs[${i}]`,
          value: glob,
          message: 'Glob pattern contains backslashes',
          suggestion: 'Use forward slashes (/) for path separators',
        });
      }

      if (glob.startsWith('/')) {
        issues.push({
          ruleId: 'valid-glob-patterns',
          severity: 'warning',
          path: `frontmatter.globs[${i}]`,
          value: glob,
          message: 'Glob pattern starts with / (absolute path)',
          suggestion: 'Globs are relative to project root; remove leading /',
        });
      }

      if (glob.trim() === '') {
        issues.push({
          ruleId: 'valid-glob-patterns',
          severity: 'error',
          path: `frontmatter.globs[${i}]`,
          value: glob,
          message: 'Empty glob pattern',
          suggestion: 'Remove empty glob or provide a valid pattern',
        });
      }
    }

    return issues;
  },
};

/**
 * Check for missing requires references
 */
export const invalidRequiresCheck: LintRule = {
  id: 'valid-requires',
  description: 'Validate requires references exist',
  defaultSeverity: 'error',

  check(rule: ParsedRule, context: LintContext): LintIssue[] {
    const issues: LintIssue[] = [];
    const requires = rule.frontmatter.requires ?? [];
    const availableNames = new Set(context.allRules.map((r) => r.frontmatter.name));

    for (const [i, req] of requires.entries()) {
      if (req === rule.frontmatter.name) {
        issues.push({
          ruleId: 'valid-requires',
          severity: 'error',
          path: `frontmatter.requires[${i}]`,
          value: req,
          message: 'Rule cannot require itself',
          suggestion: 'Remove the self reference or rename the dependency',
        });
        continue;
      }

      if (!availableNames.has(req)) {
        issues.push({
          ruleId: 'valid-requires',
          severity: 'error',
          path: `frontmatter.requires[${i}]`,
          value: req,
          message: `Required rule '${req}' does not exist`,
          suggestion: 'Check the rule name or remove the reference',
        });
      }
    }

    return issues;
  },
};

/**
 * Check for circular requires references
 */
export const circularRequiresCheck: LintRule = {
  id: 'no-circular-requires',
  description: 'Detect circular dependencies in requires',
  defaultSeverity: 'error',

  check(rule: ParsedRule, context: LintContext): LintIssue[] {
    const graph = new Map<string, string[]>(
      context.allRules.map((r) => [r.frontmatter.name, r.frontmatter.requires ?? []])
    );

    const start = rule.frontmatter.name;
    const path: string[] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (node: string): string[] | null => {
      if (inStack.has(node)) {
        const cycleStartIndex = path.indexOf(node);
        return cycleStartIndex >= 0 ? [...path.slice(cycleStartIndex), node] : [...path, node];
      }

      if (visited.has(node)) {
        return null;
      }

      visited.add(node);
      inStack.add(node);
      path.push(node);

      for (const next of graph.get(node) ?? []) {
        if (!graph.has(next)) {
          continue;
        }
        const cycle = dfs(next);
        if (cycle) {
          return cycle;
        }
      }

      path.pop();
      inStack.delete(node);
      return null;
    };

    const cycle = dfs(start);

    if (!cycle) {
      return [];
    }

    // Ensure the cycle is rooted at the current rule for a clearer message
    const rotated = cycle.slice(cycle.indexOf(start));
    if (rotated[rotated.length - 1] !== start) {
      rotated.push(start);
    }

    return [
      {
        ruleId: 'no-circular-requires',
        severity: 'error',
        path: 'frontmatter.requires',
        message: `Circular requires detected: ${rotated.join(' -> ')}`,
        suggestion: 'Break the cycle by removing or reordering dependencies',
      },
    ];
  },
};
