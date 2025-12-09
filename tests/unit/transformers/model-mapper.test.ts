/**
 * @file Model Mapper Tests
 * @description Tests for generic-to-target model name mapping
 */

import { describe, it, expect } from 'vitest';

import {
  mapModel,
  getModelsForTarget,
  getGenericModelName,
  isGenericModel,
  isInheritModel,
  createModelMapper,
  isValidModelForTarget,
  DEFAULT_MODEL_MAPPINGS,
} from '../../../src/transformers/model-mapper.js';

describe('Model Mapper', () => {
  describe('mapModel()', () => {
    describe('Cursor target', () => {
      it('should map default to inherit', () => {
        expect(mapModel('default', 'cursor')).toBe('inherit');
      });

      it('should map fast to inherit', () => {
        expect(mapModel('fast', 'cursor')).toBe('inherit');
      });

      it('should map powerful to inherit', () => {
        expect(mapModel('powerful', 'cursor')).toBe('inherit');
      });

      it('should pass through inherit', () => {
        expect(mapModel('inherit', 'cursor')).toBe('inherit');
      });

      it('should pass through specific model names', () => {
        expect(mapModel('gpt-4', 'cursor')).toBe('gpt-4');
        expect(mapModel('claude-3-opus', 'cursor')).toBe('claude-3-opus');
      });
    });

    describe('Claude target', () => {
      it('should map default to claude-sonnet-4', () => {
        expect(mapModel('default', 'claude')).toBe('claude-sonnet-4-20250514');
      });

      it('should map fast to claude-3-5-haiku', () => {
        expect(mapModel('fast', 'claude')).toBe('claude-3-5-haiku-20241022');
      });

      it('should map powerful to claude-sonnet-4', () => {
        expect(mapModel('powerful', 'claude')).toBe('claude-sonnet-4-20250514');
      });

      it('should resolve inherit to default model', () => {
        expect(mapModel('inherit', 'claude')).toBe('claude-sonnet-4-20250514');
      });

      it('should pass through specific model names', () => {
        expect(mapModel('claude-3-opus-20240229', 'claude')).toBe('claude-3-opus-20240229');
      });
    });

    describe('Factory target', () => {
      it('should map generic models directly', () => {
        expect(mapModel('default', 'factory')).toBe('default');
        expect(mapModel('fast', 'factory')).toBe('fast');
        expect(mapModel('powerful', 'factory')).toBe('powerful');
      });

      it('should pass through inherit', () => {
        expect(mapModel('inherit', 'factory')).toBe('inherit');
      });
    });

    describe('case insensitivity', () => {
      it('should handle uppercase input', () => {
        expect(mapModel('DEFAULT', 'claude')).toBe('claude-sonnet-4-20250514');
        expect(mapModel('FAST', 'claude')).toBe('claude-3-5-haiku-20241022');
      });

      it('should handle mixed case input', () => {
        expect(mapModel('Default', 'claude')).toBe('claude-sonnet-4-20250514');
        expect(mapModel('Fast', 'cursor')).toBe('inherit');
      });

      it('should handle inherit case insensitively', () => {
        expect(mapModel('INHERIT', 'cursor')).toBe('inherit');
        expect(mapModel('Inherit', 'cursor')).toBe('inherit');
      });
    });

    describe('custom mappings', () => {
      it('should use custom mappings over defaults', () => {
        const result = mapModel('default', 'claude', {
          customMappings: { default: 'custom-model' },
        });
        expect(result).toBe('custom-model');
      });

      it('should add new custom mappings', () => {
        const result = mapModel('mycustom', 'claude', {
          customMappings: { mycustom: 'custom-model-id' },
        });
        expect(result).toBe('custom-model-id');
      });

      it('should preserve defaults for non-overridden models', () => {
        const result = mapModel('fast', 'claude', {
          customMappings: { default: 'custom-default' },
        });
        expect(result).toBe('claude-3-5-haiku-20241022');
      });
    });

    describe('inherit behavior override', () => {
      it('should pass through inherit when behavior is passthrough', () => {
        const result = mapModel('inherit', 'claude', {
          inheritBehavior: 'passthrough',
        });
        expect(result).toBe('inherit');
      });

      it('should use default when behavior is use-default', () => {
        const result = mapModel('inherit', 'cursor', {
          inheritBehavior: 'use-default',
        });
        expect(result).toBe('inherit'); // Cursor's default IS inherit
      });
    });

    describe('unknown model behavior', () => {
      it('should pass through unknown models by default', () => {
        expect(mapModel('unknown-model', 'claude')).toBe('unknown-model');
      });

      it('should use default for unknown when behavior is use-default', () => {
        const result = mapModel('unknown-model', 'claude', {
          unknownBehavior: 'use-default',
        });
        expect(result).toBe('claude-sonnet-4-20250514');
      });
    });
  });

  describe('getModelsForTarget()', () => {
    it('should return all Cursor model mappings', () => {
      const models = getModelsForTarget('cursor');
      expect(models).toHaveProperty('default', 'inherit');
      expect(models).toHaveProperty('fast', 'inherit');
      expect(models).toHaveProperty('powerful', 'inherit');
    });

    it('should return all Claude model mappings', () => {
      const models = getModelsForTarget('claude');
      expect(models).toHaveProperty('default', 'claude-sonnet-4-20250514');
      expect(models).toHaveProperty('fast', 'claude-3-5-haiku-20241022');
    });

    it('should return copy of mappings (not reference)', () => {
      const models1 = getModelsForTarget('claude');
      const models2 = getModelsForTarget('claude');
      models1.default = 'modified';
      expect(models2.default).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('getGenericModelName()', () => {
    it('should reverse map Claude models', () => {
      expect(getGenericModelName('claude-sonnet-4-20250514', 'claude')).toBe('default');
      expect(getGenericModelName('claude-3-5-haiku-20241022', 'claude')).toBe('fast');
    });

    it('should be case insensitive', () => {
      expect(getGenericModelName('CLAUDE-SONNET-4-20250514', 'claude')).toBe('default');
    });

    it('should return undefined for unknown models', () => {
      expect(getGenericModelName('unknown-model', 'claude')).toBeUndefined();
      expect(getGenericModelName('gpt-4', 'claude')).toBeUndefined();
    });

    it('should reverse map Cursor models', () => {
      // All Cursor models map to 'inherit', so any of them could be returned
      const result = getGenericModelName('inherit', 'cursor');
      expect(['default', 'fast', 'powerful']).toContain(result);
    });
  });

  describe('isGenericModel()', () => {
    it('should return true for generic models', () => {
      expect(isGenericModel('default')).toBe(true);
      expect(isGenericModel('fast')).toBe(true);
      expect(isGenericModel('powerful')).toBe(true);
      expect(isGenericModel('inherit')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isGenericModel('DEFAULT')).toBe(true);
      expect(isGenericModel('Fast')).toBe(true);
      expect(isGenericModel('INHERIT')).toBe(true);
    });

    it('should return false for specific models', () => {
      expect(isGenericModel('claude-3-opus')).toBe(false);
      expect(isGenericModel('gpt-4')).toBe(false);
    });
  });

  describe('isInheritModel()', () => {
    it('should return true for inherit', () => {
      expect(isInheritModel('inherit')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isInheritModel('INHERIT')).toBe(true);
      expect(isInheritModel('Inherit')).toBe(true);
    });

    it('should return false for other models', () => {
      expect(isInheritModel('default')).toBe(false);
      expect(isInheritModel('fast')).toBe(false);
    });
  });

  describe('createModelMapper()', () => {
    it('should create bound mapper for target', () => {
      const mapClaudeModel = createModelMapper('claude');
      expect(mapClaudeModel('default')).toBe('claude-sonnet-4-20250514');
      expect(mapClaudeModel('fast')).toBe('claude-3-5-haiku-20241022');
    });

    it('should create mapper with custom options', () => {
      const mapCustom = createModelMapper('claude', {
        customMappings: { mycustom: 'my-custom-model' },
      });
      expect(mapCustom('mycustom')).toBe('my-custom-model');
      expect(mapCustom('default')).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('isValidModelForTarget()', () => {
    it('should return true for generic models', () => {
      expect(isValidModelForTarget('default', 'claude')).toBe(true);
      expect(isValidModelForTarget('inherit', 'cursor')).toBe(true);
    });

    it('should return true for specific model names', () => {
      expect(isValidModelForTarget('claude-3-opus', 'claude')).toBe(true);
      expect(isValidModelForTarget('gpt-4-turbo', 'cursor')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isValidModelForTarget('', 'claude')).toBe(false);
    });
  });

  describe('DEFAULT_MODEL_MAPPINGS', () => {
    it('should have config for all targets', () => {
      expect(DEFAULT_MODEL_MAPPINGS).toHaveProperty('cursor');
      expect(DEFAULT_MODEL_MAPPINGS).toHaveProperty('claude');
      expect(DEFAULT_MODEL_MAPPINGS).toHaveProperty('factory');
    });

    it('should have mappings property for each target', () => {
      expect(DEFAULT_MODEL_MAPPINGS.cursor).toHaveProperty('mappings');
      expect(DEFAULT_MODEL_MAPPINGS.claude).toHaveProperty('mappings');
      expect(DEFAULT_MODEL_MAPPINGS.factory).toHaveProperty('mappings');
    });

    it('should have behavior settings', () => {
      expect(DEFAULT_MODEL_MAPPINGS.cursor).toHaveProperty('inheritBehavior');
      expect(DEFAULT_MODEL_MAPPINGS.claude).toHaveProperty('unknownBehavior');
    });
  });
});
