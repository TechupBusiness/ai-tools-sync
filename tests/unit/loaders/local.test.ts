/**
 * @file Local Loader Tests
 * @description Tests for loading content from local directories
 */

import * as path from 'node:path';

import { describe, it, expect, beforeAll } from 'vitest';

import {
  emptyLoadResult,
  mergeLoadResults,
  filterLoadResultByTarget,
  isLoadResultEmpty,
  getLoadResultStats,
} from '../../../src/loaders/base.js';
import { LocalLoader, createLocalLoader } from '../../../src/loaders/local.js';

// Test fixtures path
const FIXTURES_PATH = path.join(__dirname, '../../fixtures/loaders');
const VALID_SOURCE = path.join(FIXTURES_PATH, 'valid-source');
const EMPTY_SOURCE = path.join(FIXTURES_PATH, 'empty-source');
const INVALID_SOURCE = path.join(FIXTURES_PATH, 'invalid-source');
const NONEXISTENT_SOURCE = path.join(FIXTURES_PATH, 'nonexistent');

describe('LocalLoader', () => {
  let loader: LocalLoader;

  beforeAll(() => {
    loader = new LocalLoader();
  });

  describe('canLoad()', () => {
    it('should return true for absolute paths', () => {
      expect(loader.canLoad('/Users/test/project/.ai')).toBe(true);
      expect(loader.canLoad('/var/lib/content')).toBe(true);
    });

    it('should return true for relative paths', () => {
      expect(loader.canLoad('./ai')).toBe(true);
      expect(loader.canLoad('../shared/rules')).toBe(true);
      expect(loader.canLoad('../../project/.ai')).toBe(true);
    });

    it('should return true for plain directory names', () => {
      expect(loader.canLoad('defaults')).toBe(true);
      expect(loader.canLoad('ai-tool-sync')).toBe(true);
      expect(loader.canLoad('my_rules')).toBe(true);
    });

    it('should return false for URLs', () => {
      expect(loader.canLoad('https://example.com/rules')).toBe(false);
      expect(loader.canLoad('http://localhost/content')).toBe(false);
      expect(loader.canLoad('file://local/path')).toBe(false);
    });

    it('should return false for npm/pip package prefixes', () => {
      expect(loader.canLoad('npm:@company/rules')).toBe(false);
      expect(loader.canLoad('pip:ai-rules')).toBe(false);
    });
  });

  describe('load() - valid source', () => {
    it('should load all content types from valid source', async () => {
      const result = await loader.load(VALID_SOURCE);

      expect(result.rules.length).toBe(3);
      expect(result.personas.length).toBe(2);
      expect(result.commands.length).toBe(1);
      expect(result.hooks.length).toBe(1);
      expect(result.errors).toBeUndefined();
      expect(result.source).toBe(VALID_SOURCE);
    });

    it('should parse rule frontmatter correctly', async () => {
      const result = await loader.load(VALID_SOURCE);

      const databaseRule = result.rules.find((r) => r.frontmatter.name === 'database');
      expect(databaseRule).toBeDefined();
      expect(databaseRule!.frontmatter.description).toBe('Database rules for SQL and migrations');
      expect(databaseRule!.frontmatter.version).toBe('1.0.0');
      expect(databaseRule!.frontmatter.always_apply).toBe(false);
      expect(databaseRule!.frontmatter.globs).toEqual(['**/*.sql', 'db/**/*']);
      expect(databaseRule!.frontmatter.targets).toEqual(['cursor', 'claude']);
      expect(databaseRule!.frontmatter.category).toBe('infrastructure');
      expect(databaseRule!.frontmatter.priority).toBe('high');
    });

    it('should parse persona frontmatter correctly', async () => {
      const result = await loader.load(VALID_SOURCE);

      const architect = result.personas.find((p) => p.frontmatter.name === 'architect');
      expect(architect).toBeDefined();
      expect(architect!.frontmatter.description).toBe('System architect for high-level design');
      expect(architect!.frontmatter.tools).toEqual(['read', 'search', 'glob']);
      expect(architect!.frontmatter.model).toBe('default');
    });

    it('should parse command frontmatter correctly', async () => {
      const result = await loader.load(VALID_SOURCE);

      const deploy = result.commands.find((c) => c.frontmatter.name === 'deploy');
      expect(deploy).toBeDefined();
      expect(deploy!.frontmatter.execute).toBe('scripts/deploy.sh');
      expect(deploy!.frontmatter.args).toHaveLength(2);
      expect(deploy!.frontmatter.args![0].name).toBe('environment');
      expect(deploy!.frontmatter.args![0].choices).toEqual(['staging', 'production']);
    });

    it('should parse hook frontmatter correctly', async () => {
      const result = await loader.load(VALID_SOURCE);

      const preCommit = result.hooks.find((h) => h.frontmatter.name === 'pre-commit');
      expect(preCommit).toBeDefined();
      expect(preCommit!.frontmatter.event).toBe('PreToolUse');
      expect(preCommit!.frontmatter.tool_match).toBe('Bash(git commit*)');
      expect(preCommit!.frontmatter.targets).toEqual(['claude']);
    });

    it('should include file paths in parsed content', async () => {
      const result = await loader.load(VALID_SOURCE);

      for (const rule of result.rules) {
        expect(rule.filePath).toBeDefined();
        expect(rule.filePath).toContain('rules/');
        expect(rule.filePath!.endsWith('.md')).toBe(true);
      }

      for (const persona of result.personas) {
        expect(persona.filePath).toBeDefined();
        expect(persona.filePath).toContain('personas/');
      }
    });
  });

  describe('load() - target filtering', () => {
    it('should filter by single target', async () => {
      const result = await loader.load(VALID_SOURCE, {
        targets: ['cursor'],
      });

      // All rules have cursor in targets (cursor-only, database, testing)
      expect(result.rules.length).toBe(3);

      // implementer and architect both have cursor
      expect(result.personas.length).toBe(2);

      // deploy has cursor
      expect(result.commands.length).toBe(1);

      // pre-commit only has claude
      expect(result.hooks.length).toBe(0);
    });

    it('should filter by claude target', async () => {
      const result = await loader.load(VALID_SOURCE, {
        targets: ['claude'],
      });

      // database and testing have claude (cursor-only does not)
      expect(result.rules.length).toBe(2);
      expect(result.rules.every((r) => r.frontmatter.name !== 'cursor-only')).toBe(true);

      // All personas have claude
      expect(result.personas.length).toBe(2);

      // deploy has claude
      expect(result.commands.length).toBe(1);

      // pre-commit has claude
      expect(result.hooks.length).toBe(1);
    });

    it('should filter by factory target', async () => {
      const result = await loader.load(VALID_SOURCE, {
        targets: ['factory'],
      });

      // Only testing has factory
      expect(result.rules.length).toBe(1);
      expect(result.rules[0].frontmatter.name).toBe('testing');

      // Only architect has factory
      expect(result.personas.length).toBe(1);
      expect(result.personas[0].frontmatter.name).toBe('architect');
    });

    it('should filter by multiple targets (OR logic)', async () => {
      const result = await loader.load(VALID_SOURCE, {
        targets: ['claude', 'factory'],
      });

      // database (claude), testing (claude, factory)
      expect(result.rules.length).toBe(2);
    });
  });

  describe('load() - empty/missing directories', () => {
    it('should return empty result for empty source directory', async () => {
      const result = await loader.load(EMPTY_SOURCE);

      expect(result.rules).toEqual([]);
      expect(result.personas).toEqual([]);
      expect(result.commands).toEqual([]);
      expect(result.hooks).toEqual([]);
      expect(result.errors).toBeUndefined();
    });

    it('should return empty result for nonexistent source', async () => {
      const result = await loader.load(NONEXISTENT_SOURCE);

      expect(result.rules).toEqual([]);
      expect(result.personas).toEqual([]);
      expect(result.commands).toEqual([]);
      expect(result.hooks).toEqual([]);
    });

    it('should handle missing subdirectories gracefully', async () => {
      // Empty source has no rules/, personas/, etc. subdirectories
      const result = await loader.load(EMPTY_SOURCE);

      expect(isLoadResultEmpty(result)).toBe(true);
    });
  });

  describe('load() - error handling', () => {
    it('should collect errors but continue loading valid files', async () => {
      const result = await loader.load(INVALID_SOURCE);

      // Should have loaded the valid rule
      expect(result.rules.length).toBe(1);
      expect(result.rules[0].frontmatter.name).toBe('valid-rule');

      // Should have errors for invalid files
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);

      // Check error types
      const ruleErrors = result.errors!.filter((e) => e.type === 'rule');
      const personaErrors = result.errors!.filter((e) => e.type === 'persona');

      expect(ruleErrors.length).toBe(1);
      expect(ruleErrors[0].path).toContain('missing-name.md');

      expect(personaErrors.length).toBe(1);
      expect(personaErrors[0].path).toContain('invalid-tools.md');
    });

    it('should stop on error when continueOnError is false', async () => {
      const result = await loader.load(INVALID_SOURCE, {
        continueOnError: false,
      });

      // Depending on file order, might get some content or errors
      expect(result.errors).toBeDefined();
    });
  });

  describe('load() - custom directories', () => {
    it('should use custom directory names', async () => {
      // This test uses valid-source but with custom directory names
      // Since we don't have matching custom directories, should return empty
      const result = await loader.load(VALID_SOURCE, {
        directories: {
          rules: 'custom-rules',
          personas: 'custom-personas',
        },
      });

      expect(result.rules).toEqual([]);
      expect(result.personas).toEqual([]);
      // commands and hooks use default directories
      expect(result.commands.length).toBe(1);
      expect(result.hooks.length).toBe(1);
    });
  });

  describe('load() - include/exclude patterns', () => {
    it('should include only matching files', async () => {
      const result = await loader.load(VALID_SOURCE, {
        include: ['database*'],
      });

      // Only database.md should match in rules
      expect(result.rules.length).toBe(1);
      expect(result.rules[0].frontmatter.name).toBe('database');

      // No personas/commands/hooks match
      expect(result.personas.length).toBe(0);
    });

    it('should exclude matching files', async () => {
      const result = await loader.load(VALID_SOURCE, {
        exclude: ['database*'],
      });

      // database.md should be excluded
      expect(result.rules.length).toBe(2);
      expect(result.rules.every((r) => r.frontmatter.name !== 'database')).toBe(true);
    });

    it('should support glob patterns in include/exclude', async () => {
      const result = await loader.load(VALID_SOURCE, {
        include: ['*.md'], // All markdown files
        exclude: ['*-only*'], // Exclude files with "-only" in name
      });

      // cursor-only.md should be excluded
      expect(result.rules.length).toBe(2);
      expect(result.rules.every((r) => r.frontmatter.name !== 'cursor-only')).toBe(true);
    });
  });

  describe('load() - basePath option', () => {
    it('should resolve relative paths from basePath', async () => {
      const result = await loader.load('valid-source', {
        basePath: FIXTURES_PATH,
      });

      expect(result.rules.length).toBe(3);
      expect(result.personas.length).toBe(2);
    });
  });
});

