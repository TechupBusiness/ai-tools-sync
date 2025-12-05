/**
 * @file Tool Mapper Tests
 * @description Tests for generic-to-target tool name mapping
 */

import { describe, it, expect } from 'vitest';

import {
  mapTool,
  mapTools,
  getToolsForTarget,
  getGenericToolName,
  isKnownGenericTool,
  createToolMapper,
  DEFAULT_TOOL_MAPPINGS,
} from '../../../src/transformers/tool-mapper.js';

describe('Tool Mapper', () => {
  describe('mapTool()', () => {
    describe('Cursor target', () => {
      it('should map read to Read', () => {
        expect(mapTool('read', 'cursor')).toBe('Read');
      });

      it('should map write to Create', () => {
        expect(mapTool('write', 'cursor')).toBe('Create');
      });

      it('should map edit to Edit', () => {
        expect(mapTool('edit', 'cursor')).toBe('Edit');
      });

      it('should map execute to Execute', () => {
        expect(mapTool('execute', 'cursor')).toBe('Execute');
      });

      it('should map search to Grep', () => {
        expect(mapTool('search', 'cursor')).toBe('Grep');
      });

      it('should map glob to Glob', () => {
        expect(mapTool('glob', 'cursor')).toBe('Glob');
      });

      it('should map fetch to FetchUrl', () => {
        expect(mapTool('fetch', 'cursor')).toBe('FetchUrl');
      });

      it('should map ls to LS', () => {
        expect(mapTool('ls', 'cursor')).toBe('LS');
      });
    });

    describe('Claude target', () => {
      it('should map read to Read', () => {
        expect(mapTool('read', 'claude')).toBe('Read');
      });

      it('should map write to Write', () => {
        expect(mapTool('write', 'claude')).toBe('Write');
      });

      it('should map execute to Bash', () => {
        expect(mapTool('execute', 'claude')).toBe('Bash');
      });

      it('should map search to Search', () => {
        expect(mapTool('search', 'claude')).toBe('Search');
      });

      it('should map fetch to WebFetch', () => {
        expect(mapTool('fetch', 'claude')).toBe('WebFetch');
      });

      it('should map ls to ListDir', () => {
        expect(mapTool('ls', 'claude')).toBe('ListDir');
      });
    });

    describe('Factory target', () => {
      it('should map all tools to lowercase', () => {
        expect(mapTool('read', 'factory')).toBe('read');
        expect(mapTool('write', 'factory')).toBe('write');
        expect(mapTool('execute', 'factory')).toBe('execute');
      });

      it('should map ls to list', () => {
        expect(mapTool('ls', 'factory')).toBe('list');
      });
    });

    describe('case insensitivity', () => {
      it('should handle uppercase input', () => {
        expect(mapTool('READ', 'cursor')).toBe('Read');
        expect(mapTool('EXECUTE', 'claude')).toBe('Bash');
      });

      it('should handle mixed case input', () => {
        expect(mapTool('Read', 'cursor')).toBe('Read');
        expect(mapTool('Execute', 'claude')).toBe('Bash');
      });
    });

    describe('unknown tools', () => {
      it('should preserve unknown tools by default', () => {
        expect(mapTool('custom', 'cursor')).toBe('Custom');
        expect(mapTool('MyTool', 'cursor')).toBe('Mytool');
      });

      it('should apply target-specific transform to unknown tools', () => {
        // Cursor capitalizes
        expect(mapTool('customtool', 'cursor')).toBe('Customtool');
        // Factory lowercases
        expect(mapTool('CustomTool', 'factory')).toBe('customtool');
      });

      it('should filter unknown tools when preserveUnknown is false', () => {
        expect(mapTool('custom', 'cursor', { preserveUnknown: false })).toBeUndefined();
      });

      it('should apply custom transform to unknown tools', () => {
        expect(mapTool('custom', 'cursor', { unknownTransform: 'uppercase' })).toBe('CUSTOM');
        expect(mapTool('CUSTOM', 'cursor', { unknownTransform: 'lowercase' })).toBe('custom');
        expect(mapTool('custom', 'cursor', { unknownTransform: 'none' })).toBe('custom');
      });
    });

    describe('custom mappings', () => {
      it('should use custom mappings over defaults', () => {
        const result = mapTool('read', 'cursor', {
          customMappings: { read: 'CustomRead' },
        });
        expect(result).toBe('CustomRead');
      });

      it('should add new custom mappings', () => {
        const result = mapTool('mycustom', 'cursor', {
          customMappings: { mycustom: 'MyCustomTool' },
        });
        expect(result).toBe('MyCustomTool');
      });

      it('should preserve defaults for non-overridden tools', () => {
        const result = mapTool('execute', 'cursor', {
          customMappings: { read: 'CustomRead' },
        });
        expect(result).toBe('Execute');
      });
    });
  });

  describe('mapTools()', () => {
    it('should map array of tools', () => {
      const result = mapTools(['read', 'write', 'execute'], 'cursor');
      expect(result).toEqual(['Read', 'Create', 'Execute']);
    });

    it('should map array of tools for Claude', () => {
      const result = mapTools(['read', 'write', 'execute'], 'claude');
      expect(result).toEqual(['Read', 'Write', 'Bash']);
    });

    it('should handle empty array', () => {
      const result = mapTools([], 'cursor');
      expect(result).toEqual([]);
    });

    it('should filter out undefined when preserveUnknown is false', () => {
      const result = mapTools(['read', 'custom', 'write'], 'cursor', {
        preserveUnknown: false,
      });
      expect(result).toEqual(['Read', 'Create']);
    });

    it('should pass options to mapTool', () => {
      const result = mapTools(['read', 'mycustom'], 'cursor', {
        customMappings: { mycustom: 'CustomTool' },
      });
      expect(result).toEqual(['Read', 'CustomTool']);
    });
  });

  describe('getToolsForTarget()', () => {
    it('should return all Cursor tool mappings', () => {
      const tools = getToolsForTarget('cursor');
      expect(tools).toHaveProperty('read', 'Read');
      expect(tools).toHaveProperty('write', 'Create');
      expect(tools).toHaveProperty('execute', 'Execute');
    });

    it('should return all Claude tool mappings', () => {
      const tools = getToolsForTarget('claude');
      expect(tools).toHaveProperty('execute', 'Bash');
      expect(tools).toHaveProperty('ls', 'ListDir');
    });

    it('should return copy of mappings (not reference)', () => {
      const tools1 = getToolsForTarget('cursor');
      const tools2 = getToolsForTarget('cursor');
      tools1.read = 'Modified';
      expect(tools2.read).toBe('Read');
    });
  });

  describe('getGenericToolName()', () => {
    it('should reverse map Cursor tools', () => {
      expect(getGenericToolName('Read', 'cursor')).toBe('read');
      expect(getGenericToolName('Create', 'cursor')).toBe('write');
      expect(getGenericToolName('Execute', 'cursor')).toBe('execute');
      expect(getGenericToolName('Grep', 'cursor')).toBe('search');
    });

    it('should reverse map Claude tools', () => {
      expect(getGenericToolName('Bash', 'claude')).toBe('execute');
      expect(getGenericToolName('ListDir', 'claude')).toBe('ls');
      expect(getGenericToolName('WebFetch', 'claude')).toBe('fetch');
    });

    it('should be case insensitive', () => {
      expect(getGenericToolName('read', 'cursor')).toBe('read');
      expect(getGenericToolName('READ', 'cursor')).toBe('read');
      expect(getGenericToolName('bash', 'claude')).toBe('execute');
    });

    it('should return undefined for unknown tools', () => {
      expect(getGenericToolName('Unknown', 'cursor')).toBeUndefined();
      expect(getGenericToolName('NotATool', 'claude')).toBeUndefined();
    });
  });

  describe('isKnownGenericTool()', () => {
    it('should return true for known tools', () => {
      expect(isKnownGenericTool('read')).toBe(true);
      expect(isKnownGenericTool('write')).toBe(true);
      expect(isKnownGenericTool('edit')).toBe(true);
      expect(isKnownGenericTool('execute')).toBe(true);
      expect(isKnownGenericTool('search')).toBe(true);
      expect(isKnownGenericTool('glob')).toBe(true);
      expect(isKnownGenericTool('fetch')).toBe(true);
      expect(isKnownGenericTool('ls')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isKnownGenericTool('READ')).toBe(true);
      expect(isKnownGenericTool('Write')).toBe(true);
    });

    it('should return false for unknown tools', () => {
      expect(isKnownGenericTool('custom')).toBe(false);
      expect(isKnownGenericTool('unknown')).toBe(false);
    });
  });

  describe('createToolMapper()', () => {
    it('should create bound mapper for target', () => {
      const mapCursorTool = createToolMapper('cursor');
      expect(mapCursorTool('read')).toBe('Read');
      expect(mapCursorTool('execute')).toBe('Execute');
    });

    it('should create mapper with custom options', () => {
      const mapCustom = createToolMapper('cursor', {
        customMappings: { mycustom: 'MyTool' },
      });
      expect(mapCustom('mycustom')).toBe('MyTool');
      expect(mapCustom('read')).toBe('Read');
    });

    it('should create mapper with preserveUnknown false', () => {
      const mapStrict = createToolMapper('cursor', {
        preserveUnknown: false,
      });
      expect(mapStrict('read')).toBe('Read');
      expect(mapStrict('unknown')).toBeUndefined();
    });
  });

  describe('DEFAULT_TOOL_MAPPINGS', () => {
    it('should have config for all targets', () => {
      expect(DEFAULT_TOOL_MAPPINGS).toHaveProperty('cursor');
      expect(DEFAULT_TOOL_MAPPINGS).toHaveProperty('claude');
      expect(DEFAULT_TOOL_MAPPINGS).toHaveProperty('factory');
    });

    it('should have mappings property for each target', () => {
      expect(DEFAULT_TOOL_MAPPINGS.cursor).toHaveProperty('mappings');
      expect(DEFAULT_TOOL_MAPPINGS.claude).toHaveProperty('mappings');
      expect(DEFAULT_TOOL_MAPPINGS.factory).toHaveProperty('mappings');
    });

    it('should have preserveUnknown setting', () => {
      expect(DEFAULT_TOOL_MAPPINGS.cursor.preserveUnknown).toBe(true);
    });
  });
});

