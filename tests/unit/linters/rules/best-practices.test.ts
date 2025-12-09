/**
 * @file Best Practice Lint Rule Tests
 */

import { describe, it, expect } from 'vitest';

import {
  missingDescriptionRule,
  unreachableRuleCheck,
  invalidGlobCheck,
} from '../../../../src/linters/rules/best-practices.js';

import type { LintContext } from '../../../../src/linters/types.js';
import type { ParsedRule } from '../../../../src/parsers/rule.js';

const baseRule: ParsedRule = {
  frontmatter: {
    name: 'rule',
    description: 'desc',
    always_apply: true,
    globs: [],
    targets: ['cursor'],
    requires: [],
    priority: 'medium',
  },
  content: '# Rule',
  filePath: 'rules/rule.md',
};

describe('Best Practice Rules', () => {
  describe('missingDescriptionRule', () => {
    it('should warn on missing description', () => {
      const issues = missingDescriptionRule.check(
        { ...baseRule, frontmatter: { ...baseRule.frontmatter, description: undefined } },
        { allRules: [] } as LintContext
      );

      expect(issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'require-description', severity: 'warning' }),
        ])
      );
    });

    it('should pass when description exists', () => {
      const issues = missingDescriptionRule.check(baseRule, { allRules: [] } as LintContext);
      expect(issues).toHaveLength(0);
    });
  });

  describe('unreachableRuleCheck', () => {
    it('should warn when no globs and not always_apply', () => {
      const issues = unreachableRuleCheck.check(
        { ...baseRule, frontmatter: { ...baseRule.frontmatter, always_apply: false, globs: [] } },
        { allRules: [] } as LintContext
      );

      expect(issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'no-unreachable-rule', severity: 'warning' }),
        ])
      );
    });

    it('should pass when always_apply is true', () => {
      const issues = unreachableRuleCheck.check(baseRule, { allRules: [] } as LintContext);
      expect(issues).toHaveLength(0);
    });

    it('should pass when globs are defined', () => {
      const issues = unreachableRuleCheck.check(
        {
          ...baseRule,
          frontmatter: { ...baseRule.frontmatter, globs: ['src/**/*.ts'], always_apply: false },
        },
        { allRules: [] } as LintContext
      );
      expect(issues).toHaveLength(0);
    });
  });

  describe('invalidGlobCheck', () => {
    it('should error on backslashes in globs', () => {
      const issues = invalidGlobCheck.check(
        { ...baseRule, frontmatter: { ...baseRule.frontmatter, globs: ['src\\**/*.ts'] } },
        { allRules: [] } as LintContext
      );

      expect(issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'valid-glob-patterns', severity: 'error' }),
        ])
      );
    });

    it('should warn on leading slash', () => {
      const issues = invalidGlobCheck.check(
        { ...baseRule, frontmatter: { ...baseRule.frontmatter, globs: ['/absolute'] } },
        { allRules: [] } as LintContext
      );

      expect(issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'valid-glob-patterns', severity: 'warning' }),
        ])
      );
    });

    it('should error on empty glob', () => {
      const issues = invalidGlobCheck.check(
        { ...baseRule, frontmatter: { ...baseRule.frontmatter, globs: ['   '] } },
        { allRules: [] } as LintContext
      );

      expect(issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ruleId: 'valid-glob-patterns', severity: 'error' }),
        ])
      );
    });
  });
});
