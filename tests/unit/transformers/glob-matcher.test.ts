/**
 * @file Glob Matcher Tests
 * @description Tests for glob pattern matching functionality
 */

import { describe, it, expect } from 'vitest';

import {
  matchGlob,
  matchSingleGlob,
  filterByGlob,
  isNegationPattern,
  separatePatterns,
  matchWithNegation,
  filterWithNegation,
  normalizeGlobPattern,
  normalizeGlobPatterns,
  isRecursivePattern,
  hasAlternation,
  expandAlternations,
  createGlobMatcher,
  getMatchingPatterns,
  isValidGlobPattern,
  validatePatterns,
} from '../../../src/transformers/glob-matcher.js';

describe('Glob Matcher', () => {
  describe('matchGlob()', () => {
    describe('basic patterns', () => {
      it('should match simple wildcard patterns', () => {
        expect(matchGlob('file.ts', ['*.ts'])).toBe(true);
        expect(matchGlob('file.js', ['*.ts'])).toBe(false);
      });

      it('should match patterns with path', () => {
        expect(matchGlob('src/file.ts', ['src/*.ts'])).toBe(true);
        expect(matchGlob('lib/file.ts', ['src/*.ts'])).toBe(false);
      });
    });

    describe('recursive patterns (**)', () => {
      it('should match files in any directory', () => {
        expect(matchGlob('src/file.ts', ['**/*.ts'])).toBe(true);
        expect(matchGlob('src/deep/nested/file.ts', ['**/*.ts'])).toBe(true);
        expect(matchGlob('file.ts', ['**/*.ts'])).toBe(true);
      });

      it('should match directories at any depth', () => {
        expect(matchGlob('src/utils/helper.ts', ['src/**'])).toBe(true);
        expect(matchGlob('src/deep/nested/file.ts', ['src/**'])).toBe(true);
      });
    });

    describe('multiple patterns', () => {
      it('should match if any pattern matches', () => {
        expect(matchGlob('file.ts', ['*.ts', '*.js'])).toBe(true);
        expect(matchGlob('file.js', ['*.ts', '*.js'])).toBe(true);
        expect(matchGlob('file.py', ['*.ts', '*.js'])).toBe(false);
      });

      it('should handle empty patterns array', () => {
        expect(matchGlob('file.ts', [])).toBe(false);
      });
    });

    describe('options', () => {
      it('should support case-insensitive matching', () => {
        expect(matchGlob('FILE.TS', ['*.ts'], { nocase: true })).toBe(true);
        expect(matchGlob('FILE.TS', ['*.ts'], { nocase: false })).toBe(false);
      });

      it('should support dotfile matching', () => {
        expect(matchGlob('.gitignore', ['.*'], { dot: true })).toBe(true);
        expect(matchGlob('.gitignore', ['*'], { dot: false })).toBe(false);
        expect(matchGlob('.gitignore', ['*'], { dot: true })).toBe(true);
      });

      it('should support matchBase option', () => {
        expect(matchGlob('src/deep/file.ts', ['file.ts'], { matchBase: true })).toBe(true);
        expect(matchGlob('src/deep/file.ts', ['file.ts'], { matchBase: false })).toBe(false);
      });
    });
  });

  describe('matchSingleGlob()', () => {
    it('should match against single pattern', () => {
      expect(matchSingleGlob('file.ts', '*.ts')).toBe(true);
      expect(matchSingleGlob('file.js', '*.ts')).toBe(false);
    });

    it('should support options', () => {
      expect(matchSingleGlob('FILE.TS', '*.ts', { nocase: true })).toBe(true);
    });
  });

  describe('filterByGlob()', () => {
    it('should filter array of paths', () => {
      const paths = ['src/index.ts', 'src/utils.ts', 'package.json', 'README.md'];
      const result = filterByGlob(paths, ['**/*.ts']);
      expect(result).toEqual(['src/index.ts', 'src/utils.ts']);
    });

    it('should handle empty input', () => {
      expect(filterByGlob([], ['**/*.ts'])).toEqual([]);
    });

    it('should handle no matches', () => {
      const paths = ['package.json', 'README.md'];
      expect(filterByGlob(paths, ['**/*.ts'])).toEqual([]);
    });

    it('should match any of multiple patterns', () => {
      const paths = ['file.ts', 'file.js', 'file.css'];
      const result = filterByGlob(paths, ['*.ts', '*.js']);
      expect(result).toEqual(['file.ts', 'file.js']);
    });
  });

  describe('isNegationPattern()', () => {
    it('should identify negation patterns', () => {
      expect(isNegationPattern('!*.test.ts')).toBe(true);
      expect(isNegationPattern('!**/*.spec.ts')).toBe(true);
    });

    it('should return false for non-negation patterns', () => {
      expect(isNegationPattern('*.ts')).toBe(false);
      expect(isNegationPattern('**/*.ts')).toBe(false);
    });
  });

  describe('separatePatterns()', () => {
    it('should separate positive and negative patterns', () => {
      const result = separatePatterns(['**/*.ts', '!**/*.test.ts', 'src/**']);
      expect(result.positive).toEqual(['**/*.ts', 'src/**']);
      expect(result.negative).toEqual(['**/*.test.ts']);
    });

    it('should handle all positive patterns', () => {
      const result = separatePatterns(['**/*.ts', '**/*.js']);
      expect(result.positive).toEqual(['**/*.ts', '**/*.js']);
      expect(result.negative).toEqual([]);
    });

    it('should handle all negative patterns', () => {
      const result = separatePatterns(['!**/*.test.ts', '!**/*.spec.ts']);
      expect(result.positive).toEqual([]);
      expect(result.negative).toEqual(['**/*.test.ts', '**/*.spec.ts']);
    });

    it('should handle empty array', () => {
      const result = separatePatterns([]);
      expect(result.positive).toEqual([]);
      expect(result.negative).toEqual([]);
    });
  });

  describe('matchWithNegation()', () => {
    it('should match positive and exclude negative', () => {
      const patterns = ['**/*.ts', '!**/*.test.ts'];

      expect(matchWithNegation('src/utils.ts', patterns)).toBe(true);
      expect(matchWithNegation('src/utils.test.ts', patterns)).toBe(false);
    });

    it('should require positive match first', () => {
      const patterns = ['**/*.ts', '!**/*.test.ts'];
      expect(matchWithNegation('file.js', patterns)).toBe(false);
    });

    it('should return false with no positive patterns', () => {
      expect(matchWithNegation('file.ts', ['!**/*.test.ts'])).toBe(false);
    });

    it('should handle multiple negative patterns', () => {
      const patterns = ['**/*.ts', '!**/*.test.ts', '!**/*.spec.ts'];

      expect(matchWithNegation('src/utils.ts', patterns)).toBe(true);
      expect(matchWithNegation('src/utils.test.ts', patterns)).toBe(false);
      expect(matchWithNegation('src/utils.spec.ts', patterns)).toBe(false);
    });
  });

  describe('filterWithNegation()', () => {
    it('should filter with positive and negative patterns', () => {
      const paths = ['src/index.ts', 'src/utils.ts', 'src/utils.test.ts', 'src/index.spec.ts'];
      const patterns = ['**/*.ts', '!**/*.test.ts', '!**/*.spec.ts'];

      const result = filterWithNegation(paths, patterns);
      expect(result).toEqual(['src/index.ts', 'src/utils.ts']);
    });
  });

  describe('normalizeGlobPattern()', () => {
    it('should remove leading ./', () => {
      expect(normalizeGlobPattern('./src/*.ts')).toBe('src/*.ts');
    });

    it('should convert backslashes to forward slashes', () => {
      expect(normalizeGlobPattern('src\\utils\\*.ts')).toBe('src/utils/*.ts');
    });

    it('should handle empty string', () => {
      expect(normalizeGlobPattern('')).toBe('');
    });

    it('should pass through normal patterns unchanged', () => {
      expect(normalizeGlobPattern('**/*.ts')).toBe('**/*.ts');
    });
  });

  describe('normalizeGlobPatterns()', () => {
    it('should normalize array of patterns', () => {
      const result = normalizeGlobPatterns(['./src/*.ts', 'lib\\*.js']);
      expect(result).toEqual(['src/*.ts', 'lib/*.js']);
    });
  });

  describe('isRecursivePattern()', () => {
    it('should identify recursive patterns', () => {
      expect(isRecursivePattern('**/*.ts')).toBe(true);
      expect(isRecursivePattern('src/**')).toBe(true);
      expect(isRecursivePattern('src/**/utils')).toBe(true);
    });

    it('should return false for non-recursive patterns', () => {
      expect(isRecursivePattern('*.ts')).toBe(false);
      expect(isRecursivePattern('src/*.ts')).toBe(false);
    });
  });

  describe('hasAlternation()', () => {
    it('should identify alternation patterns', () => {
      expect(hasAlternation('*.{ts,tsx}')).toBe(true);
      expect(hasAlternation('src/*.{js,ts}')).toBe(true);
    });

    it('should return false for non-alternation patterns', () => {
      expect(hasAlternation('*.ts')).toBe(false);
      expect(hasAlternation('**/*.ts')).toBe(false);
    });

    it('should not match single items in braces', () => {
      expect(hasAlternation('{single}')).toBe(false);
    });
  });

  describe('expandAlternations()', () => {
    it('should expand simple alternation', () => {
      const result = expandAlternations('*.{ts,tsx}');
      expect(result).toEqual(['*.ts', '*.tsx']);
    });

    it('should expand alternation with path', () => {
      const result = expandAlternations('src/*.{js,ts}');
      expect(result).toEqual(['src/*.js', 'src/*.ts']);
    });

    it('should handle three options', () => {
      const result = expandAlternations('*.{ts,tsx,js}');
      expect(result).toContain('*.ts');
      expect(result).toContain('*.tsx');
      expect(result).toContain('*.js');
    });

    it('should pass through non-alternation patterns', () => {
      const result = expandAlternations('*.ts');
      expect(result).toEqual(['*.ts']);
    });

    it('should handle nested alternations', () => {
      const result = expandAlternations('{a,b}.{x,y}');
      expect(result.length).toBe(4);
      expect(result).toContain('a.x');
      expect(result).toContain('a.y');
      expect(result).toContain('b.x');
      expect(result).toContain('b.y');
    });
  });

  describe('createGlobMatcher()', () => {
    it('should create reusable matcher function', () => {
      const isTypeScript = createGlobMatcher(['**/*.ts', '**/*.tsx']);

      expect(isTypeScript('src/index.ts')).toBe(true);
      expect(isTypeScript('src/App.tsx')).toBe(true);
      expect(isTypeScript('package.json')).toBe(false);
    });

    it('should support negation in created matcher', () => {
      const isSource = createGlobMatcher(['**/*.ts', '!**/*.test.ts']);

      expect(isSource('src/utils.ts')).toBe(true);
      expect(isSource('src/utils.test.ts')).toBe(false);
    });

    it('should return false for empty positive patterns', () => {
      const matcher = createGlobMatcher(['!**/*.test.ts']);
      expect(matcher('src/utils.ts')).toBe(false);
    });

    it('should support options', () => {
      const matcher = createGlobMatcher(['*.ts'], { nocase: true });
      expect(matcher('FILE.TS')).toBe(true);
    });
  });

  describe('getMatchingPatterns()', () => {
    it('should return all patterns that match', () => {
      const patterns = ['**/*.ts', '**/*.tsx', 'src/**', '*.json'];
      const result = getMatchingPatterns('src/index.ts', patterns);

      expect(result).toContain('**/*.ts');
      expect(result).toContain('src/**');
      expect(result).not.toContain('**/*.tsx');
      expect(result).not.toContain('*.json');
    });

    it('should return empty array for no matches', () => {
      const result = getMatchingPatterns('file.py', ['*.ts', '*.js']);
      expect(result).toEqual([]);
    });
  });

  describe('isValidGlobPattern()', () => {
    it('should return true for valid patterns', () => {
      expect(isValidGlobPattern('**/*.ts')).toBe(true);
      expect(isValidGlobPattern('src/*')).toBe(true);
      expect(isValidGlobPattern('*.{ts,tsx}')).toBe(true);
      expect(isValidGlobPattern('!**/*.test.ts')).toBe(true);
    });

    it('should return true for simple strings', () => {
      expect(isValidGlobPattern('file.ts')).toBe(true);
      expect(isValidGlobPattern('')).toBe(true);
    });
  });

  describe('validatePatterns()', () => {
    it('should separate valid and invalid patterns', () => {
      const patterns = ['**/*.ts', 'src/*', '*.tsx'];
      const result = validatePatterns(patterns);

      expect(result.valid).toEqual(['**/*.ts', 'src/*', '*.tsx']);
      expect(result.invalid).toEqual([]);
    });

    it('should handle empty array', () => {
      const result = validatePatterns([]);
      expect(result.valid).toEqual([]);
      expect(result.invalid).toEqual([]);
    });
  });

  describe('real-world patterns', () => {
    it('should match TypeScript files except tests', () => {
      const patterns = ['**/*.ts', '**/*.tsx', '!**/*.test.ts', '!**/*.spec.ts'];
      const files = [
        'src/index.ts',
        'src/components/Button.tsx',
        'src/utils.test.ts',
        'tests/app.spec.ts',
      ];

      const result = filterWithNegation(files, patterns);
      expect(result).toEqual(['src/index.ts', 'src/components/Button.tsx']);
    });

    it('should match SQL and database files', () => {
      const patterns = ['**/*.sql', 'db/**/*', 'migrations/**'];
      const files = ['schema.sql', 'db/seeds/users.ts', 'migrations/001_init.sql', 'src/index.ts'];

      const result = filterByGlob(files, patterns);
      expect(result).toContain('schema.sql');
      expect(result).toContain('db/seeds/users.ts');
      expect(result).toContain('migrations/001_init.sql');
      expect(result).not.toContain('src/index.ts');
    });

    it('should match specific directories', () => {
      const patterns = ['packages/trade-engine/**'];
      const files = [
        'packages/trade-engine/src/index.ts',
        'packages/trade-engine/tests/engine.test.ts',
        'packages/web-ui/src/App.tsx',
      ];

      const result = filterByGlob(files, patterns);
      expect(result).toEqual([
        'packages/trade-engine/src/index.ts',
        'packages/trade-engine/tests/engine.test.ts',
      ]);
    });
  });
});
