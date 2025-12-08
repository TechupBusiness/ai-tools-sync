import * as fs from 'node:fs';
import * as path from 'node:path';

import { logger } from '../utils/logger.js';
import { DEFAULT_PLUGIN_CACHE_DIR, generatePluginId } from '../utils/plugin-cache.js';
import { err, ok, type Result } from '../utils/result.js';

import {
  emptyLoadResultWithSource,
  type LoadError,
  type LoadResult,
  type Loader,
} from './base.js';
import { ClaudePluginLoader } from './claude-plugin.js';
import { GitLoader, type GitLoaderOptions, parseGitSource, DEFAULT_GIT_CACHE_DIR } from './git.js';
import { LocalLoader } from './local.js';

import type { PluginConfig, PluginLoadResult, PluginLoaderOptions } from '../config/types.js';

/**
 * Plugin source prefixes
 */
export const PLUGIN_PREFIXES = ['plugin:', 'github:', 'gitlab:', 'bitbucket:', 'git:'] as const;
export type PluginPrefix = (typeof PLUGIN_PREFIXES)[number];

/**
 * Parsed plugin source (git-based)
 */
export interface ParsedPluginSource {
  cloneUrl: string;
  host: string;
  owner: string;
  repo: string;
  version?: string | undefined;
  subpath?: string | undefined;
  original: string;
}

/**
 * Plugin Loader
 *
 * Orchestrates plugin loading from config.yaml's `use.plugins` section.
 * Delegates to GitLoader for remote sources, LocalLoader for local paths,
 * then wraps with ClaudePluginLoader for content transformation.
 */
export class PluginLoader implements Loader {
  readonly name = 'plugin';

  private gitLoader: GitLoader;
  private localLoader: LocalLoader;
  private claudePluginLoader: ClaudePluginLoader;

  constructor() {
    this.gitLoader = new GitLoader();
    this.localLoader = new LocalLoader();
    this.claudePluginLoader = new ClaudePluginLoader();
  }

  canLoad(source: string): boolean {
    return this.gitLoader.canLoad(this.normalizeForGit(source)) || this.localLoader.canLoad(source);
  }

  async load(source: string, options?: PluginLoaderOptions): Promise<PluginLoadResult> {
    const config = options?.config;
    const disabled = config?.enabled === false;

    if (disabled) {
      const empty = emptyLoadResultWithSource(source) as PluginLoadResult;
      empty.pluginInfo = this.buildPluginInfo(empty, source, config?.version, config);
      return empty;
    }

    if (this.isLocalSource(source)) {
      const localPath = this.resolveLocalPath(source, options);
      if (!fs.existsSync(localPath)) {
        const result = emptyLoadResultWithSource(source) as PluginLoadResult;
        result.errors = [
          {
            type: 'directory',
            path: localPath,
            message: `Plugin path does not exist: ${localPath}`,
          },
        ];
        return result;
      }
      return this.loadWithClaude(source, localPath, config?.version, config, options);
    }

    const parsedResult = this.parsePluginSource(source, config?.version);
    if (!parsedResult.ok) {
      const result = emptyLoadResultWithSource(source) as PluginLoadResult;
      result.errors = [parsedResult.error];
      return result;
    }

    const parsed = parsedResult.value;
    const resolvedVersion = config?.version ?? parsed.version;
    const gitSource = this.buildGitSource(parsed, resolvedVersion);

    const pluginPathResult = await this.resolveGitPluginPath(
      source,
      gitSource,
      parsed,
      resolvedVersion,
      options
    );

    if (!pluginPathResult.ok) {
      const result = emptyLoadResultWithSource(source) as PluginLoadResult;
      result.errors = [pluginPathResult.error];
      return result;
    }

    return this.loadWithClaude(source, pluginPathResult.value, resolvedVersion, config, options);
  }

  /**
   * Normalize plugin source for git loader detection (convert @ -> # when needed)
   */
  private normalizeForGit(source: string): string {
    if (source.startsWith('plugin:')) {
      return this.normalizeForGit(source.slice(7));
    }

    if (source.startsWith('git@')) {
      return source;
    }

    if (source.includes('#')) {
      return source;
    }

    const atIndex = source.lastIndexOf('@');
    if (atIndex > source.indexOf(':')) {
      return `${source.slice(0, atIndex)}#${source.slice(atIndex + 1)}`;
    }

    return source;
  }

  private isLocalSource(source: string): boolean {
    return this.localLoader.canLoad(source) && !this.gitLoader.canLoad(this.normalizeForGit(source));
  }

  private resolveLocalPath(source: string, options?: PluginLoaderOptions): string {
    const basePath = options?.basePath ?? process.cwd();
    return path.isAbsolute(source) ? source : path.resolve(basePath, source);
  }

