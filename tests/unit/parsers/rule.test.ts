/**
 * @file Rule Parser Tests
 * @description Tests for rule file parsing, validation, and defaults
 */

import { describe, it, expect } from 'vitest';

import {
  parseRule,
  parseRules,
  filterRulesByTarget,
  sortRulesByPriority,
  RULE_DEFAULTS,
} from '../../../src/parsers/rule.js';
import { isOk, isErr } from '../../../src/utils/result.js';

describe('Rule Parser', () => {
  describe('parseRule()', () => {
    it('should parse valid rule with all fields', () => {
      const content = `---
name: database-rules
description: Database schema and migration rules
version: 1.0.0
always_apply: true
globs:
  - "**/*.sql"
  - "db/**/*"
targets:
  - cursor
  - claude
requires:
  - _core
category: infrastructure
priority: high
---
# Database Rules

Always validate SQL migrations before applying.`;

      const result = parseRule(content, 'rules/database.md');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.name).toBe('database-rules');
        expect(result.value.frontmatter.description).toBe('Database schema and migration rules');
        expect(result.value.frontmatter.version).toBe('1.0.0');
        expect(result.value.frontmatter.always_apply).toBe(true);
        expect(result.value.frontmatter.globs).toEqual(['**/*.sql', 'db/**/*']);
        expect(result.value.frontmatter.targets).toEqual(['cursor', 'claude']);
        expect(result.value.frontmatter.requires).toEqual(['_core']);
        expect(result.value.frontmatter.category).toBe('infrastructure');
        expect(result.value.frontmatter.priority).toBe('high');
        expect(result.value.content).toContain('Database Rules');
        expect(result.value.filePath).toBe('rules/database.md');
      }
    });

    it('should apply defaults for optional fields', () => {
      const content = `---
name: minimal-rule
---
Content`;

      const result = parseRule(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.always_apply).toBe(RULE_DEFAULTS.always_apply);
        expect(result.value.frontmatter.globs).toEqual(RULE_DEFAULTS.globs);
        expect(result.value.frontmatter.targets).toEqual(RULE_DEFAULTS.targets);
        expect(result.value.frontmatter.requires).toEqual(RULE_DEFAULTS.requires);
        expect(result.value.frontmatter.priority).toBe(RULE_DEFAULTS.priority);
      }
    });

    it('should return error for missing name', () => {
      const content = `---
description: Missing name field
---
Content`;

      const result = parseRule(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('validation failed');
        expect(result.error.validationErrors).toBeDefined();
        expect(result.error.validationErrors?.some((e) => e.path === 'name')).toBe(true);
      }
    });

    it('should return error for empty name', () => {
      const content = `---
name: ""
---
Content`;

      const result = parseRule(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.message.includes('empty'))).toBe(true);
      }
    });

    it('should return error for invalid version format', () => {
      const content = `---
name: test
version: invalid
---
Content`;

      const result = parseRule(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'version')).toBe(true);
      }
    });

    it('should return error for invalid target', () => {
      const content = `---
name: test
targets:
  - cursor
  - invalid-target
---
Content`;

      const result = parseRule(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path.includes('targets'))).toBe(true);
      }
    });

    it('should return error for invalid category', () => {
      const content = `---
name: test
category: invalid-category
---
Content`;

      const result = parseRule(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'category')).toBe(true);
      }
    });

    it('should return error for invalid priority', () => {
      const content = `---
name: test
priority: urgent
---
Content`;

      const result = parseRule(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'priority')).toBe(true);
      }
    });

    it('should return error for non-array globs', () => {
      const content = `---
name: test
globs: "**/*.ts"
---
Content`;

      const result = parseRule(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'globs')).toBe(true);
      }
    });

    it('should return error for non-string glob item', () => {
      const content = `---
name: test
globs:
  - 123
---
Content`;

      const result = parseRule(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'globs[0]')).toBe(true);
      }
    });

    it('should return error for missing frontmatter', () => {
      const content = `# Just content
No frontmatter here`;

      const result = parseRule(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('missing frontmatter');
      }
    });

    it('should return error for invalid YAML', () => {
      const content = `---
name: test
invalid: [broken
---
Content`;

      const result = parseRule(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Failed to parse');
      }
    });

    it('should include file path in error', () => {
      const content = `---
invalid: yaml [
---
Content`;

      const result = parseRule(content, '/path/to/rule.md');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.filePath).toBe('/path/to/rule.md');
      }
    });

    it('should parse platform-specific extensions', () => {
      const content = `---
name: cross-platform-rule
description: Rule with platform overrides
cursor:
  alwaysApply: true
  globs:
    - "**/*.ts"
claude:
  import_as_skill: true
factory:
  allowed-tools:
    - read
    - edit
---

# Cross-Platform Rule`;

      const result = parseRule(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.cursor).toEqual({
          alwaysApply: true,
          globs: ['**/*.ts'],
        });
        expect(result.value.frontmatter.claude).toEqual({
          import_as_skill: true,
        });
        expect(result.value.frontmatter.factory).toEqual({
          'allowed-tools': ['read', 'edit'],
        });
      }
    });

    it('should return error for invalid platform extension (non-object)', () => {
      const content = `---
name: test
cursor: not-an-object
---
Content`;

      const result = parseRule(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'cursor')).toBe(true);
      }
    });

    it('should collect all validation errors', () => {
      const content = `---
description: No name
version: bad-version
category: invalid
priority: ultra
---
Content`;

      const result = parseRule(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        // Should have errors for: name, version, category, priority
        expect(result.error.validationErrors?.length).toBeGreaterThanOrEqual(4);
      }
    });
  });

  describe('parseRules()', () => {
    it('should parse multiple valid rules', () => {
      const files = [
        { content: `---\nname: rule1\n---\nContent 1`, filePath: 'rule1.md' },
        { content: `---\nname: rule2\n---\nContent 2`, filePath: 'rule2.md' },
      ];

      const result = parseRules(files);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.length).toBe(2);
        expect(result.value[0].frontmatter.name).toBe('rule1');
        expect(result.value[1].frontmatter.name).toBe('rule2');
      }
    });

    it('should collect all errors from multiple files', () => {
      const files = [
        { content: `---\ndescription: no name\n---\nContent`, filePath: 'bad1.md' },
        { content: `---\nname: valid\n---\nContent`, filePath: 'good.md' },
        { content: `# No frontmatter`, filePath: 'bad2.md' },
      ];

      const result = parseRules(files);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.length).toBe(2);
        expect(result.error.some((e) => e.filePath === 'bad1.md')).toBe(true);
        expect(result.error.some((e) => e.filePath === 'bad2.md')).toBe(true);
      }
    });

    it('should handle empty files array', () => {
      const result = parseRules([]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('filterRulesByTarget()', () => {
    const rules = [
      {
        frontmatter: { name: 'cursor-only', targets: ['cursor'] as const },
        content: '',
      },
      {
        frontmatter: { name: 'claude-only', targets: ['claude'] as const },
        content: '',
      },
      {
        frontmatter: { name: 'all-targets', targets: ['cursor', 'claude', 'factory'] as const },
        content: '',
      },
      {
        frontmatter: { name: 'default-targets' },
        content: '',
      },
    ];

    it('should filter rules by cursor target', () => {
      const filtered = filterRulesByTarget(rules as any, 'cursor');

      expect(filtered.length).toBe(3);
      expect(filtered.map((r) => r.frontmatter.name)).toContain('cursor-only');
      expect(filtered.map((r) => r.frontmatter.name)).toContain('all-targets');
      expect(filtered.map((r) => r.frontmatter.name)).toContain('default-targets');
    });

    it('should filter rules by claude target', () => {
      const filtered = filterRulesByTarget(rules as any, 'claude');

      expect(filtered.length).toBe(3);
      expect(filtered.map((r) => r.frontmatter.name)).toContain('claude-only');
      expect(filtered.map((r) => r.frontmatter.name)).not.toContain('cursor-only');
    });

    it('should filter rules by factory target', () => {
      const filtered = filterRulesByTarget(rules as any, 'factory');

      expect(filtered.length).toBe(2);
      expect(filtered.map((r) => r.frontmatter.name)).toContain('all-targets');
      expect(filtered.map((r) => r.frontmatter.name)).toContain('default-targets');
    });
  });

  describe('sortRulesByPriority()', () => {
    const rules = [
      { frontmatter: { name: 'low', priority: 'low' as const }, content: '' },
      { frontmatter: { name: 'high', priority: 'high' as const }, content: '' },
      { frontmatter: { name: 'medium', priority: 'medium' as const }, content: '' },
      { frontmatter: { name: 'default' }, content: '' },
    ];

    it('should sort rules by priority (high first)', () => {
      const sorted = sortRulesByPriority(rules as any);

      expect(sorted[0].frontmatter.name).toBe('high');
      expect(sorted[1].frontmatter.priority ?? 'medium').toBe('medium');
      expect(sorted[sorted.length - 1].frontmatter.name).toBe('low');
    });

    it('should not modify original array', () => {
      const original = [...rules];
      sortRulesByPriority(rules as any);

      expect(rules[0].frontmatter.name).toBe(original[0].frontmatter.name);
    });
  });
});
