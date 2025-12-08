/**
 * @file Plugin Loader
 * @description Git-based loader for Claude Code marketplace-style plugins
 *
 * Supports shorthand plugin sources like `github:owner/repo@v1.0.0` and
 * delegates content loading to the Claude plugin loader after cloning.
 */

import { exec } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { logger } from '../utils/logger.js';
import {
  createPluginCache,
  DEFAULT_PLUGIN_CACHE_DIR,
  generatePluginId,
  type PluginCache,
} from '../utils/plugin-cache.js';
import { err, ok, type Result } from '../utils/result.js';

import {
  emptyLoadResultWithSource,
  type LoadError,
  type LoadResult,
  type Loader,
  type LoaderOptions,
} from './base.js';
import { ClaudePluginLoader, type ClaudePluginLoaderOptions } from './claude-plugin.js';

const execAsync = promisify(exec);

/**
 * Plugin source prefixes
 */
export const PLUGIN_PREFIXES = ['plugin:', 'github:', 'gitlab:', 'bitbucket:'] as const;
export type PluginPrefix = (typeof PLUGIN_PREFIXES)[number];

/**
 * Parsed plugin source
 */
export interface ParsedPluginSource {
  /** Full clone URL */
  cloneUrl: string;
  /** Hosting provider (github.com, gitlab.com, etc.) */
  host: string;
  /** Repository owner/organization */
  owner: string;
  /** Repository name */
  repo: string;
  /** Version (tag or branch) - exact pins only, no ranges */
  version?: string;
  /** Subpath within the repository */
  subpath?: string;
  /** Original source string */
  original: string;
}

/**
 * Plugin loader options
 */
export interface PluginLoaderOptions extends LoaderOptions {
  /**
   * Plugin cache instance
   */
  pluginCache?: PluginCache;

  /**
   * Cache directory (default: .ai-tool-sync/)
   */
  cacheDir?: string;

  /**
   * Force refresh (ignore cache, re-clone)
   */
  forceRefresh?: boolean;

  /**
   * Git timeout in milliseconds (default: 5 minutes)
   */
  timeout?: number;

  /**
   * Personal access token for private repos
   */
  token?: string;
}

/**
 * Default base directory for cache if none is provided
 */
const DEFAULT_BASE_CACHE_DIR = '.ai-tool-sync';

const DEFAULT_GIT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Loader for Git-based Claude Code plugins (marketplace style)
 */
export class PluginLoader implements Loader {
  readonly name = 'plugin';

  private claudePluginLoader: ClaudePluginLoader;
  private pluginCache: PluginCache | null = null;

  constructor() {
    this.claudePluginLoader = new ClaudePluginLoader();
  }

