/**
 * @file pip Loader Tests
 * @description Tests for loading content from pip packages
 */

import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  PipLoader,
  createPipLoader,
  clearPipCache,
  getPipCacheEntries,
  PIP_PREFIX,
} from '../../../src/loaders/pip.js';

// Test fixtures path - simulating site-packages structure
const FIXTURES_PATH = path.join(__dirname, '../../fixtures/pip-packages');

describe('PipLoader', () => {
  let loader: PipLoader;

  beforeEach(() => {
    loader = new PipLoader();
    clearPipCache();
  });

  afterEach(() => {
    clearPipCache();
  });

  describe('canLoad()', () => {
    it('should return true for pip: prefixed packages', () => {
      expect(loader.canLoad('pip:ai-rules-python')).toBe(true);
      expect(loader.canLoad('pip:django-rules')).toBe(true);
      expect(loader.canLoad('pip:package>=1.0.0')).toBe(true);
      expect(loader.canLoad('pip:package~=2.0.0')).toBe(true);
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

    it('should return false for npm: prefixed packages', () => {
      expect(loader.canLoad('npm:ai-rules')).toBe(false);
    });

    it('should return false for plain directory names', () => {
      expect(loader.canLoad('defaults')).toBe(false);
      expect(loader.canLoad('some-folder')).toBe(false);
    });
  });

  describe('load() - valid package', () => {
    it('should load content from valid pip package', async () => {
      const result = await loader.load('pip:ai-rules-test', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.rules[0]?.frontmatter.name).toBe('python');
      expect(result.personas.length).toBe(1);
      expect(result.personas[0]?.frontmatter.name).toBe('pythonista');
      expect(result.errors).toBeUndefined();
      expect(result.source).toBe('pip:ai-rules-test');
    });

    it('should parse rule frontmatter correctly', async () => {
      const result = await loader.load('pip:ai-rules-test', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      const pythonRule = result.rules.find((r) => r.frontmatter.name === 'python');
      expect(pythonRule).toBeDefined();
      expect(pythonRule!.frontmatter.description).toBe('Python coding standards');
      expect(pythonRule!.frontmatter.version).toBe('1.0.0');
      expect(pythonRule!.frontmatter.globs).toEqual(['**/*.py']);
      expect(pythonRule!.frontmatter.targets).toEqual(['cursor', 'claude']);
    });

    it('should parse persona frontmatter correctly', async () => {
      const result = await loader.load('pip:ai-rules-test', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      const pythonista = result.personas.find((p) => p.frontmatter.name === 'pythonista');
      expect(pythonista).toBeDefined();
      expect(pythonista!.frontmatter.tools).toEqual(['read', 'write', 'execute', 'search']);
      expect(pythonista!.frontmatter.model).toBe('default');
    });
  });

  describe('load() - package name normalization', () => {
    it('should handle hyphenated package names', async () => {
      // Package directory is ai_rules_test, but we request ai-rules-test
      const result = await loader.load('pip:ai-rules-test', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
    });

    it('should handle underscored package names', async () => {
      const result = await loader.load('pip:ai_rules_test', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
    });
  });

  describe('load() - custom content paths', () => {
    it('should load from custom content_path in pyproject.toml', async () => {
      const result = await loader.load('pip:ai-rules-custom', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.rules[0]?.frontmatter.name).toBe('django');
    });

    it('should load using custom directory configuration', async () => {
      const result = await loader.load('pip:ai-rules-configured', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.rules[0]?.frontmatter.name).toBe('flask');
      expect(result.personas.length).toBe(1);
      expect(result.personas[0]?.frontmatter.name).toBe('backend-dev');
    });
  });

  describe('load() - version handling', () => {
    it('should accept exact version match', async () => {
      const result = await loader.load('pip:ai-rules-test==1.2.3', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.errors).toBeUndefined();
    });

    it('should accept >= version', async () => {
      const result = await loader.load('pip:ai-rules-test>=1.0.0', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.errors).toBeUndefined();
    });

    it('should accept ~= version (compatible release)', async () => {
      // Package is 1.2.3, spec is ~=1.2.0
      const result = await loader.load('pip:ai-rules-test~=1.2.0', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.errors).toBeUndefined();
    });

    it('should accept <= version', async () => {
      const result = await loader.load('pip:ai-rules-test<=2.0.0', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.errors).toBeUndefined();
    });

    it('should reject incompatible version', async () => {
      // Package is 1.2.3, spec is >=2.0.0
      const result = await loader.load('pip:ai-rules-test>=2.0.0', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBe(1);
      expect(result.errors![0]?.message).toContain('does not satisfy');
    });

    it('should handle != version', async () => {
      // Package is 1.2.3, spec is !=1.2.3
      const result = await loader.load('pip:ai-rules-test!=1.2.3', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]?.message).toContain('does not satisfy');
    });

    it('should accept != for different version', async () => {
      // Package is 1.2.3, spec is !=2.0.0
      const result = await loader.load('pip:ai-rules-test!=2.0.0', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(1);
      expect(result.errors).toBeUndefined();
    });
  });

  describe('load() - error handling', () => {
    it('should return error for non-existent package', async () => {
      const result = await loader.load('pip:non-existent-package', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBe(1);
      expect(result.errors![0]?.message).toContain('Could not resolve pip package');
    });

    it('should return error for package without ai content', async () => {
      const result = await loader.load('pip:regular-pip-package', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(result.rules.length).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]?.message).toContain('does not contain ai-tool-sync content');
    });
  });

  describe('load() - target filtering', () => {
    it('should filter by target', async () => {
      const result = await loader.load('pip:ai-rules-test', {
        sitePackagesPaths: [FIXTURES_PATH],
        targets: ['factory'],
      });

      // python rule only has cursor and claude targets
      expect(result.rules.length).toBe(0);

      // pythonista persona has all targets including factory
      expect(result.personas.length).toBe(1);
    });

    it('should include rules matching target', async () => {
      const result = await loader.load('pip:ai-rules-test', {
        sitePackagesPaths: [FIXTURES_PATH],
        targets: ['cursor'],
      });

      expect(result.rules.length).toBe(1);
      expect(result.personas.length).toBe(1);
    });
  });

  describe('caching', () => {
    it('should cache resolved package paths', async () => {
      // First load
      await loader.load('pip:ai-rules-test', {
        sitePackagesPaths: [FIXTURES_PATH],
        useCache: true,
      });

      const cache = getPipCacheEntries();
      expect(cache.has('ai_rules_test')).toBe(true);
    });

    it('should reuse cached paths', async () => {
      // First load
      const result1 = await loader.load('pip:ai-rules-test', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      // Second load should use cache
      const result2 = await loader.load('pip:ai-rules-test', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(result1.rules.length).toBe(result2.rules.length);
    });

    it('should not cache when useCache is false', async () => {
      await loader.load('pip:ai-rules-test', {
        sitePackagesPaths: [FIXTURES_PATH],
        useCache: false,
      });

      const cache = getPipCacheEntries();
      expect(cache.has('ai_rules_test')).toBe(false);
    });

    it('should clear cache with clearPipCache()', async () => {
      await loader.load('pip:ai-rules-test', {
        sitePackagesPaths: [FIXTURES_PATH],
      });

      expect(getPipCacheEntries().size).toBeGreaterThan(0);

      clearPipCache();

      expect(getPipCacheEntries().size).toBe(0);
    });
  });
});

describe('createPipLoader()', () => {
  it('should create a new PipLoader instance', () => {
    const loader = createPipLoader();
    expect(loader).toBeInstanceOf(PipLoader);
    expect(loader.name).toBe('pip');
  });
});

describe('PIP_PREFIX constant', () => {
  it('should be "pip:"', () => {
    expect(PIP_PREFIX).toBe('pip:');
  });
});

