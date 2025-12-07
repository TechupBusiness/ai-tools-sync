/**
 * @file Configuration Defaults Tests
 * @description Tests for configuration default values and utilities
 */

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_OUTPUT,
  DEFAULT_TARGETS,
  DEFAULT_LOADERS,
  applyDefaults,
  isValidVersion,
  compareVersions,
  isVersionCompatible,
  isSupportedTarget,
} from '../../../src/config/defaults.js';

describe('Configuration Defaults', () => {
  describe('DEFAULT_OUTPUT', () => {
    it('should have clean_before_sync enabled', () => {
      expect(DEFAULT_OUTPUT.clean_before_sync).toBe(true);
    });

    it('should have add_do_not_edit_headers enabled', () => {
      expect(DEFAULT_OUTPUT.add_do_not_edit_headers).toBe(true);
    });
  });

  describe('DEFAULT_TARGETS', () => {
    it('should include cursor, claude, and factory', () => {
      expect(DEFAULT_TARGETS).toContain('cursor');
      expect(DEFAULT_TARGETS).toContain('claude');
      expect(DEFAULT_TARGETS).toContain('factory');
    });

    it('should have exactly 3 targets', () => {
      expect(DEFAULT_TARGETS).toHaveLength(3);
    });
  });

  describe('DEFAULT_LOADERS', () => {
    it('should include ai-tool-sync loader by default', () => {
      expect(DEFAULT_LOADERS).toHaveLength(1);
      expect(DEFAULT_LOADERS[0].type).toBe('ai-tool-sync');
    });
  });

  describe('isSupportedTarget()', () => {
    it('should return true for supported targets', () => {
      expect(isSupportedTarget('cursor')).toBe(true);
      expect(isSupportedTarget('claude')).toBe(true);
      expect(isSupportedTarget('factory')).toBe(true);
    });

    it('should return false for unsupported targets', () => {
      expect(isSupportedTarget('vscode')).toBe(false);
      expect(isSupportedTarget('unknown')).toBe(false);
      expect(isSupportedTarget('')).toBe(false);
    });
  });

  describe('applyDefaults()', () => {
    it('should apply defaults to empty config', () => {
      const result = applyDefaults({ version: '1.0.0' });
      expect(result.version).toBe('1.0.0');
      expect(result.targets).toEqual(['cursor', 'claude', 'factory']);
      expect(result.output?.clean_before_sync).toBe(true);
      expect(result.output?.add_do_not_edit_headers).toBe(true);
    });

    it('should preserve provided values', () => {
      const result = applyDefaults({
        version: '2.0.0',
        targets: ['cursor'],
        project_name: 'test-project',
      });
      expect(result.version).toBe('2.0.0');
      expect(result.targets).toEqual(['cursor']);
      expect(result.project_name).toBe('test-project');
    });

    it('should deep merge output settings', () => {
      const result = applyDefaults({
        version: '1.0.0',
        output: { clean_before_sync: false },
      });
      expect(result.output?.clean_before_sync).toBe(false);
      expect(result.output?.add_do_not_edit_headers).toBe(true);
    });

    it('should not override provided loaders', () => {
      const customLoaders = [{ type: 'local' as const, source: './custom' }];
      const result = applyDefaults({
        version: '1.0.0',
        loaders: customLoaders,
      });
      expect(result.loaders).toEqual(customLoaders);
    });
  });

  describe('isValidVersion()', () => {
    it('should return true for valid semver versions', () => {
      expect(isValidVersion('1.0.0')).toBe(true);
      expect(isValidVersion('0.1.0')).toBe(true);
      expect(isValidVersion('10.20.30')).toBe(true);
    });

    it('should return false for invalid versions', () => {
      expect(isValidVersion('1.0')).toBe(false);
      expect(isValidVersion('1')).toBe(false);
      expect(isValidVersion('v1.0.0')).toBe(false);
      expect(isValidVersion('1.0.0-beta')).toBe(false);
      expect(isValidVersion('')).toBe(false);
      expect(isValidVersion('abc')).toBe(false);
    });
  });

  describe('compareVersions()', () => {
    it('should return 0 for equal versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('2.3.4', '2.3.4')).toBe(0);
    });

    it('should return -1 when first version is lower', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    });

    it('should return 1 when first version is higher', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    });
  });

  describe('isVersionCompatible()', () => {
    it('should return true for compatible versions (same major)', () => {
      expect(isVersionCompatible('1.0.0', '1.0.0')).toBe(true);
      expect(isVersionCompatible('1.0.0', '1.5.0')).toBe(true);
      expect(isVersionCompatible('1.2.3', '1.0.0')).toBe(true);
    });

    it('should return false for incompatible versions (different major)', () => {
      expect(isVersionCompatible('2.0.0', '1.0.0')).toBe(false);
      expect(isVersionCompatible('0.1.0', '1.0.0')).toBe(false);
    });

    it('should return false for invalid versions', () => {
      expect(isVersionCompatible('invalid', '1.0.0')).toBe(false);
      expect(isVersionCompatible('1.0', '1.0.0')).toBe(false);
    });

    it('should use default tool version when not provided', () => {
      expect(isVersionCompatible('1.0.0')).toBe(true);
    });
  });
});

