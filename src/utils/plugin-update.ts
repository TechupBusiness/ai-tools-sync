import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { GitLoader, isGitAvailable, parseGitSource } from '../loaders/git.js';

import { dirExists, ensureDir } from './fs.js';
import { logger } from './logger.js';
import { generatePluginId, type PluginCache, type PluginCacheEntry } from './plugin-cache.js';
import { err, ok, type Result } from './result.js';
import { compareVersions, normalizeVersion, sortVersionsDesc } from './version.js';

const execAsync = promisify(exec);

const DEFAULT_TIMEOUT_MS = 30000;
const LOCAL_PLUGIN_ERROR = 'Local plugins cannot be updated';

/**
 * Available version information for a plugin
 */
export interface PluginVersionInfo {
  currentVersion: string | null;
  latestVersion: string | null;
  availableVersions: string[];
  hasUpdate: boolean;
}

/**
 * Result of checking for updates on a single plugin
 */
export interface PluginUpdateCheck {
  source: string;
  pluginId: string;
  versions: PluginVersionInfo;
  hasUpdate: boolean;
  error?: string;
}

/**
 * Result of updating a plugin
 */
export interface PluginUpdateResult {
  source: string;
  pluginId: string;
  previousVersion: string | null;
  newVersion: string;
  success: boolean;
  error?: string;
}

/**
 * Options for the update check
 */
export interface UpdateCheckOptions {
  baseDir?: string;
  timeout?: number;
}

/**
 * Options for the update command
 */
export interface UpdateOptions extends UpdateCheckOptions {
  apply?: boolean;
  force?: boolean;
}

function findCacheEntry(cache: PluginCache, source: string, version?: string): PluginCacheEntry | null {
  const direct = cache.getCacheEntry(source, version);
  if (direct) {
    return direct;
  }

  // Fallback: locate by source when version not provided
  if (!version) {
    const match = cache.listCached().find((entry) => entry.source === source);
    return match ?? null;
  }

  return null;
}

function buildPluginId(entry: PluginCacheEntry | null, source: string, version: string | null): string {
  if (entry) {
    return entry.id;
  }
  return generatePluginId(source, version ?? undefined);
}

function isLocalSource(source: string): boolean {
  return source.startsWith('./') || source.startsWith('../') || path.isAbsolute(source);
}

/**
 * Use git ls-remote to fetch tags without cloning the repo.
 */
export async function fetchRemoteTags(repoUrl: string, timeout?: number): Promise<Result<string[]>> {
  const command = `git ls-remote --tags --refs ${repoUrl}`;

  try {
    const { stdout } = await execAsync(command, {
      timeout: timeout ?? DEFAULT_TIMEOUT_MS,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    });

    const tags = stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/refs\/tags\/(.+)$/);
        return match?.[1];
      })
      .filter((tag): tag is string => tag !== undefined);

    return ok(tags);
  } catch (error) {
    return err(new Error(`Failed to fetch tags: ${error instanceof Error ? error.message : String(error)}`));
  }
}

/**
 * Determine if a newer version is available.
 */
export function hasNewerVersion(current: string | null, latest: string | null): boolean {
  if (!latest) return false;
  if (!current) return true;

  const normalizedCurrent = normalizeVersion(current);
  const normalizedLatest = normalizeVersion(latest);

  if (!normalizedCurrent || !normalizedLatest) {
    return latest !== current;
  }

  try {
    return compareVersions(normalizedLatest, normalizedCurrent) > 0;
  } catch {
    return normalizedLatest !== normalizedCurrent;
  }
}

/**
 * Check for updates for a single plugin source.
 */
export async function checkForUpdates(
  cache: PluginCache,
  source: string,
  options: UpdateCheckOptions = {}
): Promise<Result<PluginUpdateCheck>> {
  if (!isGitAvailable()) {
    return err(new Error('Git is required for plugin updates'));
  }

  if (isLocalSource(source)) {
    return err(new Error(LOCAL_PLUGIN_ERROR));
  }

  const parsed = parseGitSource(source);
  if (!parsed) {
    return err(new Error('Invalid plugin source'));
  }

  const entry = findCacheEntry(cache, source);
  const currentVersion = entry?.version ?? null;

  const tagResult = await fetchRemoteTags(parsed.cloneUrl, options.timeout);
  if (!tagResult.ok) {
    return err(tagResult.error);
  }

  const sortedTags = sortVersionsDesc(tagResult.value);
  if (sortedTags.length === 0) {
    return err(new Error('No version tags found'));
  }

  const latestVersion = sortedTags[0] ?? null;
  const updateAvailable = hasNewerVersion(currentVersion, latestVersion);

  const pluginId = buildPluginId(entry, source, currentVersion ?? latestVersion);

  return ok({
    source,
    pluginId,
    versions: {
      currentVersion,
      latestVersion,
      availableVersions: sortedTags,
      hasUpdate: updateAvailable,
    },
    hasUpdate: updateAvailable,
  });
}

