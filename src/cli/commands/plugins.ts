import * as path from 'node:path';

import { Command } from 'commander';

import { loadConfig, resolveConfigDir } from '../../config/loader.js';
import { logger } from '../../utils/logger.js';
import { createPluginCache } from '../../utils/plugin-cache.js';
import { checkAllPluginsForUpdates, updatePlugin } from '../../utils/plugin-update.js';
import { printError, printHeader, printInfo, printNewLine, printSuccess, printWarning } from '../output.js';

import type { PluginConfig } from '../../config/types.js';

interface PluginsUpdateOptions {
  apply?: boolean;
  force?: boolean;
  all?: boolean;
  project?: string;
  configDir?: string;
  timeout?: string;
}

function collectSources(
  name: string | undefined,
  configPlugins: PluginConfig[],
  cachedSources: string[]
): string[] {
  if (name) {
    const configured = configPlugins.find(
      (plugin) => plugin.name === name || plugin.source === name || plugin.source.endsWith(`/${name}`)
    );
    if (configured) {
      return [configured.source];
    }

    const cachedMatch = cachedSources.find(
      (source) => source === name || source.endsWith(`/${name}`) || source.includes(name)
    );
    return cachedMatch ? [cachedMatch] : [name];
  }

  const enabledConfig = configPlugins.filter((plugin) => plugin.enabled !== false).map((plugin) => plugin.source);
  const combined = [...enabledConfig, ...cachedSources];
  return [...new Set(combined)];
}

export function createPluginsCommand(): Command {
  const plugins = new Command('plugins').description('Manage plugins');

  plugins
    .command('update [name]')
    .description('Check for and install plugin updates')
    .option('--apply', 'Actually apply updates (default: dry-run)')
    .option('--force', 'Force re-download even if up to date')
    .option('--all', 'Update all plugins')
    .option('-p, --project <path>', 'Project root directory')
    .option('-c, --config-dir <path>', 'Configuration directory name (default: .ai-tool-sync)')
    .option('--timeout <ms>', 'Timeout for git operations in milliseconds (default: 30000)')
    .action(async (name: string | undefined, options: PluginsUpdateOptions) => {
      const projectRoot = path.resolve(options.project ?? process.cwd());
      const configDirName = await resolveConfigDir({ projectRoot, configDir: options.configDir });
      const baseDir = path.join(projectRoot, configDirName);

      const cacheResult = await createPluginCache(baseDir);
      if (!cacheResult.ok) {
        printError(cacheResult.error.message);
        process.exit(1);
        return;
      }
      const cache = cacheResult.value;

      const configResult = await loadConfig({ projectRoot, configDir: options.configDir });
      const configPlugins = configResult.ok ? configResult.value.use?.plugins ?? [] : [];
      const cachedSources = cache.listCached().map((entry) => entry.source);
      const sources = options.all ? cachedSources : collectSources(name, configPlugins, cachedSources);

      if (sources.length === 0) {
        printWarning('No plugins found to check for updates.');
        return;
      }

      const timeoutMs = options.timeout ? Number.parseInt(options.timeout, 10) : undefined;
      const applyUpdates = options.apply === true;
      const checkOptions = {
        baseDir,
        ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {}),
      };

      printHeader('AI Tool Sync - Plugin Updates');
      printInfo('Checking for updates...');
      printNewLine();

      const checkResult = await checkAllPluginsForUpdates(cache, sources, checkOptions);

      if (!checkResult.ok) {
        printError(checkResult.error.message);
        process.exit(1);
        return;
      }

      const results = checkResult.value;
      let updatesAvailable = 0;
      let errors = 0;

      for (const result of results) {
        printInfo(`📦 ${result.source}`);

        if (result.error) {
          printWarning(`  Error: ${result.error}`);
          errors += 1;
          continue;
        }

        const current = result.versions.currentVersion ?? 'not installed';
        const latest = result.versions.latestVersion ?? 'unknown';
        if (result.versions.hasUpdate) {
          updatesAvailable += 1;
          printSuccess(`  Current: ${current} → Latest: ${latest} (update available)`);
        } else {
          printInfo(`  Current: ${current} → Latest: ${latest} (up to date)`);
        }
      }

      printNewLine();
      printInfo(
        `Summary: ${updatesAvailable} update(s) available, ${results.length - updatesAvailable - errors} up to date, ${errors} error(s)`
      );

      if (!applyUpdates) {
        if (updatesAvailable > 0) {
          printInfo('Run with --apply to install updates.');
        }
        return;
      }

      printNewLine();
      printInfo('Applying updates...');

      for (const result of results) {
        if (result.error) {
          printWarning(`Skipping ${result.source}: ${result.error}`);
          continue;
        }

        if (!result.versions.hasUpdate && !options.force) {
          logger.debug(`Skipping ${result.source}, already up to date.`);
          continue;
        }

        const targetVersion = result.versions.latestVersion ?? result.versions.currentVersion;
        if (!targetVersion) {
          printWarning(`Skipping ${result.source}: No version information available`);
          continue;
        }

        const updateResult = await updatePlugin(cache, result.source, targetVersion, {
          baseDir,
          ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {}),
          ...(options.force !== undefined ? { force: options.force === true } : {}),
        });

        if (!updateResult.ok) {
          printError(`Failed to update ${result.source}: ${updateResult.error.message}`);
          errors += 1;
        } else {
          printSuccess(
            `Updated ${result.source}: ${updateResult.value.previousVersion ?? 'none'} → ${updateResult.value.newVersion}`
          );
        }
      }

      if (errors > 0) {
        process.exit(1);
      }
    });

  return plugins;
}
