/**
 * @file Frontmatter Transformer Tests
 * @description Tests for frontmatter transformation between formats
 */

import { describe, it, expect } from 'vitest';

import {
  transformFrontmatter,
  transformForCursor,
  transformForClaude,
  transformForFactory,
  transforms,
  arrayToCommaSeparated,
  toAlwaysApply,
  serializeFrontmatter,
  createFrontmatterTransformer,
  DEFAULT_TARGET_CONFIGS,
} from '../../../src/transformers/frontmatter.js';

describe('Frontmatter Transformer', () => {
  describe('transformFrontmatter()', () => {
    describe('basic transformation', () => {
      it('should pass through frontmatter without options', () => {
        const input = { name: 'test', description: 'Test rule' };
        const result = transformFrontmatter(input);
        expect(result).toEqual(input);
      });

      it('should remove empty values by default', () => {
        const input = { name: 'test', description: undefined, empty: null, blank: '' };
        const result = transformFrontmatter(input);
        expect(result).toEqual({ name: 'test' });
      });

      it('should preserve empty values when removeEmpty is false', () => {
        const input = { name: 'test', description: undefined };
        const result = transformFrontmatter(input, { removeEmpty: false });
        expect(result).toHaveProperty('description');
      });
    });

    describe('field mappings', () => {
      it('should rename fields according to mappings', () => {
        const input = { always_apply: true, globs: ['*.ts'] };
        const result = transformFrontmatter(input, {
          fieldMappings: { always_apply: 'alwaysApply' },
        });
        expect(result).toHaveProperty('alwaysApply', true);
        expect(result).not.toHaveProperty('always_apply');
      });

      it('should preserve unmapped fields', () => {
        const input = { always_apply: true, name: 'test' };
        const result = transformFrontmatter(input, {
          fieldMappings: { always_apply: 'alwaysApply' },
        });
        expect(result).toHaveProperty('name', 'test');
      });
    });

    describe('value transforms', () => {
      it('should apply transforms to values', () => {
        const input = { globs: ['*.ts', '*.tsx'] };
        const result = transformFrontmatter(input, {
          valueTransforms: { globs: transforms.arrayToCommaSeparated },
        });
        expect(result.globs).toBe('*.ts, *.tsx');
      });

      it('should apply boolean transform', () => {
        const input = { enabled: 1 };
        const result = transformFrontmatter(input, {
          valueTransforms: { enabled: transforms.toBoolean },
        });
        expect(result.enabled).toBe(true);
      });

      it('should apply transform after field mapping', () => {
        const input = { always_apply: true };
        const result = transformFrontmatter(input, {
          fieldMappings: { always_apply: 'alwaysApply' },
          valueTransforms: { always_apply: transforms.toBoolean },
        });
        expect(result.alwaysApply).toBe(true);
      });
    });

    describe('field filtering', () => {
      it('should include only specified fields', () => {
        const input = { name: 'test', description: 'desc', version: '1.0.0' };
        const result = transformFrontmatter(input, {
          includeFields: ['name', 'description'],
        });
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('description');
        expect(result).not.toHaveProperty('version');
      });

      it('should exclude specified fields', () => {
        const input = { name: 'test', description: 'desc', version: '1.0.0' };
        const result = transformFrontmatter(input, {
          excludeFields: ['version'],
        });
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('description');
        expect(result).not.toHaveProperty('version');
      });

      it('should apply exclude after include', () => {
        const input = { name: 'test', description: 'desc', version: '1.0.0' };
        const result = transformFrontmatter(input, {
          includeFields: ['name', 'description'],
          excludeFields: ['description'],
        });
        expect(result).toHaveProperty('name');
        expect(result).not.toHaveProperty('description');
      });
    });

    describe('target-specific transformation', () => {
      it('should use Cursor config when target is cursor', () => {
        const input = { name: 'test', always_apply: true, globs: ['*.ts'] };
        const result = transformFrontmatter(input, { target: 'cursor' });

        // Should have alwaysApply (renamed from always_apply)
        expect(result).toHaveProperty('alwaysApply', true);
        // Should have globs as comma-separated string
        expect(result.globs).toBe('*.ts');
      });

      it('should use Claude config when target is claude', () => {
        const input = { name: 'test', tools: ['read', 'write'], model: 'default' };
        const result = transformFrontmatter(input, { target: 'claude' });

        expect(result).toHaveProperty('name');
        expect(result.tools).toEqual(['Read', 'Write']);
        expect(result.model).toBe('claude-sonnet-4-20250514');
      });
    });
  });

  describe('transformForCursor()', () => {
    it('should transform rule frontmatter for Cursor', () => {
      const input = {
        name: 'database',
        description: 'Database rules',
        always_apply: false,
        globs: ['**/*.sql', 'db/**/*'],
      };
      const result = transformForCursor(input);

      expect(result).toHaveProperty('description', 'Database rules');
      expect(result).toHaveProperty('alwaysApply', false);
      expect(result.globs).toBe('**/*.sql, db/**/*');
    });

    it('should handle empty globs', () => {
      const input = { name: 'test', always_apply: true, globs: [] };
      const result = transformForCursor(input);

      expect(result).toHaveProperty('alwaysApply', true);
    });

    it('should handle missing optional fields', () => {
      const input = { name: 'minimal' };
      const result = transformForCursor(input);

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('globs');
    });
  });

  describe('transformForClaude()', () => {
    it('should transform persona frontmatter for Claude', () => {
      const input = {
        name: 'implementer',
        description: 'Coding specialist',
        tools: ['read', 'write', 'edit', 'execute'],
        model: 'fast',
      };
      const result = transformForClaude(input);

      expect(result).toHaveProperty('name', 'implementer');
      expect(result.tools).toEqual(['Read', 'Write', 'Edit', 'Bash']);
      expect(result.model).toBe('claude-3-5-haiku-20241022');
    });

    it('should map inherit model', () => {
      const input = { name: 'test', model: 'inherit' };
      const result = transformForClaude(input);

      // Claude resolves inherit to default
      expect(result.model).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('transformForFactory()', () => {
    it('should transform persona frontmatter for Factory', () => {
      const input = {
        name: 'architect',
        tools: ['read', 'write', 'search'],
        model: 'powerful',
      };
      const result = transformForFactory(input);

      expect(result.tools).toEqual(['read', 'write', 'search']);
      expect(result.model).toBe('powerful');
    });
  });

  describe('transforms', () => {
    describe('arrayToCommaSeparated', () => {
      it('should join array with comma and space', () => {
        expect(transforms.arrayToCommaSeparated(['a', 'b', 'c'])).toBe('a, b, c');
      });

      it('should handle single item', () => {
        expect(transforms.arrayToCommaSeparated(['single'])).toBe('single');
      });

      it('should handle empty array', () => {
        expect(transforms.arrayToCommaSeparated([])).toBe('');
      });

      it('should convert non-array to string', () => {
        expect(transforms.arrayToCommaSeparated('string')).toBe('string');
      });
    });

    describe('arrayToNewlineSeparated', () => {
      it('should join array with newlines', () => {
        expect(transforms.arrayToNewlineSeparated(['a', 'b'])).toBe('a\nb');
      });
    });

    describe('toBoolean', () => {
      it('should convert truthy values to true', () => {
        expect(transforms.toBoolean(true)).toBe(true);
        expect(transforms.toBoolean(1)).toBe(true);
        expect(transforms.toBoolean('yes')).toBe(true);
      });

      it('should convert falsy values to false', () => {
        expect(transforms.toBoolean(false)).toBe(false);
        expect(transforms.toBoolean(0)).toBe(false);
        expect(transforms.toBoolean('')).toBe(false);
        expect(transforms.toBoolean(null)).toBe(false);
      });
    });

    describe('toArray', () => {
      it('should pass through arrays', () => {
        expect(transforms.toArray(['a', 'b'])).toEqual(['a', 'b']);
      });

      it('should wrap single value in array', () => {
        expect(transforms.toArray('single')).toEqual(['single']);
      });

      it('should return empty array for null/undefined', () => {
        expect(transforms.toArray(null)).toEqual([]);
        expect(transforms.toArray(undefined)).toEqual([]);
      });
    });

    describe('mapToolsForTarget', () => {
      it('should map tools using target context', () => {
        const context = { target: 'claude' as const, frontmatter: {}, fieldName: 'tools' };
        const result = transforms.mapToolsForTarget(['read', 'execute'], context);
        expect(result).toEqual(['Read', 'Bash']);
      });
    });

    describe('mapModelForTarget', () => {
      it('should map model using target context', () => {
        const context = { target: 'claude' as const, frontmatter: {}, fieldName: 'model' };
        const result = transforms.mapModelForTarget('fast', context);
        expect(result).toBe('claude-3-5-haiku-20241022');
      });
    });

    describe('identity', () => {
      it('should return value unchanged', () => {
        expect(transforms.identity('test')).toBe('test');
        expect(transforms.identity(123)).toBe(123);
        expect(transforms.identity(null)).toBe(null);
      });
    });

    describe('toString', () => {
      it('should convert to string', () => {
        expect(transforms.toString(123)).toBe('123');
        expect(transforms.toString(null)).toBe('');
        expect(transforms.toString(undefined)).toBe('');
      });
    });

    describe('toLowercase', () => {
      it('should convert to lowercase', () => {
        expect(transforms.toLowercase('HELLO')).toBe('hello');
      });
    });

    describe('toUppercase', () => {
      it('should convert to uppercase', () => {
        expect(transforms.toUppercase('hello')).toBe('HELLO');
      });
    });
  });

  describe('arrayToCommaSeparated() export', () => {
    it('should work as standalone function', () => {
      expect(arrayToCommaSeparated(['a', 'b', 'c'])).toBe('a, b, c');
    });
  });

  describe('toAlwaysApply() export', () => {
    it('should work as standalone function', () => {
      expect(toAlwaysApply(true)).toBe(true);
      expect(toAlwaysApply(false)).toBe(false);
    });
  });

  describe('serializeFrontmatter()', () => {
    it('should serialize simple frontmatter', () => {
      const result = serializeFrontmatter({
        name: 'test',
        description: 'A test rule',
      });
      expect(result).toContain('name: test');
      expect(result).toContain('description: A test rule');
    });

    it('should serialize boolean values', () => {
      const result = serializeFrontmatter({
        alwaysApply: true,
        enabled: false,
      });
      expect(result).toContain('alwaysApply: true');
      expect(result).toContain('enabled: false');
    });

    it('should serialize number values', () => {
      const result = serializeFrontmatter({ priority: 5 });
      expect(result).toContain('priority: 5');
    });

    it('should serialize arrays inline for simple strings', () => {
      const result = serializeFrontmatter({
        globs: ['*.ts', '*.tsx'],
      });
      expect(result).toContain('globs: ["*.ts", "*.tsx"]');
    });

    it('should skip undefined/null values', () => {
      const result = serializeFrontmatter({
        name: 'test',
        description: undefined,
        version: null,
      });
      expect(result).toContain('name: test');
      expect(result).not.toContain('description');
      expect(result).not.toContain('version');
    });

    it('should quote strings with special characters', () => {
      const result = serializeFrontmatter({
        description: 'Has: colon',
      });
      expect(result).toContain('description: "Has: colon"');
    });
  });

  describe('createFrontmatterTransformer()', () => {
    it('should create bound transformer for Cursor', () => {
      const transform = createFrontmatterTransformer('cursor');
      const result = transform({ always_apply: true, globs: ['*.ts'] });

      expect(result).toHaveProperty('alwaysApply', true);
      expect(result.globs).toBe('*.ts');
    });

    it('should create bound transformer with preset options', () => {
      const transform = createFrontmatterTransformer('cursor', {
        excludeFields: ['description'],
      });
      const result = transform({ description: 'test', always_apply: true });

      expect(result).not.toHaveProperty('description');
    });
  });

  describe('DEFAULT_TARGET_CONFIGS', () => {
    it('should have config for all targets', () => {
      expect(DEFAULT_TARGET_CONFIGS).toHaveProperty('cursor');
      expect(DEFAULT_TARGET_CONFIGS).toHaveProperty('claude');
      expect(DEFAULT_TARGET_CONFIGS).toHaveProperty('factory');
    });

    it('should have includeFields for Cursor', () => {
      expect(DEFAULT_TARGET_CONFIGS.cursor.includeFields).toContain('description');
      expect(DEFAULT_TARGET_CONFIGS.cursor.includeFields).toContain('globs');
      expect(DEFAULT_TARGET_CONFIGS.cursor.includeFields).toContain('alwaysApply');
    });

    it('should have field mappings for Cursor', () => {
      expect(DEFAULT_TARGET_CONFIGS.cursor.fieldMappings).toHaveProperty(
        'always_apply',
        'alwaysApply'
      );
    });
  });
});
