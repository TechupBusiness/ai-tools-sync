/**
 * @file Configuration Validator Tests
 * @description Tests for configuration validation
 */

import { describe, it, expect } from 'vitest';

import { validateConfig, formatValidationErrors } from '../../../src/config/validator.js';
import { isOk, isErr } from '../../../src/utils/result.js';

describe('Configuration Validator', () => {
  describe('validateConfig()', () => {
    describe('basic validation', () => {
      it('should accept valid minimal config', () => {
        const result = validateConfig({ version: '1.0.0' });
        expect(isOk(result)).toBe(true);
      });

      it('should reject non-object config', () => {
        expect(isErr(validateConfig(null))).toBe(true);
        expect(isErr(validateConfig('string'))).toBe(true);
        expect(isErr(validateConfig(123))).toBe(true);
        expect(isErr(validateConfig([]))).toBe(true);
      });

      it('should require version field', () => {
        const result = validateConfig({});
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.some((e) => e.path === 'version')).toBe(true);
        }
      });
    });

    describe('version validation', () => {
      it('should accept valid semver versions', () => {
        expect(isOk(validateConfig({ version: '1.0.0' }))).toBe(true);
        expect(isOk(validateConfig({ version: '1.2.3' }))).toBe(true);
      });

      it('should reject invalid version format', () => {
        const result = validateConfig({ version: '1.0' });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.some((e) => e.path === 'version')).toBe(true);
        }
      });

      it('should reject non-string version', () => {
        const result = validateConfig({ version: 1 });
        expect(isErr(result)).toBe(true);
      });

      it('should reject incompatible version', () => {
        const result = validateConfig({ version: '9.0.0' });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.some((e) => e.message.includes('not compatible'))).toBe(true);
        }
      });
    });

    describe('targets validation', () => {
      it('should accept valid targets', () => {
        const result = validateConfig({
          version: '1.0.0',
          targets: ['cursor', 'claude', 'factory'],
        });
        expect(isOk(result)).toBe(true);
      });

      it('should accept subset of targets', () => {
        const result = validateConfig({
          version: '1.0.0',
          targets: ['cursor'],
        });
        expect(isOk(result)).toBe(true);
      });

      it('should reject invalid target names', () => {
        const result = validateConfig({
          version: '1.0.0',
          targets: ['cursor', 'unknown'],
        });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.some((e) => e.path === 'targets[1]')).toBe(true);
        }
      });

      it('should reject non-array targets', () => {
        const result = validateConfig({
          version: '1.0.0',
          targets: 'cursor',
        });
        expect(isErr(result)).toBe(true);
      });
    });

    describe('loaders validation', () => {
      it('should accept valid loaders', () => {
        const result = validateConfig({
          version: '1.0.0',
          loaders: [
            { type: 'ai-tool-sync' },
            { type: 'local', source: './rules' },
          ],
        });
        expect(isOk(result)).toBe(true);
      });

      it('should require type for loaders', () => {
        const result = validateConfig({
          version: '1.0.0',
          loaders: [{}],
        });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.some((e) => e.path.includes('type'))).toBe(true);
        }
      });

      it('should reject invalid loader type', () => {
        const result = validateConfig({
          version: '1.0.0',
          loaders: [{ type: 'invalid' }],
        });
        expect(isErr(result)).toBe(true);
      });

      it('should require source for local loader', () => {
        const result = validateConfig({
          version: '1.0.0',
          loaders: [{ type: 'local' }],
        });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.some((e) => e.message.includes('Source is required'))).toBe(true);
        }
      });

      it('should require package for npm loader', () => {
        const result = validateConfig({
          version: '1.0.0',
          loaders: [{ type: 'npm' }],
        });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.some((e) => e.message.includes('Package is required'))).toBe(true);
        }
      });
    });

    describe('use section validation', () => {
      it('should accept valid use section', () => {
        const result = validateConfig({
          version: '1.0.0',
          use: {
            personas: ['architect', 'implementer'],
            commands: ['lint-fix'],
          },
        });
        expect(isOk(result)).toBe(true);
      });

      it('should reject non-object use section', () => {
        const result = validateConfig({
          version: '1.0.0',
          use: 'invalid',
        });
        expect(isErr(result)).toBe(true);
      });

      it('should validate plugins in use section', () => {
        const result = validateConfig({
          version: '1.0.0',
          use: {
            plugins: [{ name: 'test', source: 'ai-tool-sync' }],
          },
        });
        expect(isOk(result)).toBe(true);
      });

      it('should require plugin name and source', () => {
        const result = validateConfig({
          version: '1.0.0',
          use: {
            plugins: [{}],
          },
        });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.some((e) => e.message.includes('name is required'))).toBe(true);
          expect(result.error.some((e) => e.message.includes('source is required'))).toBe(true);
        }
      });
    });

    describe('rules validation', () => {
      it('should accept valid rules config', () => {
        const result = validateConfig({
          version: '1.0.0',
          rules: {
            core: {
              always_apply: true,
              targets: ['cursor', 'claude'],
            },
            database: {
              globs: ['**/*.sql'],
            },
          },
        });
        expect(isOk(result)).toBe(true);
      });

      it('should reject non-object rules', () => {
        const result = validateConfig({
          version: '1.0.0',
          rules: [],
        });
        expect(isErr(result)).toBe(true);
      });

      it('should validate rule targets', () => {
        const result = validateConfig({
          version: '1.0.0',
          rules: {
            test: {
              targets: ['invalid'],
            },
          },
        });
        expect(isErr(result)).toBe(true);
      });

      it('should validate globs are strings', () => {
        const result = validateConfig({
          version: '1.0.0',
          rules: {
            test: {
              globs: [123],
            },
          },
        });
        expect(isErr(result)).toBe(true);
      });
    });

    describe('subfolder_contexts validation', () => {
      it('should accept valid subfolder contexts', () => {
        const result = validateConfig({
          version: '1.0.0',
          subfolder_contexts: {
            'packages/engine': {
              rules: ['core', 'engine'],
              personas: ['implementer'],
            },
          },
        });
        expect(isOk(result)).toBe(true);
      });

      it('should require rules array', () => {
        const result = validateConfig({
          version: '1.0.0',
          subfolder_contexts: {
            'packages/engine': {
              personas: ['implementer'],
            },
          },
        });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.some((e) => e.message.includes('Rules array is required'))).toBe(true);
        }
      });
    });

    describe('hooks validation', () => {
      it('should accept valid hooks', () => {
        const result = validateConfig({
          version: '1.0.0',
          hooks: {
            PreToolUse: [
              { name: 'safety', match: 'Bash(*)', action: 'warn' },
            ],
          },
        });
        expect(isOk(result)).toBe(true);
      });

      it('should reject invalid hook event', () => {
        const result = validateConfig({
          version: '1.0.0',
          hooks: {
            InvalidEvent: [],
          },
        });
        expect(isErr(result)).toBe(true);
      });

      it('should require hook name, match, and action', () => {
        const result = validateConfig({
          version: '1.0.0',
          hooks: {
            PreToolUse: [{}],
          },
        });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.some((e) => e.message.includes('name is required'))).toBe(true);
          expect(result.error.some((e) => e.message.includes('match pattern is required'))).toBe(true);
          expect(result.error.some((e) => e.message.includes('action is required'))).toBe(true);
        }
      });

      it('should validate hook action values', () => {
        const result = validateConfig({
          version: '1.0.0',
          hooks: {
            PreToolUse: [
              { name: 'test', match: '*', action: 'invalid' },
            ],
          },
        });
        expect(isErr(result)).toBe(true);
      });
    });

    describe('output validation', () => {
      it('should accept valid output config', () => {
        const result = validateConfig({
          version: '1.0.0',
          output: {
            clean_before_sync: false,
            add_do_not_edit_headers: true,
          },
        });
        expect(isOk(result)).toBe(true);
      });

      it('should reject non-boolean output values', () => {
        const result = validateConfig({
          version: '1.0.0',
          output: {
            clean_before_sync: 'yes',
          },
        });
        expect(isErr(result)).toBe(true);
      });
    });

    describe('multiple errors', () => {
      it('should report all validation errors', () => {
        const result = validateConfig({
          version: 'invalid',
          targets: ['unknown'],
          loaders: [{}],
        });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.length).toBeGreaterThan(1);
        }
      });
    });
  });

  describe('formatValidationErrors()', () => {
    it('should format errors nicely', () => {
      const errors = [
        { path: 'version', message: 'Version is required' },
        { path: 'targets[0]', message: 'Invalid target' },
      ];
      const formatted = formatValidationErrors(errors);
      expect(formatted).toContain('version');
      expect(formatted).toContain('Version is required');
      expect(formatted).toContain('targets[0]');
    });

    it('should handle root-level errors', () => {
      const errors = [{ path: '', message: 'Config must be an object' }];
      const formatted = formatValidationErrors(errors);
      expect(formatted).toContain('(root)');
    });
  });
});

