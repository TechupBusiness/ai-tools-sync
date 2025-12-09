import * as path from 'node:path';

import { Command } from 'commander';

import { loadConfig, resolveConfigDir } from '../../config/loader.js';
import { parseGitSource } from '../../loaders/git.js';
import { PluginLoader } from '../../loaders/plugin.js';
import { logger } from '../../utils/logger.js';
import { createPluginCache, generatePluginId } from '../../utils/plugin-cache.js';
import { checkAllPluginsForUpdates, updatePlugin } from '../../utils/plugin-update.js';
import {
  printError,
  printHeader,
  printInfo,
  printListItem,
  printNewLine,
  printSuccess,
  printTable,
  printWarning,
} from '../output.js';

import type { PluginConfig } from '../../config/types.js';
import type { PluginCacheEntry } from '../../utils/plugin-cache.js';

interface PluginsListResult {
  plugins: Array<{
    name: string;
    source: string;
    version?: string;
    cachedAt: string;
    enabled: boolean;
    inConfig: boolean;
  }>;
  total: number;
}

interface PluginsListOptions {
  project?: string;
  configDir?: string;
  json?: boolean;
  verbose?: boolean;
}

interface PluginsAddOptions {
  project?: string;
  configDir?: string;
  name?: string;
  version?: string;
  force?: boolean;
  include?: string[];
  exclude?: string[];
  timeout?: string;
}

interface PluginsRemoveOptions {
  project?: string;
  configDir?: string;
  force?: boolean;
  keepCache?: boolean;
}

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
      (plugin) =>
        plugin.name === name || plugin.source === name || plugin.source.endsWith(`/${name}`)
    );
    if (configured) {
      return [configured.source];
    }

    const cachedMatch = cachedSources.find(
      (source) => source === name || source.endsWith(`/${name}`) || source.includes(name)
    );
    return cachedMatch ? [cachedMatch] : [name];
  }

  const enabledConfig = configPlugins
    .filter((plugin) => plugin.enabled !== false)
    .map((plugin) => plugin.source);
  const combined = [...enabledConfig, ...cachedSources];
  return [...new Set(combined)];
}

