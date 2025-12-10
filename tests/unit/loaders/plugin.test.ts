import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { PluginLoader } from '../../../src/loaders/plugin.js';
import { createPluginCache, generatePluginId } from '../../../src/utils/plugin-cache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_PATH = path.join(__dirname, '../../fixtures/claude-plugins');
const BASIC_PLUGIN = path.join(FIXTURES_PATH, 'basic-plugin');

describe('PluginLoader', () => {
  let loader: PluginLoader;
  let tempDir: string;

  beforeEach(() => {
    loader = new PluginLoader();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-loader-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
  });

  describe('canLoad()', () => {
    it('returns true for git and local sources', () => {
      expect(loader.canLoad('github:owner/repo')).toBe(true);
      expect(loader.canLoad('gitlab:owner/repo@v1.0.0')).toBe(true);
      expect(loader.canLoad('./local/plugin')).toBe(true);
    });

    it('returns false for unsupported prefixes', () => {
      expect(loader.canLoad('npm:package')).toBe(false);
    });
  });

  describe('load() local plugins', () => {
    it('loads all content types from a local path', async () => {
      const result = await loader.load(BASIC_PLUGIN);

      expect(result.rules.length).toBe(2);
      expect(result.personas.length).toBe(2);
      expect(result.commands.length).toBe(1);
      expect(result.hooks.length).toBe(0);
      expect(result.errors).toBeUndefined();
    });

    it('applies include filtering', async () => {
      const result = await loader.load(BASIC_PLUGIN, {
        config: {
          name: 'basic',
          source: BASIC_PLUGIN,
          enabled: true,
          include: ['rules'],
        },
      });

      expect(result.rules.length).toBe(2);
      expect(result.personas.length).toBe(0);
      expect(result.commands.length).toBe(0);
      expect(result.hooks.length).toBe(0);
    });

    it('applies exclude filtering after include', async () => {
      const result = await loader.load(BASIC_PLUGIN, {
        config: {
          name: 'basic',
          source: BASIC_PLUGIN,
          enabled: true,
          include: ['rules', 'commands'],
          exclude: ['commands'],
        },
      });

      expect(result.rules.length).toBe(2);
      expect(result.commands.length).toBe(0);
      expect(result.personas.length).toBe(0);
    });

    it('returns empty result when disabled', async () => {
      const result = await loader.load(BASIC_PLUGIN, {
        config: {
          name: 'basic',
          source: BASIC_PLUGIN,
          enabled: false,
        },
      });

      expect(result.rules.length).toBe(0);
      expect(result.personas.length).toBe(0);
      expect(result.commands.length).toBe(0);
      expect(result.hooks.length).toBe(0);
    });
  });

  describe('load() with plugin cache and version overrides', () => {
    it('uses cached plugin when config version differs from source', async () => {
      const source = 'github:owner/repo@v1.0.0';
      const desiredVersion = 'v2.0.0';
      const cacheResult = await createPluginCache(tempDir);
      if (!cacheResult.ok) {
        throw cacheResult.error;
      }

      const pluginId = generatePluginId(source, desiredVersion);
      const pluginPath = path.join(cacheResult.value.getCacheDir(), pluginId);
      fs.mkdirSync(pluginPath, { recursive: true });
      fs.cpSync(BASIC_PLUGIN, pluginPath, { recursive: true });
      await cacheResult.value.cachePlugin(source, desiredVersion, pluginPath);

      const result = await loader.load(source, {
        pluginCache: cacheResult.value,
        config: {
          name: 'cached',
          source,
          enabled: true,
          version: desiredVersion,
        },
      });

      expect(result.rules.length).toBe(2);
      expect(result.pluginInfo?.version).toBe(desiredVersion);
    });
  });

  describe('error handling', () => {
    it('returns an error for invalid sources', async () => {
      const result = await loader.load('invalid:source');

      expect(result.errors?.[0]?.message).toContain('Invalid plugin source format');
    });

    it('returns an error for missing local paths', async () => {
      const missingPath = path.join(tempDir, 'missing-plugin');
      const result = await loader.load(missingPath);

      expect(result.errors?.[0]?.message).toContain('Plugin path does not exist');
      expect(result.source).toBe(missingPath);
    });
  });
});
