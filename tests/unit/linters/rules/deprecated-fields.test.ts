/**
 * @file Deprecated Fields Rule Tests
 */

import { describe, it, expect } from 'vitest';

import { deprecatedFieldsRule } from '../../../../src/linters/rules/deprecated-fields.js';

import type { LintContext } from '../../../../src/linters/types.js';
import type { ParsedRule } from '../../../../src/parsers/rule.js';

const baseRule: ParsedRule = {
  frontmatter: {
    name: 'deprecated-test',
    description: 'desc',
    always_apply: true,
    globs: [],
    targets: ['cursor'],
    requires: [],
    priority: 'medium',
  },
  content: '# Rule',
  filePath: 'rules/deprecated-test.md',
};

describe('deprecatedFieldsRule', () => {
  it('should warn on deprecated fields', () => {
    const issues = deprecatedFieldsRule.check(
      { ...baseRule, frontmatter: { ...baseRule.frontmatter, alwaysApply: true } } as ParsedRule,
      { allRules: [] } as LintContext
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'no-deprecated-fields', severity: 'warning' }),
      ])
    );
  });

  it('should pass when no deprecated fields are present', () => {
    const issues = deprecatedFieldsRule.check(baseRule, { allRules: [] } as LintContext);
    expect(issues).toHaveLength(0);
  });
});
