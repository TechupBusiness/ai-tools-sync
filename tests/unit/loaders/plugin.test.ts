import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  PluginLoader,
  PLUGIN_PREFIXES,
  type PluginLoaderOptions,
} from '../../../src/loaders/plugin.js';
import { createPluginCache, generatePluginId } from '../../../src/utils/plugin-cache.js';
import { ok, err } from '../../../src/utils/result.js';

import type * as ChildProcessModule from 'node:child_process';

type ExecReturn = ReturnType<ChildProcessModule.exec>;

// Mock child_process to avoid real git operations
vi.mock('node:child_process', async () => {
  const actual = (await vi.importActual('node:child_process')) as ChildProcessModule;
  return {
    ...actual,
    exec: vi.fn((cmd, opts, callback) => {
      if (typeof opts === 'function') {
        // opts is callback when options omitted
        opts(null, { stdout: '', stderr: '' });
        return {} as ExecReturn;
      }
      if (callback) {
        callback(null, { stdout: '', stderr: '' });
      }
      return {} as ExecReturn;
    }),
  };
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PLUGIN = path.resolve(__dirname, '../../fixtures/plugins/test-plugin');

async function copyFixturePlugin(targetPath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  fs.cpSync(FIXTURE_PLUGIN, targetPath, { recursive: true });
}

describe('PluginLoader', () => {
  let loader: PluginLoader;
  let tempDir: string;

  beforeEach(() => {
    loader = new PluginLoader();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-loader-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('canLoad()', () => {
    it('should return true for all supported prefixes', () => {
      expect(loader.canLoad('github:owner/repo')).toBe(true);
      expect(loader.canLoad('gitlab:owner/repo')).toBe(true);
      expect(loader.canLoad('bitbucket:owner/repo')).toBe(true);
      expect(loader.canLoad('plugin:github:owner/repo')).toBe(true);

      expect(loader.canLoad('npm:package')).toBe(false);
      expect(loader.canLoad('./local/path')).toBe(false);
    });

    it('should expose prefixes constant', () => {
      expect(PLUGIN_PREFIXES).toContain('github:');
      expect(PLUGIN_PREFIXES).toContain('gitlab:');
      expect(PLUGIN_PREFIXES).toContain('bitbucket:');
      expect(PLUGIN_PREFIXES).toContain('plugin:');
    });
  });

  describe('parseSource()', () => {
    it('should parse github:owner/repo@v1.0.0 correctly', () => {
      const parsed = loader.parseSource('github:owner/repo@v1.0.0');

      expect(parsed).not.toBeNull();
      expect(parsed!.host).toBe('github.com');
      expect(parsed!.owner).toBe('owner');
      expect(parsed!.repo).toBe('repo');
      expect(parsed!.version).toBe('v1.0.0');
      expect(parsed!.cloneUrl).toBe('https://github.com/owner/repo.git');
    });

    it('should parse github:owner/repo/skills@v1.0.0 with subpath', () => {
      const parsed = loader.parseSource('github:owner/repo/skills@v1.0.0');

      expect(parsed!.subpath).toBe('skills');
    });

    it('should return null for invalid format', () => {
      expect(loader.parseSource('invalid:source')).toBeNull();
      expect(loader.parseSource('github:onlyowner')).toBeNull();
    });
  });

  describe('cache id generation', () => {
    it('should generate different cache IDs for different versions', () => {
      const id1 = generatePluginId('github:owner/repo', 'v1.0.0');
      const id2 = generatePluginId('github:owner/repo', 'v2.0.0');
      const id3 = generatePluginId('github:owner/repo', undefined);

      expect(id1).not.toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id1).toContain('v1.0.0');
      expect(id2).toContain('v2.0.0');
    });
  });

  describe('load() - with mocked git', () => {
    let pluginCacheDir: string;
    let pluginCacheOptions: PluginLoaderOptions;

    beforeEach(async () => {
      pluginCacheDir = path.join(tempDir, 'cache');
      const cacheResult = await createPluginCache(pluginCacheDir);
      if (!cacheResult.ok) {
        throw cacheResult.error;
      }
      pluginCacheOptions = {
        pluginCache: cacheResult.value,
        cacheDir: pluginCacheDir,
      };
    });

    it('should clone and load plugin content', async () => {
      const cloneSpy = vi
        .spyOn(loader as unknown as { clonePlugin: PluginLoader['clonePlugin'] }, 'clonePlugin')
        .mockImplementation(async (_parsed, targetPath) => {
          await copyFixturePlugin(targetPath);
          return ok(undefined);
        });

      const result = await loader.load('github:test/repo@v1.0.0', pluginCacheOptions);

      expect(cloneSpy).toHaveBeenCalledTimes(1);
      expect(result.rules.length).toBe(1);
      expect(result.rules[0].frontmatter.name).toBe('test-skill');
      expect(result.errors?.length ?? 0).toBe(0);
    });

    it('should use cache on second load', async () => {
      const cloneSpy = vi
        .spyOn(loader as unknown as { clonePlugin: PluginLoader['clonePlugin'] }, 'clonePlugin')
        .mockImplementation(async (_parsed, targetPath) => {
          await copyFixturePlugin(targetPath);
          return ok(undefined);
        });

      await loader.load('github:test/repo@v1.0.0', pluginCacheOptions);
      await loader.load('github:test/repo@v1.0.0', pluginCacheOptions);

      expect(cloneSpy).toHaveBeenCalledTimes(1);
    });

    it('should force refresh when option set', async () => {
      const cloneSpy = vi
        .spyOn(loader as unknown as { clonePlugin: PluginLoader['clonePlugin'] }, 'clonePlugin')
        .mockImplementation(async (_parsed, targetPath) => {
          await copyFixturePlugin(targetPath);
          return ok(undefined);
        });

      await loader.load('github:test/repo@v1.0.0', pluginCacheOptions);
      await loader.load('github:test/repo@v1.0.0', { ...pluginCacheOptions, forceRefresh: true });

      expect(cloneSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle clone failure gracefully', async () => {
      vi.spyOn(loader as unknown as { clonePlugin: PluginLoader['clonePlugin'] }, 'clonePlugin').mockImplementation(
        async () => err(new Error('git failed'))
      );

      const result = await loader.load('github:test/repo@v1.0.0', pluginCacheOptions);

      expect(result.rules.length).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('git failed');
    });
  });

  describe('load() - with local fixture', () => {
    it('should load rules from cloned plugin', async () => {
      const cacheResult = await createPluginCache(tempDir);
      if (!cacheResult.ok) {
        throw cacheResult.error;
      }

      // Pre-populate cache directory with fixture content to simulate existing clone
      const pluginId = generatePluginId('github:local/repo', 'v1.0.0');
      const pluginPath = path.join(tempDir, 'plugins', pluginId);
      await copyFixturePlugin(pluginPath);
      await cacheResult.value.cachePlugin('github:local/repo', 'v1.0.0', pluginPath);

      const result = await loader.load('github:local/repo@v1.0.0', {
        pluginCache: cacheResult.value,
        cacheDir: tempDir,
      });

      expect(result.rules.length).toBe(1);
      expect(result.rules[0].frontmatter.name).toBe('test-skill');
    });
  });

  describe('error handling', () => {
    it('should return error for invalid source format', async () => {
      const result = await loader.load('invalid:source');

      expect(result.rules.length).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('Invalid plugin source');
    });
  });
});