/**
 * Check all provided plugins (or all cached) for updates.
 */
export async function checkAllPluginsForUpdates(
  cache: PluginCache,
  sources?: string[],
  options: UpdateCheckOptions = {}
): Promise<Result<PluginUpdateCheck[]>> {
  const sourceList = sources?.length ? [...new Set(sources)] : cache.listCached().map((entry) => entry.source);
  const results: PluginUpdateCheck[] = [];

  for (const source of sourceList) {
    const checkResult = await checkForUpdates(cache, source, options);
    if (checkResult.ok) {
      results.push(checkResult.value);
    } else {
      const entry = findCacheEntry(cache, source);
      results.push({
        source,
        pluginId: buildPluginId(entry, source, entry?.version ?? null),
        versions: {
          currentVersion: entry?.version ?? null,
          latestVersion: null,
          availableVersions: [],
          hasUpdate: false,
        },
        hasUpdate: false,
        error: checkResult.error?.message ?? String(checkResult.error ?? 'Unknown error'),
      });
    }
  }

  return ok(results);
}

async function restoreLocalOverrides(backupPath: string, targetPath: string): Promise<void> {
  if (await dirExists(backupPath)) {
    await ensureDir(path.dirname(targetPath));
    await fs.rename(backupPath, targetPath);
  }
}

/**
 * Update a plugin to a specific version.
 */
export async function updatePlugin(
  cache: PluginCache,
  source: string,
  newVersion: string,
  options: UpdateOptions = {}
): Promise<Result<PluginUpdateResult>> {
  if (!isGitAvailable()) {
    return err(new Error('Git is required for plugin updates'));
  }

  if (isLocalSource(source)) {
    return err(new Error(LOCAL_PLUGIN_ERROR));
  }

  const parsed = parseGitSource(source);
  if (!parsed) {
    return err(new Error('Invalid plugin source'));
  }

  const entry = findCacheEntry(cache, source);
  const previousVersion = entry?.version ?? null;
  const pluginId = generatePluginId(source, newVersion);
  const pluginPath = cache.getPluginPath(pluginId);

  const localOverridesPath = path.join(pluginPath, '.local-overrides');
  const overridesBackupPath = path.join(cache.getCacheDir(), `${pluginId}-local-overrides.backup`);
  let hadOverrides = false;

  try {
    if (await dirExists(localOverridesPath)) {
      await ensureDir(path.dirname(overridesBackupPath));
      await fs.rm(overridesBackupPath, { recursive: true, force: true });
      await fs.rename(localOverridesPath, overridesBackupPath);
      hadOverrides = true;
    }
  } catch (error) {
    return err(new Error(`Failed to backup local overrides: ${error instanceof Error ? error.message : String(error)}`));
  }

  const invalidateResult = await cache.invalidate(source, entry?.version);
  if (!invalidateResult.ok) {
    if (hadOverrides) {
      await restoreLocalOverrides(overridesBackupPath, localOverridesPath);
    }
    return err(invalidateResult.error);
  }

  const gitLoader = new GitLoader();
  const sourceWithVersion = source.includes('#') ? source.replace(/#.*/, `#${newVersion}`) : `${source}#${newVersion}`;
  const cacheRoot = options.baseDir ?? path.dirname(cache.getCacheDir());
  const loadResult = await gitLoader.load(sourceWithVersion, {
    cacheDir: cacheRoot,
    forceRefresh: true,
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
  });

  if (loadResult.errors && loadResult.errors.length > 0) {
    if (hadOverrides) {
      await restoreLocalOverrides(overridesBackupPath, localOverridesPath);
    }
    return err(new Error(loadResult.errors[0]?.message ?? 'Failed to update plugin'));
  }

  await ensureDir(pluginPath);

  if (hadOverrides) {
    await restoreLocalOverrides(overridesBackupPath, localOverridesPath);
  }

  const cacheResult = await cache.cachePlugin(source, newVersion, pluginPath);
  if (!cacheResult.ok) {
    return err(cacheResult.error);
  }

  logger.debug(`Updated plugin ${source} to ${newVersion}`);

  return ok({
    source,
    pluginId,
    previousVersion,
    newVersion,
    success: true,
  });
}