  /**
   * Parse plugin source to structured git info
   */
  private parsePluginSource(
    source: string,
    overrideVersion?: string
  ): Result<ParsedPluginSource, LoadError> {
    const normalized = source.startsWith('plugin:') ? source.slice(7) : source;

    // Try shorthand parsing with @ version first
    if (
      normalized.startsWith('github:') ||
      normalized.startsWith('gitlab:') ||
      normalized.startsWith('bitbucket:')
    ) {
      const { host, remainder } = this.extractHostAndPath(normalized);
      if (!host) {
        return err({
          type: 'file',
          path: source,
          message: 'Invalid plugin source format',
        });
      }

      const { owner, repo, subpath, version } = this.extractRepoParts(remainder);
      if (!owner || !repo) {
        return err({
          type: 'file',
          path: source,
          message: 'Invalid plugin source format',
        });
      }

      const cloneUrl = `https://${host}/${repo ? `${owner}/${repo}` : owner}.git`;
      return ok({
        cloneUrl,
        host,
        owner,
        repo,
        subpath,
        version: overrideVersion ?? version,
        original: normalized,
      });
    }

    // Fallback to GitLoader parsing (supports git:, ssh, https)
    const gitParsed = parseGitSource(this.normalizeForGit(normalized));
    if (!gitParsed) {
      return err({
        type: 'file',
        path: source,
        message: 'Invalid plugin source format',
      });
    }

    return ok({
      cloneUrl: gitParsed.cloneUrl,
      host: gitParsed.host,
      owner: gitParsed.owner,
      repo: gitParsed.repo,
      subpath: gitParsed.subpath,
      version: overrideVersion ?? gitParsed.ref,
      original: normalized,
    });
  }

  private extractHostAndPath(input: string): { host: string | null; remainder: string } {
    if (input.startsWith('github:')) {
      return { host: 'github.com', remainder: input.slice(7) };
    }
    if (input.startsWith('gitlab:')) {
      return { host: 'gitlab.com', remainder: input.slice(7) };
    }
    if (input.startsWith('bitbucket:')) {
      return { host: 'bitbucket.org', remainder: input.slice(10) };
    }
    return { host: null, remainder: input };
  }

  private extractRepoParts(
    remainder: string
  ): { owner: string; repo: string; subpath?: string | undefined; version?: string | undefined } {
    const [pathPart = '', version] = remainder.split('@');
    const segments = pathPart.split('/');

    const owner = segments[0] ?? '';
    const repo = segments[1] ?? '';
    const subpath = segments.length > 2 ? segments.slice(2).join('/') : undefined;

    return { owner, repo, subpath, version };
  }

