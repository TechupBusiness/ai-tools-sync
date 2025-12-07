import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPluginsCommand } from '../../src/cli/commands/plugins.js';
import { ok } from '../../src/utils/result.js';

const loadConfigMock = vi.fn();
const resolveConfigDirMock = vi.fn();

vi.mock('../../src/config/loader.js', () => ({
  loadConfig: (...args: unknown[]) => loadConfigMock(...args),
  resolveConfigDir: (...args: unknown[]) => resolveConfigDirMock(...args),
}));

const checkAllPluginsForUpdates = vi.fn();
const updatePluginMock = vi.fn();

vi.mock('../../src/utils/plugin-update.js', () => ({
  checkAllPluginsForUpdates: (...args: unknown[]) => checkAllPluginsForUpdates(...args),
  updatePlugin: (...args: unknown[]) => updatePluginMock(...args),
}));

describe('plugin update CLI', () => {
  let projectRoot: string;
  let configDir: string;
  const logs: string[] = [];

  beforeEach(async () => {
    projectRoot = path.join(__dirname, '.plugin-update-cli-' + Date.now());
    configDir = path.join(projectRoot, '.ai-tool-sync');
    await fs.mkdir(configDir, { recursive: true });

    await fs.writeFile(
      path.join(configDir, 'config.yaml'),
      `version: "0.1.0"\nuse:\n  plugins:\n    - name: test-plugin\n      source: github:owner/repo\n      enabled: true\n`,
      'utf-8'
    );

    resolveConfigDirMock.mockResolvedValue('.ai-tool-sync');
    loadConfigMock.mockResolvedValue(
      ok({
        version: '0.1.0',
        projectRoot,
        aiDir: configDir,
        configPath: path.join(configDir, 'config.yaml'),
        use: {
          plugins: [
            {
              name: 'test-plugin',
              source: 'github:owner/repo',
              enabled: true,
            },
          ],
        },
      })
    );

    logs.length = 0;
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      if (msg !== undefined) {
        logs.push(String(msg));
      }
    });
    vi.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
      if (msg !== undefined) {
        logs.push(String(msg));
      }
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    checkAllPluginsForUpdates.mockReset();
    updatePluginMock.mockReset();
    try {
      await fs.rm(projectRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('runs update command in dry-run mode and prints summary', async () => {
    checkAllPluginsForUpdates.mockResolvedValue(
      ok([
        {
          source: 'github:owner/repo',
          pluginId: 'github_owner_repo',
          versions: {
            currentVersion: 'v1.0.0',
            latestVersion: 'v1.1.0',
            availableVersions: ['v1.1.0', 'v1.0.0'],
            hasUpdate: true,
          },
          hasUpdate: true,
        },
      ])
    );

    const program = new Command();
    program.addCommand(createPluginsCommand());

    await program.parseAsync(['node', 'test', 'plugins', 'update', '--project', projectRoot]);

    expect(checkAllPluginsForUpdates).toHaveBeenCalled();
    expect(updatePluginMock).not.toHaveBeenCalled();
    const summaryLine = logs.find((line) => line.includes('Summary'));
    expect(summaryLine).toBeDefined();
  });

  it('applies updates when --apply is passed', async () => {
    checkAllPluginsForUpdates.mockResolvedValue(
      ok([
        {
          source: 'github:owner/repo',
          pluginId: 'github_owner_repo',
          versions: {
            currentVersion: 'v1.0.0',
            latestVersion: 'v1.1.0',
            availableVersions: ['v1.1.0', 'v1.0.0'],
            hasUpdate: true,
          },
          hasUpdate: true,
        },
      ])
    );
    updatePluginMock.mockResolvedValue(
      ok({
        source: 'github:owner/repo',
        pluginId: 'github_owner_repo',
        previousVersion: 'v1.0.0',
        newVersion: 'v1.1.0',
        success: true,
      })
    );

    const program = new Command();
    program.addCommand(createPluginsCommand());

    await program.parseAsync(['node', 'test', 'plugins', 'update', '--project', projectRoot, '--apply']);

    expect(checkAllPluginsForUpdates).toHaveBeenCalled();
    expect(updatePluginMock).toHaveBeenCalled();
  });
});
