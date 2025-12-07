/**
 * @file Plugin Cache Tests
 * @description Tests for centralized plugin caching
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  PluginCache,
  createPluginCache,
  generatePluginId,
  resolvePluginRootVariable,
  calculateContentHash,
  CLAUDE_PLUGIN_ROOT_VAR,
  DEFAULT_PLUGIN_CACHE_DIR,
  CACHE_MANIFEST_FILE,
  PLUGIN_META_FILE,
} from '../../../src/utils/plugin-cache.js';

describe('generatePluginId()', () => {
  it('should generate ID for github source', () => {
    expect(generatePluginId('github:owner/repo')).toBe('github_owner_repo');
    expect(generatePluginId('github:owner/repo', 'v1.0.0')).toBe('github_owner_repo_v1.0.0');
    expect(generatePluginId('github:owner/repo@v2.1.0')).toBe('github_owner_repo_v2.1.0');
  });

  it('should generate ID for gitlab source', () => {
    expect(generatePluginId('gitlab:owner/repo')).toBe('gitlab_owner_repo');
    expect(generatePluginId('gitlab:owner/repo', '1.0.0')).toBe('gitlab_owner_repo_1.0.0');
  });

  it('should generate ID for npm source', () => {
    expect(generatePluginId('npm:package')).toBe('npm_package');
    expect(generatePluginId('npm:@org/package')).toBe('npm_org_package');
    expect(generatePluginId('npm:@org/package', '1.2.3')).toBe('npm_org_package_1.2.3');
  });

  it('should handle claude-plugin prefix', () => {
    expect(generatePluginId('claude-plugin:npm:@anthropic/tools')).toBe('npm_anthropic_tools');
  });

  it('should sanitize special characters', () => {
    expect(generatePluginId('github:owner/repo#branch')).toBe('github_owner_repo_branch');
    expect(generatePluginId('github:owner/repo/subpath')).toBe('github_owner_repo_subpath');
  });

  it('should not duplicate version in ID', () => {
    const id = generatePluginId('github:owner/repo@v1.0.0', 'v1.0.0');
    expect(id).toBe('github_owner_repo_v1.0.0');
    expect(id).not.toContain('v1.0.0_v1.0.0');
  });

  it('should handle bitbucket source', () => {
    expect(generatePluginId('bitbucket:owner/repo')).toBe('bitbucket_owner_repo');
  });

  it('should handle pip source', () => {
    expect(generatePluginId('pip:package')).toBe('pip_package');
  });
});

describe('resolvePluginRootVariable()', () => {
  it('should resolve ${CLAUDE_PLUGIN_ROOT} variable', () => {
    const input = '${CLAUDE_PLUGIN_ROOT}/commands/test.md';
    const result = resolvePluginRootVariable(input, '/path/to/plugin');
    expect(result).toBe('/path/to/plugin/commands/test.md');
  });

  it('should handle multiple occurrences', () => {
    const input = '${CLAUDE_PLUGIN_ROOT}/a and ${CLAUDE_PLUGIN_ROOT}/b';
    const result = resolvePluginRootVariable(input, '/root');
    expect(result).toBe('/root/a and /root/b');
  });

  it('should return original string if no variable present', () => {
    const input = './relative/path';
    expect(resolvePluginRootVariable(input, '/root')).toBe('./relative/path');
  });

  it('should handle empty string', () => {
    expect(resolvePluginRootVariable('', '/root')).toBe('');
  });
});

describe('calculateContentHash()', () => {
  it('should return 16-character hash', () => {
    const hash = calculateContentHash('test content');
    expect(hash).toHaveLength(16);
  });

  it('should return same hash for same content', () => {
    const hash1 = calculateContentHash('test');
    const hash2 = calculateContentHash('test');
    expect(hash1).toBe(hash2);
  });

  it('should return different hash for different content', () => {
    const hash1 = calculateContentHash('test1');
    const hash2 = calculateContentHash('test2');
    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty string', () => {
    const hash = calculateContentHash('');
    expect(hash).toHaveLength(16);
  });
});

describe('PluginCache', () => {
  let tempDir: string;
  let cache: PluginCache;

  beforeEach(async () => {
    tempDir = path.join(__dirname, '.test-cache-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });

    const result = await createPluginCache(tempDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      cache = result.value;
    }
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('init()', () => {
    it('should create cache directory', async () => {
      const cacheDir = cache.getCacheDir();
      const stat = await fs.stat(cacheDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should create manifest file', async () => {
      const manifestPath = path.join(cache.getCacheDir(), CACHE_MANIFEST_FILE);
      const stat = await fs.stat(manifestPath);
      expect(stat.isFile()).toBe(true);
    });

    it('should have valid manifest structure', async () => {
      const manifestPath = path.join(cache.getCacheDir(), CACHE_MANIFEST_FILE);
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);

      expect(manifest.version).toBe('1.0.0');
      expect(manifest.plugins).toBeDefined();
      expect(typeof manifest.plugins).toBe('object');
      expect(manifest.lastUpdated).toBeDefined();
    });
  });

  describe('getCacheDir()', () => {
    it('should return cache directory path', () => {
      const cacheDir = cache.getCacheDir();
      expect(cacheDir).toBe(path.join(tempDir, DEFAULT_PLUGIN_CACHE_DIR));
    });
  });

  describe('getPluginPath()', () => {
    it('should return plugin path by ID', () => {
      const pluginId = 'github_owner_repo_v1.0.0';
      const pluginPath = cache.getPluginPath(pluginId);
      expect(pluginPath).toBe(path.join(tempDir, DEFAULT_PLUGIN_CACHE_DIR, pluginId));
    });
  });

  describe('isCached()', () => {
    it('should return false for uncached plugin', async () => {
      const result = await cache.isCached('github:owner/repo', 'v1.0.0');
      expect(result).toBe(false);
    });

    it('should return true for cached plugin', async () => {
      // Create a fake cached plugin
      const pluginId = generatePluginId('github:owner/repo', 'v1.0.0');
      const pluginPath = cache.getPluginPath(pluginId);
      await fs.mkdir(pluginPath, { recursive: true });

      await cache.cachePlugin('github:owner/repo', 'v1.0.0', pluginPath);

      const result = await cache.isCached('github:owner/repo', 'v1.0.0');
      expect(result).toBe(true);
    });

    it('should return false for different version', async () => {
      const pluginId = generatePluginId('github:owner/repo', 'v1.0.0');
      const pluginPath = cache.getPluginPath(pluginId);
      await fs.mkdir(pluginPath, { recursive: true });

      await cache.cachePlugin('github:owner/repo', 'v1.0.0', pluginPath);

      const result = await cache.isCached('github:owner/repo', 'v2.0.0');
      expect(result).toBe(false);
    });

    it('should return false if directory does not exist', async () => {
      // Add to manifest without creating directory
      const pluginId = generatePluginId('github:owner/repo', 'v1.0.0');
      const pluginPath = cache.getPluginPath(pluginId);

      // Force add to manifest (simulating corrupted state)
      await cache.cachePlugin('github:owner/repo', 'v1.0.0', pluginPath);
      
      // Remove the directory
      await fs.rm(pluginPath, { recursive: true, force: true });

      const result = await cache.isCached('github:owner/repo', 'v1.0.0');
      expect(result).toBe(false);
    });
  });

  describe('getCacheEntry()', () => {
    it('should return null for uncached plugin', () => {
      const entry = cache.getCacheEntry('github:owner/repo', 'v1.0.0');
      expect(entry).toBeNull();
    });

    it('should return entry for cached plugin', async () => {
      const pluginId = generatePluginId('github:owner/repo', 'v1.0.0');
      const pluginPath = cache.getPluginPath(pluginId);
      await fs.mkdir(pluginPath, { recursive: true });

      await cache.cachePlugin('github:owner/repo', 'v1.0.0', pluginPath);

      const entry = cache.getCacheEntry('github:owner/repo', 'v1.0.0');
      expect(entry).not.toBeNull();
      expect(entry?.id).toBe(pluginId);
      expect(entry?.source).toBe('github:owner/repo');
      expect(entry?.version).toBe('v1.0.0');
    });
  });

  describe('cachePlugin()', () => {
    it('should add plugin to manifest', async () => {
      const pluginId = generatePluginId('github:test/plugin', 'v1.0.0');
      const pluginPath = cache.getPluginPath(pluginId);
      await fs.mkdir(pluginPath, { recursive: true });

      const result = await cache.cachePlugin('github:test/plugin', 'v1.0.0', pluginPath);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe(pluginId);
        expect(result.value.source).toBe('github:test/plugin');
        expect(result.value.version).toBe('v1.0.0');
      }
    });

    it('should write plugin metadata file', async () => {
      const pluginId = generatePluginId('github:test/plugin', 'v1.0.0');
      const pluginPath = cache.getPluginPath(pluginId);
      await fs.mkdir(pluginPath, { recursive: true });

      await cache.cachePlugin('github:test/plugin', 'v1.0.0', pluginPath);

      const metaPath = path.join(pluginPath, PLUGIN_META_FILE);
      const metaContent = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(metaContent);

      expect(meta.id).toBe(pluginId);
      expect(meta.source).toBe('github:test/plugin');
      expect(meta.version).toBe('v1.0.0');
      expect(meta.cachedAt).toBeDefined();
      expect(meta.lastAccessed).toBeDefined();
    });

    it('should support optional metadata', async () => {
      const pluginId = generatePluginId('github:test/plugin', 'v1.0.0');
      const pluginPath = cache.getPluginPath(pluginId);
      await fs.mkdir(pluginPath, { recursive: true });

      await cache.cachePlugin('github:test/plugin', 'v1.0.0', pluginPath, {
        contentHash: 'abc123',
        manifest: {
          name: 'test-plugin',
          version: '1.0.0',
          description: 'Test plugin',
        },
      });

      const metaPath = path.join(pluginPath, PLUGIN_META_FILE);
      const metaContent = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(metaContent);

      expect(meta.contentHash).toBe('abc123');
      expect(meta.manifest?.name).toBe('test-plugin');
    });

    it('should update manifest lastUpdated timestamp', async () => {
      const manifestPath = path.join(cache.getCacheDir(), CACHE_MANIFEST_FILE);
      const before = await fs.readFile(manifestPath, 'utf-8');
      const beforeManifest = JSON.parse(before);

      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      const pluginId = generatePluginId('github:test/plugin', 'v1.0.0');
      const pluginPath = cache.getPluginPath(pluginId);
      await fs.mkdir(pluginPath, { recursive: true });
      await cache.cachePlugin('github:test/plugin', 'v1.0.0', pluginPath);

      const after = await fs.readFile(manifestPath, 'utf-8');
      const afterManifest = JSON.parse(after);

      expect(afterManifest.lastUpdated).not.toBe(beforeManifest.lastUpdated);
    });
  });

  describe('invalidate()', () => {
    it('should remove plugin from manifest', async () => {
      const pluginId = generatePluginId('github:test/plugin', 'v1.0.0');
      const pluginPath = cache.getPluginPath(pluginId);
      await fs.mkdir(pluginPath, { recursive: true });

      await cache.cachePlugin('github:test/plugin', 'v1.0.0', pluginPath);
      expect(await cache.isCached('github:test/plugin', 'v1.0.0')).toBe(true);

      await cache.invalidate('github:test/plugin', 'v1.0.0');

      const entry = cache.getCacheEntry('github:test/plugin', 'v1.0.0');
      expect(entry).toBeNull();
    });

    it('should remove plugin directory', async () => {
      const pluginId = generatePluginId('github:test/plugin', 'v1.0.0');
      const pluginPath = cache.getPluginPath(pluginId);
      await fs.mkdir(pluginPath, { recursive: true });

      await cache.cachePlugin('github:test/plugin', 'v1.0.0', pluginPath);
      await cache.invalidate('github:test/plugin', 'v1.0.0');

      try {
        await fs.access(pluginPath);
        expect.fail('Directory should not exist');
      } catch {
        // Expected
      }
    });

    it('should handle invalidating non-existent plugin gracefully', async () => {
      const result = await cache.invalidate('github:nonexistent/plugin', 'v1.0.0');
      expect(result.ok).toBe(true);
    });
  });

  describe('clearAll()', () => {
    it('should remove all cached plugins', async () => {
      const pluginId1 = generatePluginId('github:owner/repo1', 'v1.0.0');
      const pluginId2 = generatePluginId('github:owner/repo2', 'v2.0.0');

      await fs.mkdir(cache.getPluginPath(pluginId1), { recursive: true });
      await fs.mkdir(cache.getPluginPath(pluginId2), { recursive: true });

      await cache.cachePlugin('github:owner/repo1', 'v1.0.0', cache.getPluginPath(pluginId1));
      await cache.cachePlugin('github:owner/repo2', 'v2.0.0', cache.getPluginPath(pluginId2));

      expect(cache.listCached()).toHaveLength(2);

      await cache.clearAll();

      expect(cache.listCached()).toHaveLength(0);
    });

    it('should remove all plugin directories', async () => {
      const pluginId = generatePluginId('github:owner/repo', 'v1.0.0');
      const pluginPath = cache.getPluginPath(pluginId);
      await fs.mkdir(pluginPath, { recursive: true });
      await cache.cachePlugin('github:owner/repo', 'v1.0.0', pluginPath);

      await cache.clearAll();

      try {
        await fs.access(pluginPath);
        expect.fail('Directory should not exist');
      } catch {
        // Expected
      }
    });

    it('should preserve manifest file', async () => {
      await cache.clearAll();

      const manifestPath = path.join(cache.getCacheDir(), CACHE_MANIFEST_FILE);
      const stat = await fs.stat(manifestPath);
      expect(stat.isFile()).toBe(true);
    });
  });

  describe('listCached()', () => {
    it('should return empty array when no plugins cached', () => {
      const list = cache.listCached();
      expect(list).toHaveLength(0);
      expect(Array.isArray(list)).toBe(true);
    });

    it('should return all cached plugins', async () => {
      const pluginId1 = generatePluginId('github:owner/repo1', 'v1.0.0');
      const pluginId2 = generatePluginId('github:owner/repo2', 'v2.0.0');

      await fs.mkdir(cache.getPluginPath(pluginId1), { recursive: true });
      await fs.mkdir(cache.getPluginPath(pluginId2), { recursive: true });

      await cache.cachePlugin('github:owner/repo1', 'v1.0.0', cache.getPluginPath(pluginId1));
      await cache.cachePlugin('github:owner/repo2', 'v2.0.0', cache.getPluginPath(pluginId2));

      const list = cache.listCached();
      expect(list).toHaveLength(2);
      expect(list.map((e) => e.id).sort()).toEqual([pluginId1, pluginId2].sort());
    });
  });

  describe('touchPlugin()', () => {
    it('should update lastAccessed timestamp', async () => {
      const pluginId = generatePluginId('github:test/plugin', 'v1.0.0');
      const pluginPath = cache.getPluginPath(pluginId);
      await fs.mkdir(pluginPath, { recursive: true });

      await cache.cachePlugin('github:test/plugin', 'v1.0.0', pluginPath);

      const metaPath = path.join(pluginPath, PLUGIN_META_FILE);
      const before = await fs.readFile(metaPath, 'utf-8');
      const beforeMeta = JSON.parse(before);

      // Wait to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      await cache.touchPlugin('github:test/plugin', 'v1.0.0');

      const after = await fs.readFile(metaPath, 'utf-8');
      const afterMeta = JSON.parse(after);

      expect(afterMeta.lastAccessed).not.toBe(beforeMeta.lastAccessed);
    });

    it('should handle non-existent plugin gracefully', async () => {
      await expect(cache.touchPlugin('github:nonexistent/plugin', 'v1.0.0')).resolves.not.toThrow();
    });
  });
});

describe('createPluginCache()', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(__dirname, '.test-create-cache-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should create and initialize plugin cache', async () => {
    const result = await createPluginCache(tempDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(PluginCache);
    }
  });

  it('should create cache directory structure', async () => {
    const result = await createPluginCache(tempDir);
    expect(result.ok).toBe(true);

    const cacheDir = path.join(tempDir, DEFAULT_PLUGIN_CACHE_DIR);
    const stat = await fs.stat(cacheDir);
    expect(stat.isDirectory()).toBe(true);
  });
});

describe('constants', () => {
  it('should export CLAUDE_PLUGIN_ROOT_VAR', () => {
    expect(CLAUDE_PLUGIN_ROOT_VAR).toBe('${CLAUDE_PLUGIN_ROOT}');
  });

  it('should export DEFAULT_PLUGIN_CACHE_DIR', () => {
    expect(DEFAULT_PLUGIN_CACHE_DIR).toBe('plugins');
  });

  it('should export CACHE_MANIFEST_FILE', () => {
    expect(CACHE_MANIFEST_FILE).toBe('cache-manifest.json');
  });

  it('should export PLUGIN_META_FILE', () => {
    expect(PLUGIN_META_FILE).toBe('.plugin-cache-meta.json');
  });
});