describe('createLocalLoader()', () => {
  it('should create a new LocalLoader instance', () => {
    const loader = createLocalLoader();
    expect(loader).toBeInstanceOf(LocalLoader);
    expect(loader.name).toBe('local');
  });
});

describe('Base loader utilities', () => {
  describe('emptyLoadResult()', () => {
    it('should create an empty result', () => {
      const result = emptyLoadResult();

      expect(result.rules).toEqual([]);
      expect(result.personas).toEqual([]);
      expect(result.commands).toEqual([]);
      expect(result.hooks).toEqual([]);
      expect(result.errors).toBeUndefined();
    });
  });

  describe('mergeLoadResults()', () => {
    it('should merge multiple results', async () => {
      const loader = new LocalLoader();
      const result1 = await loader.load(VALID_SOURCE);
      const result2 = await loader.load(VALID_SOURCE);

      const merged = mergeLoadResults(result1, result2);

      expect(merged.rules.length).toBe(result1.rules.length + result2.rules.length);
      expect(merged.personas.length).toBe(result1.personas.length + result2.personas.length);
    });

    it('should merge errors from multiple results', async () => {
      const loader = new LocalLoader();
      const result1 = await loader.load(INVALID_SOURCE);
      const result2 = await loader.load(INVALID_SOURCE);

      const merged = mergeLoadResults(result1, result2);

      expect(merged.errors).toBeDefined();
      expect(merged.errors!.length).toBe(
        (result1.errors?.length ?? 0) + (result2.errors?.length ?? 0)
      );
    });
  });

  describe('filterLoadResultByTarget()', () => {
    it('should filter result by target', async () => {
      const loader = new LocalLoader();
      const result = await loader.load(VALID_SOURCE);

      const filtered = filterLoadResultByTarget(result, 'factory');

      // Only testing rule has factory
      expect(filtered.rules.length).toBe(1);
      // Only architect persona has factory
      expect(filtered.personas.length).toBe(1);
    });
  });

  describe('isLoadResultEmpty()', () => {
    it('should return true for empty result', () => {
      expect(isLoadResultEmpty(emptyLoadResult())).toBe(true);
    });

    it('should return false for non-empty result', async () => {
      const loader = new LocalLoader();
      const result = await loader.load(VALID_SOURCE);

      expect(isLoadResultEmpty(result)).toBe(false);
    });
  });

  describe('getLoadResultStats()', () => {
    it('should return correct statistics', async () => {
      const loader = new LocalLoader();
      const result = await loader.load(VALID_SOURCE);

      const stats = getLoadResultStats(result);

      expect(stats.rules).toBe(3);
      expect(stats.personas).toBe(2);
      expect(stats.commands).toBe(1);
      expect(stats.hooks).toBe(1);
      expect(stats.errors).toBe(0);
      expect(stats.total).toBe(7);
    });

    it('should count errors', async () => {
      const loader = new LocalLoader();
      const result = await loader.load(INVALID_SOURCE);

      const stats = getLoadResultStats(result);

      expect(stats.errors).toBeGreaterThan(0);
    });
  });
});
