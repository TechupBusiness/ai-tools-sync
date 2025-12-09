import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPluginCache, generatePluginId } from '../../../src/utils/plugin-cache.js';
import {
  checkAllPluginsForUpdates,
  checkForUpdates,
  fetchRemoteTags,
  hasNewerVersion,
  updatePlugin,
} from '../../../src/utils/plugin-update.js';
import { err, ok } from '../../../src/utils/result.js';

import type * as GitModule from '../../../src/loaders/git.js';

vi.mock('node:child_process', () => {
  const execMock = vi.fn();
  return {
    exec: execMock,
  };
});

vi.mock('../../../src/loaders/git.js', async () => {
  const actual = await vi.importActual<GitModule>('../../../src/loaders/git.js');
  return {
    ...actual,
    isGitAvailable: vi.fn(() => true),
    parseGitSource: vi.fn((source: string) => {
      if (source.startsWith('invalid')) {
        return null;
      }
      return {
        cloneUrl: source,
        host: 'example.com',
        owner: 'owner',
        repo: 'repo',
        ref: undefined,
        subpath: undefined,
        useSsh: false,
        original: source,
      };
    }),
    GitLoader: vi.fn().mockImplementation(() => ({
      load: vi.fn().mockResolvedValue({ errors: [] }),
    })),
  };
});

const execMock = vi.mocked((await import('node:child_process')).exec);

describe('plugin-update utilities', () => {
  let tempDir: string;
  let baseDir: string;

  beforeEach(async () => {
    tempDir = path.join(__dirname, '.plugin-update-' + Date.now());
    baseDir = tempDir;
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  async function createCache() {
    const result = await createPluginCache(baseDir);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Failed to create cache');
    }
    return result.value;
  }

  async function seedCachedPlugin(cache: Awaited<ReturnType<typeof createCache>>, version: string) {
    const pluginId = generatePluginId('github:owner/repo', version);
    const pluginPath = cache.getPluginPath(pluginId);
    await fs.mkdir(pluginPath, { recursive: true });
    await cache.cachePlugin('github:owner/repo', version, pluginPath);
  }

  it('fetchRemoteTags should parse git ls-remote output correctly', async () => {
    execMock.mockImplementation((command, options, callback) => {
      const cb = typeof options === 'function' ? options : callback;
      cb?.(null, { stdout: 'abc\trefs/tags/v1.0.0\ndef\trefs/tags/v1.1.0', stderr: '' });
      return {} as any;
    });

    const result = await fetchRemoteTags('https://github.com/owner/repo.git');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(['v1.0.0', 'v1.1.0']);
    }
  });

  it('hasNewerVersion should compare semver correctly', () => {
    expect(hasNewerVersion('v1.0.0', 'v1.0.1')).toBe(true);
    expect(hasNewerVersion('v1.0.0', 'v1.0.0')).toBe(false);
    expect(hasNewerVersion('v2.0.0', 'v1.9.9')).toBe(false);
    expect(hasNewerVersion(null, 'v1.0.0')).toBe(true);
    expect(hasNewerVersion('v1.0.0', null)).toBe(false);
    expect(hasNewerVersion('1.0.0', 'v1.0.1')).toBe(true);
  });

  it('checkForUpdates should detect when update is available', async () => {
    const cache = await createCache();
    await seedCachedPlugin(cache, 'v1.0.0');

    const spy = vi.spyOn(await import('../../../src/utils/plugin-update.js'), 'fetchRemoteTags');
    spy.mockResolvedValue(ok(['v1.0.0', 'v1.1.0']));

    const result = await checkForUpdates(cache, 'github:owner/repo');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hasUpdate).toBe(true);
      expect(result.value.versions.latestVersion).toBe('v1.1.0');
    }
  });

  it('checkForUpdates should error on local sources', async () => {
    const cache = await createCache();
    const result = await checkForUpdates(cache, './local/plugin');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Local plugins cannot be updated');
    }
  });

  it('updatePlugin should update plugin to latest version', async () => {
    const cache = await createCache();
    await seedCachedPlugin(cache, 'v1.0.0');

    const result = await updatePlugin(cache, 'github:owner/repo', 'v1.1.0');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.previousVersion).toBe('v1.0.0');
      expect(result.value.newVersion).toBe('v1.1.0');
    }
  });

  it('checkAllPluginsForUpdates should collect errors and successes', async () => {
    const cache = await createCache();
    await seedCachedPlugin(cache, 'v1.0.0');

    const spy = vi.spyOn(await import('../../../src/utils/plugin-update.js'), 'checkForUpdates');
    spy
      .mockResolvedValueOnce(
        ok({
          source: 'github:owner/repo',
          pluginId: 'github_owner_repo',
          versions: {
            currentVersion: 'v1.0.0',
            latestVersion: 'v1.1.0',
            availableVersions: ['v1.1.0'],
            hasUpdate: true,
          },
          hasUpdate: true,
        })
      )
      .mockResolvedValueOnce(err(new Error('Invalid plugin source')) as any);

    const result = await checkAllPluginsForUpdates(cache, ['github:owner/repo', 'invalid:source']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      expect(result.value[0]?.error).toBeUndefined();
      const errorMessage = result.value[1]?.error ?? '';
      expect(errorMessage).toContain('Invalid plugin source');
    }
  });
});
