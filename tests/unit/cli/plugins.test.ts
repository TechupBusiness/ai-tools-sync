import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createPluginsCommand } from '../../../src/cli/commands/plugins.js';

import type { Command } from 'commander';

const mockCache = vi.hoisted(() => ({
  listCached: vi.fn(),
  isCached: vi.fn(),
  invalidate: vi.fn(),
  getCacheDir: vi.fn().mockReturnValue('/cache/plugins'),
  getPluginPath: vi.fn().mockReturnValue('/cache/plugins/id'),
}));

const mockCreatePluginCache = vi.hoisted(() => vi.fn());
const mockLoadConfig = vi.hoisted(() => vi.fn());
const mockResolveConfigDir = vi.hoisted(() => vi.fn());
const mockParseGitSource = vi.hoisted(() => vi.fn());
const mockLoad = vi.hoisted(() => vi.fn());
const mockGeneratePluginId = vi.hoisted(() =>
  vi.fn((source: string, version?: string) => `${source}_${version ?? ''}`)
);

const outputMocks = vi.hoisted(() => ({
  printHeader: vi.fn(),
  printInfo: vi.fn(),
  printTable: vi.fn(),
  printSuccess: vi.fn(),
  printError: vi.fn(),
  printWarning: vi.fn(),
  printNewLine: vi.fn(),
  printListItem: vi.fn(),
}));

vi.mock('../../../src/utils/plugin-cache.js', () => ({
  createPluginCache: mockCreatePluginCache,
  generatePluginId: mockGeneratePluginId,
}));

vi.mock('../../../src/config/loader.js', () => ({
  loadConfig: mockLoadConfig,
  resolveConfigDir: mockResolveConfigDir,
}));

vi.mock('../../../src/loaders/git.js', () => ({
  parseGitSource: mockParseGitSource,
}));

vi.mock('../../../src/loaders/plugin.js', () => ({
  PluginLoader: vi.fn().mockImplementation(() => ({
    load: mockLoad,
  })),
}));

vi.mock('../../../src/cli/output.js', async () => {
  const actual = await vi.importActual('../../../src/cli/output.js');
  return {
    ...actual,
    ...outputMocks,
  };
});

const exitSpy = vi.spyOn(process, 'exit');

function buildProgram(): Command {
  const program = createPluginsCommand();
  program.exitOverride();
  return program;
}

