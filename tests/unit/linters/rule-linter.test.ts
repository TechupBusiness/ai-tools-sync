/**
 * @file Rule Linter Tests
 */

import { describe, it, expect } from 'vitest';

import { lintRules } from '../../../src/linters/rule-linter.js';

import type { ParsedRule } from '../../../src/parsers/rule.js';

function createRule(
  overrides: Partial<ParsedRule['frontmatter']> = {},
  filePath?: string
): ParsedRule {
  return {
    frontmatter: {
      name: overrides.name ?? 'test-rule',
      description: overrides.description,
      always_apply: overrides.always_apply ?? true,
      globs: overrides.globs ?? [],
      targets: overrides.targets ?? ['cursor'],
      requires: overrides.requires ?? [],
      priority: overrides.priority ?? 'medium',
      when: overrides.when,
      version: overrides.version,
    },
    content: overrides.description ?? '# Test rule',
    filePath: filePath ?? (overrides.name ? `rules/${overrides.name}.md` : 'rules/test-rule.md'),
  };
}

describe('RuleLinter', () => {
  describe('lintRules', () => {
    it('should return success for valid rules', () => {
      const rules: ParsedRule[] = [createRule({ name: 'valid-rule', description: 'A valid rule' })];

      const result = lintRules(rules);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(true);
      expect(result.value.summary.errors).toBe(0);
      expect(result.value.summary.warnings).toBe(0);
    });

    it('should warn when rule may never trigger', () => {
      const rules: ParsedRule[] = [
        createRule({ name: 'unreachable-rule', always_apply: false, globs: [] }),
      ];

      const result = lintRules(rules);

      expect(result.ok).toBe(true);
      expect(result.value.rules[0]?.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-unreachable-rule',
            severity: 'warning',
          }),
        ])
      );
    });

    it('should error on duplicate rule names', () => {
      const rules: ParsedRule[] = [
        createRule({ name: 'duplicate', description: 'first' }, 'rules/first.md'),
        createRule({ name: 'duplicate', description: 'second' }, 'rules/second.md'),
      ];

      const result = lintRules(rules);

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.summary.errors).toBeGreaterThan(0);
      expect(result.value.rules[0]?.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-duplicate-names',
            severity: 'error',
          }),
        ])
      );
    });

    it('should treat warnings as errors in strict mode', () => {
      const rules: ParsedRule[] = [createRule({ name: 'no-description' })];

      const result = lintRules(rules, { strict: true });

      expect(result.ok).toBe(true);
      expect(result.value.success).toBe(false);
      expect(result.value.summary.warnings).toBeGreaterThan(0);
    });

    it('should filter rules with --rules option', () => {
      const rules: ParsedRule[] = [
        createRule({ name: 'missing-description' }),
        createRule({ name: 'with-description', description: 'ok' }),
      ];

      const result = lintRules(rules, { rules: ['require-description'] });

      expect(result.ok).toBe(true);
      const issues = result.value.rules.flatMap((r) => r.issues);
      expect(issues.every((i) => i.ruleId === 'require-description')).toBe(true);
    });

    it('should exclude rules with --ignore option', () => {
      const rules: ParsedRule[] = [createRule({ name: 'ignored', description: undefined })];

      const result = lintRules(rules, { ignore: ['require-description'] });

      expect(result.ok).toBe(true);
      expect(result.value.summary.warnings).toBe(0);
    });

    it('should error on invalid requires reference', () => {
      const rules: ParsedRule[] = [
        createRule({ name: 'has-invalid-requires', requires: ['non-existent-rule'] }),
      ];

      const result = lintRules(rules);

      expect(result.ok).toBe(true);
      expect(result.value.rules[0]?.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'valid-requires',
            severity: 'error',
          }),
        ])
      );
    });

    it('should detect circular requires', () => {
      const rules: ParsedRule[] = [
        createRule({ name: 'a', requires: ['b'] }),
        createRule({ name: 'b', requires: ['c'] }),
        createRule({ name: 'c', requires: ['a'] }),
      ];

      const result = lintRules(rules);

      expect(result.ok).toBe(true);
      const cycleIssue = result.value.rules
        .find((r) => r.ruleName === 'a')
        ?.issues.find((i) => i.ruleId === 'no-circular-requires');
      expect(cycleIssue).toBeDefined();
    });
  });
});