  canLoad(source: string): boolean {
    for (const prefix of PLUGIN_PREFIXES) {
      if (source.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  async load(source: string, options?: PluginLoaderOptions): Promise<LoadResult> {
    const result = emptyLoadResultWithSource(source);

    // 1. Parse source URL
    const parsed = this.parseSource(source);
    if (!parsed) {
      result.errors = [
        {
          type: 'file',
          path: source,
          message: 'Invalid plugin source format',
        },
      ];
      return result;
    }

    // 2. Initialize cache if provided or requested
    const cacheInitResult = await this.initializeCache(options, parsed);
    if (cacheInitResult.ok) {
      this.pluginCache = cacheInitResult.value;
    }

    // 3. Ensure plugin is available locally (clone or use cache)
    const pluginPathResult = await this.ensurePluginCloned(parsed, options);
    if (!pluginPathResult.ok) {
      result.errors = [pluginPathResult.error];
      return result;
    }

    const pluginPath = pluginPathResult.value;

    // 4. Delegate to ClaudePluginLoader for content loading
    const delegateOptions: ClaudePluginLoaderOptions = {
      ...options,
      basePath: pluginPath,
    };

    if (parsed.version) {
      delegateOptions.version = parsed.version;
    }

    if (this.pluginCache) {
      delegateOptions.pluginCache = this.pluginCache;
    }

    const delegateResult = await this.claudePluginLoader.load(
      `claude-plugin:${pluginPath}`,
      delegateOptions
    );

    // 5. Update source to original plugin URL
    delegateResult.source = source;
    return delegateResult;
  }

  /**
   * Parse plugin source to extract components
   *
   * Supported formats:
   * - github:owner/repo
   * - github:owner/repo@v1.0.0
   * - github:owner/repo/subpath@v1.0.0
   * - gitlab:owner/repo@1.0.0
   * - bitbucket:owner/repo@tag
   * - plugin:github:owner/repo@v1.0.0 (explicit plugin prefix)
   */
  parseSource(source: string): ParsedPluginSource | null {
    let normalized = source;

    // Remove plugin: prefix if present
    if (normalized.startsWith('plugin:')) {
      normalized = normalized.slice(7);
    }

    // Determine host from prefix
    let host: string;
    let remainder: string;

    if (normalized.startsWith('github:')) {
      host = 'github.com';
      remainder = normalized.slice(7);
    } else if (normalized.startsWith('gitlab:')) {
      host = 'gitlab.com';
      remainder = normalized.slice(7);
    } else if (normalized.startsWith('bitbucket:')) {
      host = 'bitbucket.org';
      remainder = normalized.slice(10);
    } else {
      return null;
    }

    // Parse: owner/repo[/subpath][@version]
    const versionSplit = remainder.split('@');
    const pathPart = versionSplit[0] ?? '';
    const version = versionSplit[1];

    const pathParts = pathPart.split('/');
    if (pathParts.length < 2) {
      return null;
    }

    const owner = pathParts[0] ?? '';
    const repo = pathParts[1] ?? '';
    const subpath = pathParts.length > 2 ? pathParts.slice(2).join('/') : undefined;

    // Build clone URL (always HTTPS)
    const cloneUrl = `https://${host}/${owner}/${repo}.git`;

    const result: ParsedPluginSource = {
      cloneUrl,
      host,
      owner,
      repo,
      original: source,
    };

    if (version) {
      result.version = version;
    }

    if (subpath) {
      result.subpath = subpath;
    }

    return result;
  }

  /**
   * Ensure plugin is cloned locally and return path
   */
  private async ensurePluginCloned(
    parsed: ParsedPluginSource,
    options?: PluginLoaderOptions
  ): Promise<Result<string, LoadError>> {
    const pluginId = generatePluginId(parsed.original, parsed.version);
    const cacheDir = this.resolveCacheDir(options);
    const pluginRootPath = path.join(cacheDir, DEFAULT_PLUGIN_CACHE_DIR, pluginId);

    // Try cache first when available
    if (this.pluginCache && !options?.forceRefresh) {
      if (await this.pluginCache.isCached(parsed.original, parsed.version)) {
        const entry = this.pluginCache.getCacheEntry(parsed.original, parsed.version);
        if (entry) {
          const cachedPath = this.pluginCache.getPluginPath(entry.id);
          await this.pluginCache.touchPlugin(parsed.original, parsed.version);
          const maybeSubpath = this.resolveSubpath(cachedPath, parsed.subpath);
          if (!maybeSubpath.ok) {
            return err(maybeSubpath.error);
          }
          logger.debug(`Using cached plugin: ${maybeSubpath.value}`);
          return ok(maybeSubpath.value);
        }
      }
    }

    // Use existing directory if present and not forcing refresh
    if (!options?.forceRefresh && fs.existsSync(pluginRootPath)) {
      const maybeSubpath = this.resolveSubpath(pluginRootPath, parsed.subpath);
      if (!maybeSubpath.ok) {
        return err(maybeSubpath.error);
      }
      return ok(maybeSubpath.value);
    }

    // If force refresh, remove any existing content
    if (options?.forceRefresh && fs.existsSync(pluginRootPath)) {
      await fs.promises.rm(pluginRootPath, { recursive: true, force: true });
    }

    // Clone the repository
    const cloneResult = await this.clonePlugin(parsed, pluginRootPath, options);
    if (!cloneResult.ok) {
      return err({
        type: 'directory',
        path: parsed.original,
        message: cloneResult.error.message,
      });
    }

    // Update cache metadata
    if (this.pluginCache) {
      await this.pluginCache.cachePlugin(parsed.original, parsed.version, pluginRootPath);
    }

    const subpathResult = this.resolveSubpath(pluginRootPath, parsed.subpath);
    if (!subpathResult.ok) {
      return err(subpathResult.error);
    }

    return ok(subpathResult.value);
  }

  /**
   * Resolve cache directory to an absolute path
   */
  private resolveCacheDir(options?: PluginLoaderOptions): string {
    const baseDir = options?.cacheDir ?? DEFAULT_BASE_CACHE_DIR;
    const basePath = options?.basePath ?? process.cwd();
    return path.isAbsolute(baseDir) ? baseDir : path.resolve(basePath, baseDir);
  }

  /**
   * Initialize plugin cache if provided in options or via cacheDir
   */
  private async initializeCache(
    options: PluginLoaderOptions | undefined,
    parsed: ParsedPluginSource
  ): Promise<Result<PluginCache | null, Error>> {
    if (options?.pluginCache) {
      return ok(options.pluginCache);
    }

    const cacheDir = this.resolveCacheDir(options);
    const cacheResult = await createPluginCache(cacheDir);
    if (cacheResult.ok) {
      logger.debug(`Initialized plugin cache at ${cacheDir} for ${parsed.original}`);
      return ok(cacheResult.value);
    }

    logger.debug(
      `Failed to initialize plugin cache at ${cacheDir}: ${
        cacheResult.error instanceof Error ? cacheResult.error.message : String(cacheResult.error)
      }`
    );
    return ok(null);
  }

  /**
   * Clone plugin repository
   */
  private async clonePlugin(
    parsed: ParsedPluginSource,
    targetPath: string,
    options?: PluginLoaderOptions
  ): Promise<Result<void, Error>> {
    // Build clone command
    const args = ['clone', '--depth', '1'];

    // Add branch/tag if specified
    if (parsed.version) {
      args.push('--branch', parsed.version);
    }

    args.push('--single-branch');

    // Add token to URL if provided
    let cloneUrl = parsed.cloneUrl;
    if (options?.token) {
      try {
        const url = new URL(cloneUrl);
        url.username = options.token;
        url.password = 'x-oauth-basic';
        cloneUrl = url.toString();
      } catch (error) {
        return err(
          error instanceof Error ? error : new Error(`Invalid clone URL: ${String(error)}`)
        );
      }
    }

    args.push(cloneUrl, targetPath);

    const command = `git ${args.join(' ')}`;
    const timeout = options?.timeout ?? DEFAULT_GIT_TIMEOUT_MS;

    logger.debug(
      `Cloning plugin: ${parsed.owner}/${parsed.repo}${parsed.version ? `@${parsed.version}` : ''}`
    );

    try {
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      await execAsync(command, {
        timeout,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
      });
      return ok(undefined);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to clone plugin repository: ${String(error)}`;
      logger.error(`Failed to clone plugin: ${message}`);
      return err(new Error(message));
    }
  }

  /**
   * Resolve optional subpath and validate existence
   */
  private resolveSubpath(
    rootPath: string,
    subpath?: string
  ): Result<string, LoadError> {
    if (!subpath) {
      return ok(rootPath);
    }

    const resolved = path.join(rootPath, subpath);
    if (!fs.existsSync(resolved)) {
      return err({
        type: 'directory',
        path: subpath,
        message: `Subpath does not exist in plugin repository: ${subpath}`,
      });
    }

    return ok(resolved);
  }
}

/**
 * Factory function for PluginLoader
 */
export function createPluginLoader(): PluginLoader {
  return new PluginLoader();
}