  private buildGitSource(parsed: ParsedPluginSource, version?: string): string {
    const base = parsed.original.includes('#') || parsed.original.includes('@')
      ? parsed.original.replace(/[@#].*$/, '')
      : parsed.original;
    const normalized = this.normalizeForGit(base);
    return version ? `${normalized}#${version}` : normalized;
  }

  private async resolveGitPluginPath(
    originalSource: string,
    gitSource: string,
    parsed: ParsedPluginSource,
    version: string | undefined,
    options?: PluginLoaderOptions
  ): Promise<Result<string, LoadError>> {
    const cached = await this.tryUsePluginCache(originalSource, parsed.subpath, version, options);
    if (cached) {
      logger.debug(`Using cached plugin for ${originalSource}: ${cached}`);
      return ok(cached);
    }

    const cacheRoot = this.resolveCacheRoot(options);
    const { pluginCache: _pc, config: _cfg, forceRefresh, basePath, ...restOptions } = options ?? {};
    const gitOptions: GitLoaderOptions = {
      ...restOptions,
      cacheDir: cacheRoot,
      ...(basePath !== undefined ? { basePath } : {}),
      ...(forceRefresh !== undefined ? { forceRefresh } : {}),
      ...(forceRefresh ? { useCache: false } : {}),
    };

    logger.debug(`Loading plugin via git: ${gitSource}`);
    const gitResult = await this.gitLoader.load(gitSource, gitOptions);
    if (gitResult.errors && gitResult.errors.length > 0) {
      const firstError = gitResult.errors[0];
      if (firstError) {
        return err({
          type: firstError.type,
          path: firstError.path,
          message: firstError.message,
        });
      }
    }

    const pluginPath = this.buildPluginPath(cacheRoot, gitSource, version, parsed.subpath);
    if (!fs.existsSync(pluginPath)) {
      return err({
        type: 'directory',
        path: pluginPath,
        message: `Plugin path not found after git fetch: ${pluginPath}`,
      });
    }

    if (options?.pluginCache) {
      const manifestVersion = gitResult.metadata?.pluginVersion ?? version;
      const manifest = gitResult.metadata
        ? {
            name: gitResult.metadata.pluginName ?? parsed.repo,
            ...(manifestVersion ? { version: manifestVersion } : {}),
            ...(gitResult.metadata.pluginDescription
              ? { description: gitResult.metadata.pluginDescription }
              : {}),
          }
        : undefined;

      await options.pluginCache.cachePlugin(originalSource, version, pluginPath, {
        ...(manifest ? { manifest } : {}),
      });
    }

    return ok(pluginPath);
  }

  private async tryUsePluginCache(
    source: string,
    subpath: string | undefined,
    version: string | undefined,
    options?: PluginLoaderOptions
  ): Promise<string | null> {
    const cache = options?.pluginCache;
    if (!cache) {
      return null;
    }

    const entry =
      cache.getCacheEntry(source, version) ??
      cache.listCached().find((cached) => cached.source === source);

    if (!entry) {
      return null;
    }

    if (options?.forceRefresh) {
      await cache.invalidate(source, entry.version);
      return null;
    }

    if (version && entry.version && entry.version !== version) {
      await cache.invalidate(source, entry.version);
      return null;
    }

    const rootPath = cache.getPluginPath(entry.id);
    if (!fs.existsSync(rootPath)) {
      await cache.invalidate(source, entry.version);
      return null;
    }

    return subpath ? path.join(rootPath, subpath) : rootPath;
  }

  private resolveCacheRoot(options?: PluginLoaderOptions): string {
    if (options?.pluginCache) {
      return path.dirname(options.pluginCache.getCacheDir());
    }

    const basePath = options?.basePath ?? process.cwd();
    const cacheDir = DEFAULT_GIT_CACHE_DIR;
    return path.isAbsolute(cacheDir) ? cacheDir : path.resolve(basePath, cacheDir);
  }

  private buildPluginPath(
    cacheRoot: string,
    gitSource: string,
    version: string | undefined,
    subpath?: string
  ): string {
    const pluginId = generatePluginId(gitSource, version);
    const root = path.join(cacheRoot, DEFAULT_PLUGIN_CACHE_DIR, pluginId);
    return subpath ? path.join(root, subpath) : root;
  }

  private filterResultByConfig(result: LoadResult, config?: PluginConfig): LoadResult {
    if (!config) {
      return result;
    }

    const filtered: LoadResult = {
      ...result,
      rules: result.rules,
      personas: result.personas,
      commands: result.commands,
      hooks: result.hooks,
    };

    if (config.include) {
      if (config.include.length === 0) {
        filtered.rules = [];
        filtered.personas = [];
        filtered.commands = [];
        filtered.hooks = [];
      } else {
        filtered.rules = config.include.includes('rules') ? result.rules : [];
        filtered.personas = config.include.includes('personas') ? result.personas : [];
        filtered.commands = config.include.includes('commands') ? result.commands : [];
        filtered.hooks = config.include.includes('hooks') ? result.hooks : [];
      }
    }

    if (config.exclude) {
      if (config.exclude.includes('rules')) filtered.rules = [];
      if (config.exclude.includes('personas')) filtered.personas = [];
      if (config.exclude.includes('commands')) filtered.commands = [];
      if (config.exclude.includes('hooks')) filtered.hooks = [];
    }

    return filtered;
  }

  private buildPluginInfo(
    result: LoadResult,
    source: string,
    version?: string,
    config?: PluginConfig
  ): NonNullable<PluginLoadResult['pluginInfo']> {
    const metadata = result.metadata;
    const name = metadata?.pluginName ?? config?.name ?? source;
    const description = metadata?.pluginDescription;
    const resolvedVersion = metadata?.pluginVersion ?? version ?? config?.version;

    return {
      name,
      source,
      ...(resolvedVersion ? { version: resolvedVersion } : {}),
      ...(description ? { description } : {}),
    };
  }

  private async loadWithClaude(
    originalSource: string,
    pluginPath: string,
    version: string | undefined,
    config: PluginConfig | undefined,
    options?: PluginLoaderOptions
  ): Promise<PluginLoadResult> {
    const delegateOptions = {
      ...options,
      basePath: pluginPath,
      ...(options?.pluginCache ? { pluginCache: options.pluginCache } : {}),
      ...(version ? { version } : {}),
    };

    const delegateResult = await this.claudePluginLoader.load(
      `claude-plugin:${pluginPath}`,
      delegateOptions
    );

    delegateResult.source = originalSource;

    const filtered = this.filterResultByConfig(delegateResult, config) as PluginLoadResult;
    filtered.pluginInfo = this.buildPluginInfo(delegateResult, originalSource, version, config);
    filtered.source = originalSource;

    return filtered;
  }
}

export function createPluginLoader(): PluginLoader {
  return new PluginLoader();
}

export type { PluginLoaderOptions, PluginLoadResult } from '../config/types.js';
