/**
 * @file Plugin Cache
 * @description Centralized plugin caching with version awareness
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { readJson, writeJson, dirExists, ensureDir } from './fs.js';
import { logger } from './logger.js';
import { ok, err, tryCatchAsync } from './result.js';

import type { Result } from './result.js';

/**
 * Default cache directory name within .ai-tool-sync
 */
export const DEFAULT_PLUGIN_CACHE_DIR = 'plugins';

/**
 * Manifest file name
 */
export const CACHE_MANIFEST_FILE = 'cache-manifest.json';

/**
 * Per-plugin metadata file name
 */
export const PLUGIN_META_FILE = '.plugin-cache-meta.json';

/**
 * Variable for plugin root path substitution
 */
export const CLAUDE_PLUGIN_ROOT_VAR = '${CLAUDE_PLUGIN_ROOT}';

/**
 * Plugin cache manifest
 */
export interface PluginCacheManifest {
  version: '1.0.0';
  plugins: Record<string, PluginCacheEntry>;
  lastUpdated: string;
}

/**
 * Single plugin cache entry
 */
export interface PluginCacheEntry {
  /** Generated plugin ID */
  id: string;
  /** Original source string */
  source: string;
  /** Pinned version (exact, no ranges) */
  version?: string;
  /** ISO date when cached */
  cachedAt: string;
  /** Relative path from plugins/ dir */
  path: string;
  /** SHA256 content hash for integrity */
  contentHash?: string;
}

/**
 * Per-plugin metadata stored with the cached content
 */
export interface PluginCacheMetadata {
  id: string;
  source: string;
  version?: string;
  cachedAt: string;
  lastAccessed: string;
  contentHash?: string;
  manifest?: {
    name: string;
    version?: string;
    description?: string;
  };
}

/**
 * Options for plugin cache operations
 */
export interface PluginCacheOptions {
  /** Base directory for cache (default: .ai-tool-sync) */
  baseDir?: string;
  /** Force refresh (ignore cache) */
  forceRefresh?: boolean;
}

/**
 * Generate deterministic plugin ID from source
 *
 * @example
 * generatePluginId('github:owner/repo@v1.0.0') // 'github_owner_repo_v1.0.0'
 * generatePluginId('npm:@org/pkg@1.0.0') // 'npm_org_pkg_1.0.0'
 */