export function createPluginsCommand(): Command {
  const plugins = new Command('plugins').description('Manage plugins');

  plugins
    .command('list')
    .description('List installed plugins')
    .option('-p, --project <path>', 'Project root directory')
    .option('-c, --config-dir <path>', 'Configuration directory name')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Show detailed information')
    .action(async (options: PluginsListOptions) => {
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
      const configPlugins = configResult.ok ? (configResult.value.use?.plugins ?? []) : [];
      const cachedPlugins = cache.listCached();

      const pluginsList = buildPluginList(cachedPlugins, configPlugins);
      const listResult: PluginsListResult = {
        plugins: pluginsList,
        total: pluginsList.length,
      };

      if (options.json) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(listResult, null, 2));
        return;
      }

      printHeader('AI Tool Sync - Installed Plugins');

      if (pluginsList.length === 0) {
        printInfo('No plugins installed.');
        printInfo('Use "ai-sync plugins add <source>" to add a plugin.');
        return;
      }

      const headers = ['Name', 'Source', 'Version', 'Status'];
      const rows = pluginsList.map((p) => [
        p.name,
        truncateSource(p.source, 40),
        p.version ?? 'latest',
        getStatusText(p.enabled, p.inConfig, p.cachedAt),
      ]);

      printTable(headers, rows);
      printNewLine();

      if (options.verbose) {
        printInfo('Details:');
        for (const plugin of pluginsList) {
          printListItem(
            `${plugin.name} (${getStatusText(plugin.enabled, plugin.inConfig, plugin.cachedAt)})`
          );
          printListItem(`source: ${plugin.source}`, 1);
          if (plugin.version) {
            printListItem(`version: ${plugin.version}`, 1);
          }
          if (plugin.cachedAt) {
            printListItem(`cached at: ${plugin.cachedAt}`, 1);
          } else {
            printListItem('not cached', 1);
          }
          printListItem(`in config: ${plugin.inConfig ? 'yes' : 'no'}`, 1);
        }
        printNewLine();
      }

      printInfo(`Total: ${pluginsList.length} plugin(s)`);
    });

  plugins
    .command('add <source>')
    .description('Add a plugin from Git URL (e.g., github:owner/repo@v1.0.0)')
    .option('-p, --project <path>', 'Project root directory')
    .option('-c, --config-dir <path>', 'Configuration directory name')
    .option('-n, --name <name>', 'Custom plugin name')
    .option('-v, --version <version>', 'Pin to specific version')
    .option('--force', 'Overwrite if plugin already exists')
    .option('--include <types...>', 'Content types to include (rules,personas,commands,hooks)')
    .option('--exclude <types...>', 'Content types to exclude')
    .option('--timeout <ms>', 'Timeout for git operations in milliseconds')
    .action(async (source: string, options: PluginsAddOptions) => {
      const projectRoot = path.resolve(options.project ?? process.cwd());
      const configDirName = await resolveConfigDir({ projectRoot, configDir: options.configDir });
      const baseDir = path.join(projectRoot, configDirName);

      printHeader('AI Tool Sync - Add Plugin');

      const parsed = parseGitSource(source);
      if (!parsed) {
        printError(`Invalid plugin source: ${source}`);
        printInfo('Expected format: github:owner/repo[@version]');
        process.exit(1);
        return;
      }

      const cacheResult = await createPluginCache(baseDir);
      if (!cacheResult.ok) {
        printError(cacheResult.error.message);
        process.exit(1);
        return;
      }
      const cache = cacheResult.value;

      const pluginName = options.name ?? `${parsed.owner}-${parsed.repo}`;
      const version = options.version ?? parsed.ref;
      const sourceWithVersion = version
        ? source.includes('@')
          ? source.replace(/@.*$/, `@${version}`)
          : `${source}@${version}`
        : source;

      if (!options.force && (await cache.isCached(sourceWithVersion, version))) {
        printWarning(`Plugin "${pluginName}" is already installed.`);
        printInfo('Use --force to reinstall.');
        return;
      }

      printInfo(`Adding plugin: ${pluginName}`);
      printInfo(`Source: ${sourceWithVersion}`);

      const loader = new PluginLoader();
      const timeoutMs = options.timeout ? Number.parseInt(options.timeout, 10) : undefined;

      const loadResult = await loader.load(sourceWithVersion, {
        basePath: projectRoot,
        ...(options.force !== undefined ? { forceRefresh: options.force } : {}),
        ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {}),
        pluginCache: cache,
        config: {
          name: pluginName,
          source: sourceWithVersion,
          enabled: true,
          ...(version ? { version } : {}),
          ...(options.include ? { include: options.include } : {}),
          ...(options.exclude ? { exclude: options.exclude } : {}),
        },
      });

      if (loadResult.errors && loadResult.errors.length > 0) {
        printError(`Failed to add plugin: ${loadResult.errors[0]?.message ?? 'Unknown error'}`);
        printInfo(
          'If this is a private repo, ensure your git credentials or tokens are configured.'
        );
        process.exit(1);
        return;
      }

      const stats = {
        rules: loadResult.rules.length,
        personas: loadResult.personas.length,
        commands: loadResult.commands.length,
        hooks: loadResult.hooks.length,
      };

      printSuccess(`Plugin "${pluginName}" added successfully!`);
      printNewLine();
      printInfo('Loaded content:');
      if (stats.rules > 0) printListItem(`${stats.rules} rule(s)`);
      if (stats.personas > 0) printListItem(`${stats.personas} persona(s)`);
      if (stats.commands > 0) printListItem(`${stats.commands} command(s)`);
      if (stats.hooks > 0) printListItem(`${stats.hooks} hook(s)`);
      if (stats.rules + stats.personas + stats.commands + stats.hooks === 0) {
        printListItem('No content loaded (check include/exclude filters).');
      }

      printNewLine();
      printInfo('To use this plugin, add it to your config.yaml:');
      printNewLine();
      // eslint-disable-next-line no-console
      console.log(
        `  use:\n    plugins:\n      - name: ${pluginName}\n        source: ${sourceWithVersion}\n        enabled: true`
      );
    });

  plugins
    .command('remove <name>')
    .description('Remove a plugin')
    .option('-p, --project <path>', 'Project root directory')
    .option('-c, --config-dir <path>', 'Configuration directory name')
    .option('--force', 'Remove even if plugin is in config.yaml')
    .option('--keep-cache', 'Keep cached files (only remove from config)')
    .action(async (name: string, options: PluginsRemoveOptions) => {
      const projectRoot = path.resolve(options.project ?? process.cwd());
      const configDirName = await resolveConfigDir({ projectRoot, configDir: options.configDir });
      const baseDir = path.join(projectRoot, configDirName);

      printHeader('AI Tool Sync - Remove Plugin');

      const cacheResult = await createPluginCache(baseDir);
      if (!cacheResult.ok) {
        printError(cacheResult.error.message);
        process.exit(1);
        return;
      }
      const cache = cacheResult.value;

      const configResult = await loadConfig({ projectRoot, configDir: options.configDir });
      const configPlugins = configResult.ok ? (configResult.value.use?.plugins ?? []) : [];

      const cachedPlugins = cache.listCached();
      const cachedEntry = cachedPlugins.find(
        (p) =>
          p.source === name ||
          p.source.includes(name) ||
          generatePluginId(p.source, p.version).includes(name) ||
          extractPluginName(p.source) === name
      );
      const configEntry = configPlugins.find((p) => p.name === name || p.source.includes(name));

      if (!cachedEntry && !configEntry) {
        printError(`Plugin "${name}" not found.`);
        printInfo('Use "ai-sync plugins list" to see installed plugins.');
        process.exit(1);
        return;
      }

      if (configEntry && !options.force) {
        printWarning(`Plugin "${name}" is referenced in config.yaml.`);
        printInfo('Use --force to remove anyway, then manually update config.yaml.');
        process.exit(1);
        return;
      }

      if (cachedEntry && !options.keepCache) {
        printInfo(`Removing cached files for "${name}"...`);
        const invalidateResult = await cache.invalidate(cachedEntry.source, cachedEntry.version);
        if (!invalidateResult.ok) {
          printError(`Failed to remove cache: ${invalidateResult.error.message}`);
          process.exit(1);
          return;
        }
        printSuccess('Cache removed.');
      }

      if (configEntry) {
        printWarning('Plugin is still in config.yaml - please remove it manually.');
      }

      printSuccess(`Plugin "${name}" removed successfully!`);
    });

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
      const configPlugins = configResult.ok ? (configResult.value.use?.plugins ?? []) : [];
      const cachedSources = cache.listCached().map((entry) => entry.source);
      const sources = options.all
        ? cachedSources
        : collectSources(name, configPlugins, cachedSources);

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