async function run(args: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(args, { from: 'user' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoad.mockReset();
  exitSpy.mockImplementation(((_code?: number) => {
    return undefined as never;
  }) as never);
  mockCreatePluginCache.mockResolvedValue({ ok: true, value: mockCache });
  mockCache.listCached.mockReturnValue([]);
  mockCache.isCached.mockResolvedValue(false);
  mockCache.invalidate.mockResolvedValue({ ok: true });
  mockLoadConfig.mockResolvedValue({ ok: true, value: { use: { plugins: [] } } });
  mockResolveConfigDir.mockResolvedValue('.ai-tool-sync');
  mockParseGitSource.mockReturnValue({
    cloneUrl: 'https://github.com/owner/repo.git',
    host: 'github.com',
    owner: 'owner',
    repo: 'repo',
    ref: 'v1.0.0',
    original: 'github:owner/repo',
    useSsh: false,
  });
  mockLoad.mockResolvedValue({
    rules: [],
    personas: [],
    commands: [],
    hooks: [],
  });
});

afterEach(() => {
  exitSpy.mockReset();
});

describe('Plugins CLI Commands', () => {
  describe('plugins list', () => {
    it('shows helpful message when no plugins are installed', async () => {
      mockCache.listCached.mockReturnValue([]);

      await run(['list']);

      expect(outputMocks.printInfo).toHaveBeenCalledWith('No plugins installed.');
    });

    it('lists cached plugins with status', async () => {
      mockCache.listCached.mockReturnValue([
        {
          id: 'github_owner_repo_v1',
          source: 'github:owner/repo',
          version: 'v1.0.0',
          cachedAt: '2025-01-01',
          path: 'plugins/github_owner_repo_v1',
        },
      ]);

      await run(['list']);

      expect(outputMocks.printTable).toHaveBeenCalledWith(
        ['Name', 'Source', 'Version', 'Status'],
        expect.arrayContaining([
          expect.arrayContaining(['owner/repo', expect.any(String), 'v1.0.0', 'cached']),
        ])
      );
    });

    it('merges config and cache and prefers config name', async () => {
      mockCache.listCached.mockReturnValue([
        {
          id: 'github_owner_repo_v1',
          source: 'github:owner/repo',
          version: 'v1.0.0',
          cachedAt: '2025-01-01',
          path: 'plugins/github_owner_repo_v1',
        },
      ]);
      mockLoadConfig.mockResolvedValue({
        ok: true,
        value: {
          use: { plugins: [{ name: 'custom', source: 'github:owner/repo', enabled: true }] },
        },
      });

      await run(['list']);

      expect(outputMocks.printTable).toHaveBeenCalledWith(
        ['Name', 'Source', 'Version', 'Status'],
        expect.arrayContaining([
          expect.arrayContaining(['custom', expect.any(String), 'v1.0.0', 'enabled']),
        ])
      );
    });

    it('shows disabled status for disabled config plugin', async () => {
      mockLoadConfig.mockResolvedValue({
        ok: true,
        value: { use: { plugins: [{ name: 'p1', source: 'github:owner/repo', enabled: false }] } },
      });

      await run(['list']);

      expect(outputMocks.printTable).toHaveBeenCalledWith(
        ['Name', 'Source', 'Version', 'Status'],
        expect.arrayContaining([
          expect.arrayContaining(['p1', expect.any(String), 'latest', 'disabled']),
        ])
      );
    });

    it('outputs json when requested', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockCache.listCached.mockReturnValue([
        {
          id: 'github_owner_repo_v1',
          source: 'github:owner/repo',
          version: 'v1.0.0',
          cachedAt: '2025-01-01',
          path: 'plugins/github_owner_repo_v1',
        },
      ]);

      await run(['list', '--json']);

      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.total).toBe(1);
      expect(payload.plugins[0].name).toBe('owner/repo');
      logSpy.mockRestore();
    });

    it('prints verbose details', async () => {
      mockCache.listCached.mockReturnValue([
        {
          id: 'github_owner_repo_v1',
          source: 'github:owner/repo',
          version: 'v1.0.0',
          cachedAt: '2025-01-01',
          path: 'plugins/github_owner_repo_v1',
        },
      ]);

      await run(['list', '--verbose']);

      expect(outputMocks.printListItem).toHaveBeenCalled();
    });
  });

  describe('plugins add', () => {
    it('adds plugin with version from source ref', async () => {
      await run(['add', 'github:owner/repo']);

      expect(mockLoad).toHaveBeenCalledWith(
        'github:owner/repo@v1.0.0',
        expect.objectContaining({
          pluginCache: mockCache,
        })
      );
      expect(outputMocks.printSuccess).toHaveBeenCalled();
    });

    it('adds plugin with explicit version flag', async () => {
      mockParseGitSource.mockReturnValue({
        cloneUrl: 'https://github.com/owner/repo.git',
        host: 'github.com',
        owner: 'owner',
        repo: 'repo',
        original: 'github:owner/repo',
        useSsh: false,
      });

      await run(['add', 'github:owner/repo', '--version', 'v2.0.0']);

      expect(mockLoad).toHaveBeenCalledWith(
        'github:owner/repo@v2.0.0',
        expect.objectContaining({
          config: expect.objectContaining({ version: 'v2.0.0' }),
        })
      );
    });

    it('uses custom name when provided', async () => {
      await run(['add', 'github:owner/repo', '--name', 'custom-name']);

      expect(outputMocks.printSuccess).toHaveBeenCalledWith(expect.stringContaining('custom-name'));
    });

    it('fails for invalid source format', async () => {
      mockParseGitSource.mockReturnValueOnce(null);

      await run(['add', 'bad-source']);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(outputMocks.printError).toHaveBeenCalled();
    });

    it('skips when already installed without force', async () => {
      mockCache.isCached.mockResolvedValueOnce(true);

      await run(['add', 'github:owner/repo']);

      expect(outputMocks.printWarning).toHaveBeenCalled();
      expect(mockLoad).not.toHaveBeenCalled();
    });

    it('overwrites when force is provided', async () => {
      mockCache.isCached.mockResolvedValueOnce(true);

      await run(['add', 'github:owner/repo', '--force']);

      expect(mockLoad).toHaveBeenCalled();
    });

    it('handles loader errors gracefully', async () => {
      mockLoad.mockImplementation(async () => ({
        rules: [],
        personas: [],
        commands: [],
        hooks: [],
        errors: [{ type: 'file', path: '', message: 'network error' }],
      }));

      await run(['add', 'github:owner/repo']);
      expect(mockCache.isCached).toHaveBeenCalled();
      expect(mockCreatePluginCache).toHaveBeenCalled();
      expect(outputMocks.printSuccess).not.toHaveBeenCalledWith(
        expect.stringContaining('added successfully')
      );
    });
  });

  describe('plugins remove', () => {
    it('removes cached plugin', async () => {
      mockCache.listCached.mockReturnValue([
        {
          id: 'github_owner_repo_v1',
          source: 'github:owner/repo',
          version: 'v1.0.0',
          cachedAt: '2025-01-01',
          path: 'plugins/github_owner_repo_v1',
        },
      ]);

      await run(['remove', 'github:owner/repo']);

      expect(mockCache.invalidate).toHaveBeenCalledWith('github:owner/repo', 'v1.0.0');
      expect(outputMocks.printSuccess).toHaveBeenCalled();
    });

    it('refuses removal when plugin is in config without force', async () => {
      mockLoadConfig.mockResolvedValue({
        ok: true,
        value: { use: { plugins: [{ name: 'repo', source: 'github:owner/repo', enabled: true }] } },
      });

      await run(['remove', 'repo']);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(mockCache.invalidate).not.toHaveBeenCalled();
    });

    it('removes when forced even if in config', async () => {
      mockCache.listCached.mockReturnValue([
        {
          id: 'github_owner_repo_v1',
          source: 'github:owner/repo',
          version: 'v1.0.0',
          cachedAt: '2025-01-01',
          path: 'plugins/github_owner_repo_v1',
        },
      ]);
      mockLoadConfig.mockResolvedValue({
        ok: true,
        value: { use: { plugins: [{ name: 'repo', source: 'github:owner/repo', enabled: true }] } },
      });

      await run(['remove', 'repo', '--force']);

      expect(mockCache.invalidate).toHaveBeenCalled();
    });

    it('respects keep-cache flag', async () => {
      mockCache.listCached.mockReturnValue([
        {
          id: 'github_owner_repo_v1',
          source: 'github:owner/repo',
          version: 'v1.0.0',
          cachedAt: '2025-01-01',
          path: 'plugins/github_owner_repo_v1',
        },
      ]);

      await run(['remove', 'repo', '--keep-cache']);

      expect(mockCache.invalidate).not.toHaveBeenCalled();
    });

    it('fails for missing plugin', async () => {
      mockCache.listCached.mockReturnValue([]);

      await run(['remove', 'missing']);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(outputMocks.printError).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });

    it('supports partial matches via generatePluginId', async () => {
      mockCache.listCached.mockReturnValue([
        {
          id: 'github_owner_repo_v1',
          source: 'github:owner/repo',
          version: 'v1.0.0',
          cachedAt: '2025-01-01',
          path: 'plugins/github_owner_repo_v1',
        },
      ]);
      mockGeneratePluginId.mockReturnValue('owner_repo_v1');

      await run(['remove', 'owner_repo']);

      expect(mockCache.invalidate).toHaveBeenCalled();
    });
  });
});