export function generatePluginId(source: string, version?: string): string {
  // Extract source type prefix
  let sourceType = '';
  let normalized = source;

  if (source.startsWith('github:')) {
    sourceType = 'github';
    normalized = source.slice(7);
  } else if (source.startsWith('gitlab:')) {
    sourceType = 'gitlab';
    normalized = source.slice(7);
  } else if (source.startsWith('bitbucket:')) {
    sourceType = 'bitbucket';
    normalized = source.slice(10);
  } else if (source.startsWith('npm:') || source.includes('npm:')) {
    sourceType = 'npm';
    normalized = source.replace(/^.*npm:/, '');
  } else if (source.startsWith('pip:')) {
    sourceType = 'pip';
    normalized = source.slice(4);
  } else if (source.startsWith('claude-plugin:')) {
    // For claude-plugin, detect the actual source type
    const inner = source.slice(14);
    if (inner.startsWith('npm:')) {
      sourceType = 'npm';
      normalized = inner.slice(4);
    } else {
      normalized = inner;
    }
  }

  // Remove @ from start of scoped packages
  normalized = normalized.replace(/^@/, '');

  // Replace separators with underscores
  normalized = normalized
    .replace(/[/:@#]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  // Append version if provided and not already in normalized string
  if (version) {
    // Keep the 'v' prefix in the version for the ID
    const safeVersion = version.replace(/[^a-zA-Z0-9.-]/g, '_');
    const versionWithoutV = version.replace(/^v/, '');

    // Check if version (with or without 'v') is already in normalized
    if (!normalized.includes(safeVersion) && !normalized.includes(versionWithoutV)) {
      normalized = `${normalized}_${safeVersion}`;
    }
  }

  // Prefix with source type if we have one
  if (sourceType) {
    return `${sourceType}_${normalized}`;
  }

  return normalized;
}

/**
 * Calculate SHA256 hash of content for integrity checking
 */
export function calculateContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Resolve ${CLAUDE_PLUGIN_ROOT} variable in a string
 *
 * @param input - String potentially containing the variable
 * @param pluginPath - Absolute path to the plugin directory
 * @returns Resolved string with variable substituted
 */
export function resolvePluginRootVariable(input: string, pluginPath: string): string {
  return input.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginPath);
}

/**
 * Plugin Cache Manager
 */
export class PluginCache {
  private baseDir: string;
  private cacheDir: string;
  private manifest: PluginCacheManifest | null = null;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.cacheDir = path.join(this.baseDir, DEFAULT_PLUGIN_CACHE_DIR);
  }

  /**
   * Initialize the cache (create directories, load manifest)
   */
  async init(): Promise<Result<void>> {
    const ensureResult = await ensureDir(this.cacheDir);
    if (!ensureResult.ok) {
      return ensureResult;
    }

    const manifestResult = await this.loadManifest();
    if (!manifestResult.ok) {
      // Create new manifest if doesn't exist
      this.manifest = {
        version: '1.0.0',
        plugins: {},
        lastUpdated: new Date().toISOString(),
      };
      await this.saveManifest();
    } else {
      this.manifest = manifestResult.value;
    }

    return ok(undefined);
  }

  /**
   * Get the cache directory path
   */
  getCacheDir(): string {
    return this.cacheDir;
  }

  /**
   * Get the absolute path for a plugin by ID
   */
  getPluginPath(pluginId: string): string {
    return path.join(this.cacheDir, pluginId);
  }

  /**
   * Check if a plugin is cached with the correct version
   */
  async isCached(source: string, version?: string): Promise<boolean> {
    const pluginId = generatePluginId(source, version);
    const entry = this.manifest?.plugins[pluginId];

    if (!entry) {
      return false;
    }

    // Check if version matches (if specified)
    if (version && entry.version !== version) {
      return false;
    }

    // Verify the directory exists
    const pluginPath = this.getPluginPath(pluginId);
    return await dirExists(pluginPath);
  }

  /**
   * Get a cached plugin entry
   */
  getCacheEntry(source: string, version?: string): PluginCacheEntry | null {
    const pluginId = generatePluginId(source, version);
    return this.manifest?.plugins[pluginId] ?? null;
  }

  /**
   * Add or update a plugin in the cache
   */
  async cachePlugin(
    source: string,
    version: string | undefined,
    _contentPath: string,
    metadata?: Partial<PluginCacheMetadata>
  ): Promise<Result<PluginCacheEntry>> {
    const pluginId = generatePluginId(source, version);
    const pluginCachePath = this.getPluginPath(pluginId);

    // Create entry
    const entry: PluginCacheEntry = {
      id: pluginId,
      source,
      ...(version !== undefined && { version }),
      cachedAt: new Date().toISOString(),
      path: pluginId,
      ...(metadata?.contentHash !== undefined && { contentHash: metadata.contentHash }),
    };

    // Update manifest
    if (this.manifest) {
      this.manifest.plugins[pluginId] = entry;
      this.manifest.lastUpdated = new Date().toISOString();

      const saveResult = await this.saveManifest();
      if (!saveResult.ok) {
        return err(saveResult.error);
      }
    }

    // Save per-plugin metadata
    const pluginMeta: PluginCacheMetadata = {
      id: pluginId,
      source,
      ...(version !== undefined && { version }),
      cachedAt: entry.cachedAt,
      lastAccessed: entry.cachedAt,
      ...metadata,
    };

    const metaPath = path.join(pluginCachePath, PLUGIN_META_FILE);
    await writeJson(metaPath, pluginMeta);

    logger.debug(`Cached plugin: ${pluginId}`);

    return ok(entry);
  }

  /**
   * Invalidate (remove) a cached plugin
   */
  async invalidate(source: string, version?: string): Promise<Result<void>> {
    const pluginId = generatePluginId(source, version);
    const pluginPath = this.getPluginPath(pluginId);

    // Remove from manifest
    if (this.manifest?.plugins[pluginId]) {
      delete this.manifest.plugins[pluginId];
      this.manifest.lastUpdated = new Date().toISOString();
      await this.saveManifest();
    }

    // Remove directory
    return tryCatchAsync(async () => {
      if (await dirExists(pluginPath)) {
        await fs.rm(pluginPath, { recursive: true, force: true });
      }
    });
  }

  /**
   * Clear entire cache
   */
  async clearAll(): Promise<Result<void>> {
    this.manifest = {
      version: '1.0.0',
      plugins: {},
      lastUpdated: new Date().toISOString(),
    };

    await this.saveManifest();

    // Remove all plugin directories
    return tryCatchAsync(async () => {
      const entries = await fs.readdir(this.cacheDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          await fs.rm(path.join(this.cacheDir, entry.name), {
            recursive: true,
            force: true,
          });
        }
      }
    });
  }

  /**
   * List all cached plugins
   */
  listCached(): PluginCacheEntry[] {
    return Object.values(this.manifest?.plugins ?? {});
  }

  /**
   * Update last accessed time for a plugin
   */
  async touchPlugin(source: string, version?: string): Promise<void> {
    const pluginId = generatePluginId(source, version);
    const metaPath = path.join(this.getPluginPath(pluginId), PLUGIN_META_FILE);

    try {
      const result = await readJson<PluginCacheMetadata>(metaPath);
      if (result.ok) {
        result.value.lastAccessed = new Date().toISOString();
        await writeJson(metaPath, result.value);
      }
    } catch {
      // Ignore errors when touching metadata
    }
  }

  /**
   * Load the cache manifest
   */
  private async loadManifest(): Promise<Result<PluginCacheManifest>> {
    const manifestPath = path.join(this.cacheDir, CACHE_MANIFEST_FILE);
    return readJson<PluginCacheManifest>(manifestPath);
  }

  /**
   * Save the cache manifest
   */
  private async saveManifest(): Promise<Result<void>> {
    if (!this.manifest) {
      return err(new Error('Manifest not initialized'));
    }

    const manifestPath = path.join(this.cacheDir, CACHE_MANIFEST_FILE);
    return writeJson(manifestPath, this.manifest);
  }
}

/**
 * Create and initialize a plugin cache instance
 */
export async function createPluginCache(baseDir: string): Promise<Result<PluginCache>> {
  const cache = new PluginCache(baseDir);
  const initResult = await cache.init();

  if (!initResult.ok) {
    return err(initResult.error);
  }

  return ok(cache);
}
