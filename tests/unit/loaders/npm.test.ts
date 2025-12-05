/**
 * @file npm Loader Tests
 * @description Tests for loading content from npm packages
 */

import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  NpmLoader,
  createNpmLoader,
  clearNpmCache,
  getNpmCacheEntries,
  NPM_PREFIX,
} from '../../../src/loaders/npm.js';

// Test fixtures path - simulating node_modules structure
const FIXTURES_PATH = path.join(__dirname, '../../fixtures/npm-packages');

describe('NpmLoader', () => {
  let loader: NpmLoader;

  beforeEach(() => {
    loader = new NpmLoader();
    clearNpmCache();
  });

  afterEach(() => {
    clearNpmCache();
  });

  describe('canLoad()', () => {
    it('should return true for npm: prefixed packages', () => {
      expect(loader.canLoad('npm:ai-rules-typescript')).toBe(true);
      expect(loader.canLoad('npm:@company/ai-rules')).toBe(true);
      expect(loader.canLoad('npm:package@1.0.0')).toBe(true);
      expect(loader.canLoad('npm:@scope/package@^2.0.0')).toBe(true);
    });

    it('should return true for scoped packages without prefix', () => {
      expect(loader.canLoad('@company/ai-rules')).toBe(true);
      expect(loader.canLoad('@org/package-name')).toBe(true);
    });

    it('should return false for local paths', () => {
      expect(loader.canLoad('./local/path')).toBe(false);
      expect(loader.canLoad('../relative/path')).toBe(false);
      expect(loader.canLoad('/absolute/path')).toBe(false);
    });

    it('should return false for URLs', () => {
      expect(loader.canLoad('https://example.com/rules')).toBe(false);
      expect(loader.canLoad('http://localhost/content')).toBe(false);
    });

    it('should return false for pip: prefixed packages', () => {
      expect(loader.canLoad('pip:ai-rules')).toBe(false);
    });

    it('should return false for plain directory names', () => {
      expect(loader.canLoad('defaults')).toBe(false);
      expect(loader.canLoad('some-folder')).toBe(false);
    });
  });

  describe('load() - valid package', () => {
    it('should load content from valid npm package', async () => {
      const result = await loader.load('npm:ai-rules-test', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.rules[0].frontmatter.name).toBe('typescript');
      expect(result.personas.length).toBe(1);
      expect(result.personas[0].frontmatter.name).toBe('reviewer');
      expect(result.errors).toBeUndefined();
      expect(result.source).toBe('npm:ai-rules-test');
    });

    it('should parse rule frontmatter correctly', async () => {
      const result = await loader.load('npm:ai-rules-test', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      const tsRule = result.rules.find((r) => r.frontmatter.name === 'typescript');
      expect(tsRule).toBeDefined();
      expect(tsRule!.frontmatter.description).toBe('TypeScript coding standards');
      expect(tsRule!.frontmatter.version).toBe('1.0.0');
      expect(tsRule!.frontmatter.globs).toEqual(['**/*.ts', '**/*.tsx']);
      expect(tsRule!.frontmatter.targets).toEqual(['cursor', 'claude']);
    });

    it('should parse persona frontmatter correctly', async () => {
      const result = await loader.load('npm:ai-rules-test', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      const reviewer = result.personas.find((p) => p.frontmatter.name === 'reviewer');
      expect(reviewer).toBeDefined();
      expect(reviewer!.frontmatter.tools).toEqual(['read', 'search', 'glob']);
      expect(reviewer!.frontmatter.model).toBe('default');
    });
  });

  describe('load() - scoped packages', () => {
    it('should load content from scoped package with npm: prefix', async () => {
      const result = await loader.load('npm:@company/ai-rules-react', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.rules[0].frontmatter.name).toBe('react');
      expect(result.personas.length).toBe(1);
      expect(result.personas[0].frontmatter.name).toBe('frontend-dev');
    });

    it('should load content from scoped package without prefix', async () => {
      const result = await loader.load('@company/ai-rules-react', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.personas.length).toBe(1);
    });
  });

  describe('load() - custom content paths', () => {
    it('should load from custom aiContentPath in package.json', async () => {
      const result = await loader.load('npm:ai-rules-custom', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.rules[0].frontmatter.name).toBe('custom-rule');
    });

    it('should load using aiToolSync configuration', async () => {
      const result = await loader.load('npm:ai-rules-configured', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.rules[0].frontmatter.name).toBe('configured');
      expect(result.personas.length).toBe(1);
      expect(result.personas[0].frontmatter.name).toBe('expert');
    });
  });

  describe('load() - version handling', () => {
    it('should accept exact version match', async () => {
      const result = await loader.load('npm:ai-rules-test@1.2.3', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.errors).toBeUndefined();
    });

    it('should accept compatible version with ^', async () => {
      // Package is 1.2.3, spec is ^1.0.0
      const result = await loader.load('npm:ai-rules-test@^1.0.0', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.errors).toBeUndefined();
    });

    it('should accept approximate version with ~', async () => {
      // Package is 1.2.3, spec is ~1.2.0
      const result = await loader.load('npm:ai-rules-test@~1.2.0', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.errors).toBeUndefined();
    });

    it('should accept >= version', async () => {
      const result = await loader.load('npm:ai-rules-test@>=1.0.0', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.errors).toBeUndefined();
    });

    it('should reject incompatible version', async () => {
      // Package is 1.2.3, spec is ^2.0.0
      const result = await loader.load('npm:ai-rules-test@^2.0.0', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBe(1);
      expect(result.errors![0].message).toContain('does not satisfy');
    });

    it('should handle scoped package with version', async () => {
      // @company/ai-rules-react is version 2.0.0
      const result = await loader.load('npm:@company/ai-rules-react@^2.0.0', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.errors).toBeUndefined();
    });
  });

  describe('load() - error handling', () => {
    it('should return error for non-existent package', async () => {
      const result = await loader.load('npm:non-existent-package', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBe(1);
      expect(result.errors![0].message).toContain('Could not resolve npm package');
    });

    it('should return error for package without ai content', async () => {
      const result = await loader.load('npm:regular-npm-package', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('does not contain ai-tool-sync content');
    });
  });

  describe('load() - target filtering', () => {
    it('should filter by target', async () => {
      const result = await loader.load('npm:ai-rules-test', {
        nodeModulesPaths: [FIXTURES_PATH],
        targets: ['factory'],
      });

      // typescript rule only has cursor and claude targets
      expect(result.rules.length).toBe(0);

      // reviewer persona has all targets including factory
      expect(result.personas.length).toBe(1);
    });
  });

  describe('caching', () => {
    it('should cache resolved package paths', async () => {
      // First load
      await loader.load('npm:ai-rules-test', {
        nodeModulesPaths: [FIXTURES_PATH],
        useCache: true,
      });

      const cache = getNpmCacheEntries();
      expect(cache.has('ai-rules-test')).toBe(true);
    });

    it('should reuse cached paths', async () => {
      // First load
      const result1 = await loader.load('npm:ai-rules-test', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      // Second load should use cache
      const result2 = await loader.load('npm:ai-rules-test', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      expect(result1.rules.length).toBe(result2.rules.length);
    });

    it('should not cache when useCache is false', async () => {
      await loader.load('npm:ai-rules-test', {
        nodeModulesPaths: [FIXTURES_PATH],
        useCache: false,
      });

      const cache = getNpmCacheEntries();
      expect(cache.has('ai-rules-test')).toBe(false);
    });

    it('should clear cache with clearNpmCache()', async () => {
      await loader.load('npm:ai-rules-test', {
        nodeModulesPaths: [FIXTURES_PATH],
      });

      expect(getNpmCacheEntries().size).toBeGreaterThan(0);

      clearNpmCache();

      expect(getNpmCacheEntries().size).toBe(0);
    });
  });
});

describe('createNpmLoader()', () => {
  it('should create a new NpmLoader instance', () => {
    const loader = createNpmLoader();
    expect(loader).toBeInstanceOf(NpmLoader);
    expect(loader.name).toBe('npm');
  });
});

describe('NPM_PREFIX constant', () => {
  it('should be "npm:"', () => {
    expect(NPM_PREFIX).toBe('npm:');
  });
});