function buildPluginList(
  cached: PluginCacheEntry[],
  config: PluginConfig[]
): PluginsListResult['plugins'] {
  const result: Map<
    string,
    {
      name: string;
      source: string;
      version?: string;
      cachedAt: string;
      enabled: boolean;
      inConfig: boolean;
    }
  > = new Map();

  for (const entry of cached) {
    const name = extractPluginName(entry.source);
    result.set(entry.source, {
      name,
      source: entry.source,
      cachedAt: entry.cachedAt,
      enabled: true,
      inConfig: false,
      ...(entry.version ? { version: entry.version } : {}),
    });
  }

  for (const plugin of config) {
    const existing = result.get(plugin.source);
    if (existing) {
      existing.name = plugin.name;
      existing.enabled = plugin.enabled !== false;
      existing.inConfig = true;
      if (plugin.version !== undefined) {
        existing.version = plugin.version;
      }
    } else {
      result.set(plugin.source, {
        name: plugin.name,
        source: plugin.source,
        cachedAt: '',
        enabled: plugin.enabled !== false,
        inConfig: true,
        ...(plugin.version ? { version: plugin.version } : {}),
      });
    }
  }

  return Array.from(result.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function extractPluginName(source: string): string {
  const parsed = parseGitSource(source);
  if (parsed) {
    return `${parsed.owner}/${parsed.repo}`;
  }
  return source.split('/').pop() ?? source;
}

function getStatusText(enabled: boolean, inConfig: boolean, cachedAt: string): string {
  if (inConfig && !cachedAt) {
    return enabled ? 'not installed' : 'disabled';
  }
  if (!inConfig) {
    return 'cached';
  }
  if (!enabled) {
    return 'disabled';
  }
  return 'enabled';
}

function truncateSource(source: string, maxLen: number): string {
  if (source.length <= maxLen) return source;
  return `${source.slice(0, maxLen - 3)}...`;
}
