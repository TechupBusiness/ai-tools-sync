/**
 * @file Git Loader
 * @description Load content from Git repositories
 *
 * Clones git repositories and loads rules, personas, commands, and hooks from them.
 *
 * Supports:
 * - git:github.com/user/repo - GitHub repos
 * - git:gitlab.com/user/repo - GitLab repos
 * - git:https://github.com/user/repo.git - Full URLs
 * - github:user/repo - GitHub shorthand
 * - gitlab:user/repo - GitLab shorthand
 * - bitbucket:user/repo - Bitbucket shorthand
 * - Branch/tag/commit refs: github:user/repo#v1.0.0
 * - Subpath: github:user/repo/path/to/dir#v1.0.0
 * - Caching with version tracking
 * - Shallow clones for efficiency
 */

import { execSync, exec } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { logger } from '../utils/logger.js';
import { generatePluginId, DEFAULT_PLUGIN_CACHE_DIR } from '../utils/plugin-cache.js';

import {
  type Loader,
  type LoaderOptions,
  type LoadError,
  type LoadResult,
  emptyLoadResultWithSource,
} from './base.js';
import { LocalLoader } from './local.js';

const execAsync = promisify(exec);

/**
 * Prefixes recognized by this loader
 */
export const GIT_PREFIXES = ['git:', 'github:', 'gitlab:', 'bitbucket:'] as const;
export type GitPrefix = (typeof GIT_PREFIXES)[number];

/**
 * Default cache directory (base directory, plugins go in subdirectory)
 */
export const DEFAULT_GIT_CACHE_DIR = '.ai-tool-sync';

/**
 * Default cache TTL in milliseconds (24 hours)
 */
export const DEFAULT_GIT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Default clone depth for shallow clones
 */
export const DEFAULT_CLONE_DEPTH = 1;

/**
 * Default timeout for git operations (5 minutes)
 */
export const DEFAULT_GIT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Hosting provider configuration
 */
interface HostingProvider {
  name: string;
  httpsTemplate: string;
  sshTemplate: string;
}

/**
 * Known hosting providers
 */
const HOSTING_PROVIDERS = {
  'github.com': {
    name: 'GitHub',
    httpsTemplate: 'https://github.com/{owner}/{repo}.git',
    sshTemplate: 'git@github.com:{owner}/{repo}.git',
  },
  'gitlab.com': {
    name: 'GitLab',
    httpsTemplate: 'https://gitlab.com/{owner}/{repo}.git',
    sshTemplate: 'git@gitlab.com:{owner}/{repo}.git',
  },
  'bitbucket.org': {
    name: 'Bitbucket',
    httpsTemplate: 'https://bitbucket.org/{owner}/{repo}.git',
    sshTemplate: 'git@bitbucket.org:{owner}/{repo}.git',
  },
} as const satisfies Record<string, HostingProvider>;

type KnownHost = keyof typeof HOSTING_PROVIDERS;

function isKnownHost(host: string): host is KnownHost {
  return host in HOSTING_PROVIDERS;
}

function getProvider(host: string): HostingProvider | undefined {
  if (isKnownHost(host)) {
    return HOSTING_PROVIDERS[host];
  }
  return undefined;
}

/**
 * Shorthand prefix to host mapping
 */
const PREFIX_HOST_MAP: Record<string, string> = {
  'github:': 'github.com',
  'gitlab:': 'gitlab.com',
  'bitbucket:': 'bitbucket.org',
};

/**
 * Parsed git source information
 */
export interface ParsedGitSource {
  /** Full clone URL */
  cloneUrl: string;
  /** Hosting provider host (e.g., github.com) */
  host: string;
  /** Repository owner/organization */
  owner: string;
  /** Repository name */
  repo: string;
  /** Branch, tag, or commit reference */
  ref?: string | undefined;
  /** Subpath within the repository */
  subpath?: string | undefined;
  /** Whether to use SSH for cloning */
  useSsh: boolean;
  /** Original source string */
  original: string;
}

/**
 * Cache metadata for a cloned repository
 */
interface GitCacheMetadata {
  /** Original source string */
  source: string;
  /** Clone URL used */
  cloneUrl: string;
  /** Reference (branch/tag/commit) */
  ref?: string | undefined;
  /** Commit SHA at time of clone/fetch */
  commitSha?: string | undefined;
  /** Timestamp of last fetch */
  lastFetched: number;
  /** Version string from repo (if available) */
  version?: string | undefined;
}

/**
 * Options specific to Git loader
 */
export interface GitLoaderOptions extends LoaderOptions {
  /**
   * Cache directory for cloned repos (default: .ai/plugins/)
   */
  cacheDir?: string;

  /**
   * Cache TTL in milliseconds (default: 24 hours)
   * Set to 0 to always fetch latest
   */
  cacheTtl?: number;

  /**
   * Whether to use cached content (default: true)
   */
  useCache?: boolean;

  /**
   * Clone depth for shallow clones (default: 1)
   * Set to 0 for full clone
   */
  depth?: number;

  /**
   * Whether to use SSH for cloning (default: false, use HTTPS)
   */
  useSsh?: boolean;

  /**
   * Git timeout in milliseconds (default: 5 minutes)
   */
  timeout?: number;

  /**
   * Personal access token for private repos (HTTPS)
   */
  token?: string;

  /**
   * Whether to force refresh (ignore cache)
   */
  forceRefresh?: boolean;

  /**
   * Sparse checkout paths - only clone these directories
   */
  sparseCheckoutPaths?: string[];
}

/**
 * Loader for Git repositories
 */
export class GitLoader implements Loader {
  readonly name = 'git';

  private localLoader: LocalLoader;

  constructor() {
    this.localLoader = new LocalLoader();
  }

  /**
   * Check if this loader can handle the given source
   */
  canLoad(source: string): boolean {
    // Check for known prefixes
    for (const prefix of GIT_PREFIXES) {
      if (source.startsWith(prefix)) {
        return true;
      }
    }

    // Check for SSH git URLs
    if (source.startsWith('git@')) {
      return true;
    }

    // Check for .git URLs
    if (source.includes('.git') && (source.includes('://') || source.startsWith('git@'))) {
      return true;
    }

    return false;
  }

  /**
   * Load content from a Git repository
   *
   * @param source - Git source (e.g., github:user/repo#branch)
   * @param options - Loading options
   * @returns LoadResult containing all parsed content
   */
  async load(source: string, options?: GitLoaderOptions): Promise<LoadResult> {
    const result = emptyLoadResultWithSource(source);
    const errors: LoadError[] = [];

    // Parse the source
    const parsed = this.parseSource(source, options?.useSsh);

    if (!parsed) {
      errors.push({
        type: 'file',
        path: source,
        message: 'Invalid Git source format',
      });
      result.errors = errors;
      return result;
    }

    logger.debug(`Loading from Git: ${parsed.cloneUrl}${parsed.ref ? ` @ ${parsed.ref}` : ''}`);

    // Determine cache directory
    const cacheDir = options?.cacheDir ?? DEFAULT_GIT_CACHE_DIR;
    const basePath = options?.basePath ?? process.cwd();
    const fullCacheDir = path.isAbsolute(cacheDir) ? cacheDir : path.resolve(basePath, cacheDir);

    // Get repo cache path
    const repoCachePath = this.getRepoCachePath(fullCacheDir, parsed);

    // Check if we should use cache
    const useCache = options?.useCache !== false;
    const cacheTtl = options?.cacheTtl ?? DEFAULT_GIT_CACHE_TTL_MS;
    const forceRefresh = options?.forceRefresh ?? false;

    let needsFetch = true;

    if (useCache && !forceRefresh) {
      const cacheMetadata = this.getCacheMetadata(repoCachePath);
      if (cacheMetadata && this.isCacheValid(cacheMetadata, cacheTtl)) {
        logger.debug(`Using cached repo: ${repoCachePath}`);
        needsFetch = false;
      }
    }

    // Clone or update the repository
    if (needsFetch) {
      try {
        await this.cloneOrUpdate(parsed, repoCachePath, options);
      } catch (error) {
        errors.push({
          type: 'directory',
          path: source,
          message: `Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`,
        });
        result.errors = errors;
        return result;
      }
    }

    // Determine the path to load from (repo root or subpath)
    let loadPath = repoCachePath;
    if (parsed.subpath) {
      loadPath = path.join(repoCachePath, parsed.subpath);
      if (!fs.existsSync(loadPath)) {
        errors.push({
          type: 'directory',
          path: parsed.subpath,
          message: `Subpath does not exist in repository: ${parsed.subpath}`,
        });
        result.errors = errors;
        return result;
      }
    }

    // Use LocalLoader to load content from the cloned repo
    const localResult = await this.localLoader.load(loadPath, {
      ...options,
      basePath: loadPath,
    });

    // Copy results
    result.rules = localResult.rules;
    result.personas = localResult.personas;
    result.commands = localResult.commands;
    result.hooks = localResult.hooks;

    if (localResult.errors) {
      errors.push(...localResult.errors);
    }

    if (errors.length > 0) {
      result.errors = errors;
    }

    logger.debug(
      `Loaded from Git: ${result.rules.length} rules, ${result.personas.length} personas, ` +
        `${result.commands.length} commands, ${result.hooks.length} hooks`
    );

    return result;
  }

  /**
   * Parse a Git source string into components
   */
  parseSource(source: string, useSsh?: boolean): ParsedGitSource | null {
    // Try shorthand prefixes first (github:, gitlab:, bitbucket:)
    for (const [prefix, host] of Object.entries(PREFIX_HOST_MAP)) {
      if (source.startsWith(prefix)) {
        return this.parseShorthand(source, prefix, host, useSsh);
      }
    }

    // Try git: prefix with host
    if (source.startsWith('git:')) {
      return this.parseGitPrefix(source, useSsh);
    }

    // Try SSH URL
    if (source.startsWith('git@')) {
      return this.parseSshUrl(source);
    }

    // Try HTTPS .git URL
    if (source.includes('://') && source.includes('.git')) {
      return this.parseHttpsUrl(source);
    }

    return null;
  }

  /**
   * Parse shorthand format (github:user/repo)
   */
  private parseShorthand(
    source: string,
    prefix: string,
    host: string,
    useSsh?: boolean
  ): ParsedGitSource | null {
    // Format: github:owner/repo/subpath#ref
    const withoutPrefix = source.slice(prefix.length);
    const splitResult = withoutPrefix.split('#');
    const pathPart = splitResult[0] ?? '';
    const ref = splitResult[1];
    const pathParts = pathPart.split('/');

    if (pathParts.length < 2) {
      return null;
    }

    const owner = pathParts[0] ?? '';
    const repo = pathParts[1] ?? '';
    const subpath = pathParts.length > 2 ? pathParts.slice(2).join('/') : undefined;

    const provider = getProvider(host);
    if (!provider) {
      return null;
    }

    const cloneUrl = useSsh
      ? provider.sshTemplate.replace('{owner}', owner).replace('{repo}', repo)
      : provider.httpsTemplate.replace('{owner}', owner).replace('{repo}', repo);

    return {
      cloneUrl,
      host,
      owner,
      repo,
      ref: ref || undefined,
      subpath,
      useSsh: useSsh ?? false,
      original: source,
    };
  }

  /**
   * Parse git: prefix format
   */
  private parseGitPrefix(source: string, useSsh?: boolean): ParsedGitSource | null {
    // Format: git:github.com/owner/repo/subpath#ref
    // Or: git:https://github.com/owner/repo.git#ref
    const withoutPrefix = source.slice(4); // Remove 'git:'

    // Check if it's a full URL
    if (withoutPrefix.startsWith('https://') || withoutPrefix.startsWith('http://')) {
      return this.parseHttpsUrl(withoutPrefix);
    }

    // Parse host/owner/repo format
    const splitResult = withoutPrefix.split('#');
    const pathPart = splitResult[0] ?? '';
    const ref = splitResult[1];
    const pathParts = pathPart.split('/');

    if (pathParts.length < 3) {
      return null;
    }

    const host = pathParts[0] ?? '';
    const owner = pathParts[1] ?? '';
    const repo = (pathParts[2] ?? '').replace(/\.git$/, '');
    const subpath = pathParts.length > 3 ? pathParts.slice(3).join('/') : undefined;

    const provider = getProvider(host);
    let cloneUrl: string;
    
    if (provider) {
      cloneUrl = useSsh
        ? provider.sshTemplate.replace('{owner}', owner).replace('{repo}', repo)
        : provider.httpsTemplate.replace('{owner}', owner).replace('{repo}', repo);
    } else {
      cloneUrl = useSsh
        ? `git@${host}:${owner}/${repo}.git`
        : `https://${host}/${owner}/${repo}.git`;
    }

    return {
      cloneUrl,
      host,
      owner,
      repo,
      ref: ref || undefined,
      subpath,
      useSsh: useSsh ?? false,
      original: source,
    };
  }

  /**
   * Parse SSH URL format
   */
  private parseSshUrl(source: string): ParsedGitSource | null {
    // Format: git@github.com:owner/repo.git#ref
    const splitResult = source.split('#');
    const urlPart = splitResult[0] ?? '';
    const ref = splitResult[1];
    const match = urlPart.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);

    if (!match) {
      return null;
    }

    const host = match[1] ?? '';
    const owner = match[2] ?? '';
    const repo = match[3] ?? '';

    return {
      cloneUrl: urlPart.endsWith('.git') ? urlPart : `${urlPart}.git`,
      host,
      owner,
      repo: repo.replace(/\.git$/, ''),
      ref: ref || undefined,
      subpath: undefined,
      useSsh: true,
      original: source,
    };
  }

  /**
   * Parse HTTPS URL format
   */
  private parseHttpsUrl(source: string): ParsedGitSource | null {
    // Format: https://github.com/owner/repo.git#ref
    const splitResult = source.split('#');
    const urlPart = splitResult[0] ?? '';
    const ref = splitResult[1];

    try {
      const url = new URL(urlPart);
      const pathParts = url.pathname.split('/').filter(Boolean);

      if (pathParts.length < 2) {
        return null;
      }

      const owner = pathParts[0] ?? '';
      const repo = (pathParts[1] ?? '').replace(/\.git$/, '');
      const subpath = pathParts.length > 2 ? pathParts.slice(2).join('/') : undefined;

      return {
        cloneUrl: urlPart.endsWith('.git') ? urlPart : `${urlPart}.git`,
        host: url.host,
        owner,
        repo,
        ref: ref || undefined,
        subpath,
        useSsh: false,
        original: source,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get the cache path for a repository
   */
  private getRepoCachePath(cacheDir: string, parsed: ParsedGitSource): string {
    // Use centralized plugin ID generation
    const pluginId = generatePluginId(parsed.original, parsed.ref);
    
    // Cache goes in the plugins subdirectory
    return path.join(cacheDir, DEFAULT_PLUGIN_CACHE_DIR, pluginId);
  }

  /**
   * Get cache metadata for a repository
   */
  private getCacheMetadata(repoCachePath: string): GitCacheMetadata | null {
    const metadataPath = path.join(repoCachePath, '.ai-tool-sync-metadata.json');

    try {
      if (fs.existsSync(metadataPath)) {
        const content = fs.readFileSync(metadataPath, 'utf-8');
        return JSON.parse(content) as GitCacheMetadata;
      }
    } catch {
      // Ignore errors reading metadata
    }

    return null;
  }

  /**
   * Save cache metadata for a repository
   */
  private saveCacheMetadata(repoCachePath: string, metadata: GitCacheMetadata): void {
    const metadataPath = path.join(repoCachePath, '.ai-tool-sync-metadata.json');

    try {
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch (error) {
      logger.debug(`Failed to save cache metadata: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(metadata: GitCacheMetadata, ttl: number): boolean {
    if (ttl === 0) {
      return false;
    }

    const age = Date.now() - metadata.lastFetched;
    return age < ttl;
  }

  /**
   * Clone or update a repository
   */
  private async cloneOrUpdate(
    parsed: ParsedGitSource,
    repoCachePath: string,
    options?: GitLoaderOptions
  ): Promise<void> {
    const depth = options?.depth ?? DEFAULT_CLONE_DEPTH;
    const timeout = options?.timeout ?? DEFAULT_GIT_TIMEOUT_MS;

    // Build clone URL with token if provided
    let cloneUrl = parsed.cloneUrl;
    if (options?.token && !parsed.useSsh) {
      const url = new URL(cloneUrl);
      url.username = options.token;
      url.password = 'x-oauth-basic';
      cloneUrl = url.toString();
    }

    // Check if repo already exists
    const gitDir = path.join(repoCachePath, '.git');
    const repoExists = fs.existsSync(gitDir);

    if (repoExists) {
      // Fetch latest
      logger.debug(`Fetching updates for: ${repoCachePath}`);
      await this.fetchRepo(repoCachePath, parsed.ref, timeout);
    } else {
      // Clone fresh
      logger.debug(`Cloning: ${cloneUrl} to ${repoCachePath}`);
      await this.cloneRepo(cloneUrl, repoCachePath, parsed.ref, depth, timeout, options?.sparseCheckoutPaths);
    }

    // Get current commit SHA
    const commitSha = this.getCommitSha(repoCachePath);

    // Save metadata
    this.saveCacheMetadata(repoCachePath, {
      source: parsed.original,
      cloneUrl: parsed.cloneUrl,
      ref: parsed.ref,
      commitSha,
      lastFetched: Date.now(),
    });
  }

  /**
   * Clone a repository
   */
  private async cloneRepo(
    cloneUrl: string,
    targetPath: string,
    ref?: string,
    depth?: number,
    timeout?: number,
    sparseCheckoutPaths?: string[]
  ): Promise<void> {
    // Create parent directory
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    // Build clone command
    const args = ['clone'];

    // Add depth for shallow clone
    if (depth && depth > 0) {
      args.push('--depth', String(depth));
    }

    // Add branch/tag if specified
    if (ref) {
      args.push('--branch', ref);
    }

    // Add single-branch for efficiency
    if (ref || (depth && depth > 0)) {
      args.push('--single-branch');
    }

    // Setup sparse checkout if paths specified
    if (sparseCheckoutPaths && sparseCheckoutPaths.length > 0) {
      args.push('--sparse', '--filter=blob:none');
    }

    args.push(cloneUrl, targetPath);

    const command = `git ${args.join(' ')}`;
    logger.debug(`Running: ${command.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`); // Hide token in logs

    try {
      await execAsync(command, {
        timeout,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0', // Disable interactive prompts
        },
      });

      // Setup sparse checkout paths if specified
      if (sparseCheckoutPaths && sparseCheckoutPaths.length > 0) {
        await this.setupSparseCheckout(targetPath, sparseCheckoutPaths, timeout);
      }
    } catch (error) {
      // Clean up on failure
      try {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Fetch updates for an existing repository
   */
  private async fetchRepo(repoPath: string, ref?: string, timeout?: number): Promise<void> {
    try {
      // Fetch latest
      await execAsync('git fetch --depth 1', {
        cwd: repoPath,
        timeout,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
      });

      // Checkout/reset to the ref
      if (ref) {
        await execAsync(`git checkout ${ref}`, {
          cwd: repoPath,
          timeout,
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0',
          },
        });
      }

      // Reset to origin
      await execAsync('git reset --hard FETCH_HEAD', {
        cwd: repoPath,
        timeout,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
      });
    } catch (error) {
      logger.debug(`Failed to fetch, will try re-cloning: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Setup sparse checkout for specific paths
   */
  private async setupSparseCheckout(
    repoPath: string,
    paths: string[],
    timeout?: number
  ): Promise<void> {
    // Initialize sparse-checkout
    await execAsync('git sparse-checkout init --cone', {
      cwd: repoPath,
      timeout,
    });

    // Set the paths
    const pathsArg = paths.join(' ');
    await execAsync(`git sparse-checkout set ${pathsArg}`, {
      cwd: repoPath,
      timeout,
    });
  }

  /**
   * Get the current commit SHA of a repository
   */
  private getCommitSha(repoPath: string): string | undefined {
    try {
      const result = execSync('git rev-parse HEAD', {
        cwd: repoPath,
        encoding: 'utf-8',
      });
      return result.trim();
    } catch {
      return undefined;
    }
  }
}

/**
 * Create a GitLoader instance
 */
export function createGitLoader(): GitLoader {
  return new GitLoader();
}

/**
 * Check if git is available
 */
export function isGitAvailable(): boolean {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a git source string (exported for testing)
 */
export function parseGitSource(source: string, useSsh?: boolean): ParsedGitSource | null {
  const loader = new GitLoader();
  return loader.parseSource(source, useSsh);
}

/**
 * Clear the git cache for a specific repo or all repos
 */
export function clearGitCache(cacheDir: string, source?: string): void {
  const gitCacheDir = path.join(cacheDir, 'git');

  if (!fs.existsSync(gitCacheDir)) {
    return;
  }

  if (source) {
    // Clear specific repo
    const loader = new GitLoader();
    const parsed = loader.parseSource(source);
    if (parsed) {
      const repoId = `${parsed.host}_${parsed.owner}_${parsed.repo}`;
      const entries = fs.readdirSync(gitCacheDir);
      for (const entry of entries) {
        if (entry.startsWith(repoId)) {
          const entryPath = path.join(gitCacheDir, entry);
          fs.rmSync(entryPath, { recursive: true, force: true });
        }
      }
    }
  } else {
    // Clear all
    fs.rmSync(gitCacheDir, { recursive: true, force: true });
  }
}

/**
 * List cached repositories
 */
export function listCachedRepos(cacheDir: string): GitCacheMetadata[] {
  const gitCacheDir = path.join(cacheDir, 'git');

  if (!fs.existsSync(gitCacheDir)) {
    return [];
  }

  const result: GitCacheMetadata[] = [];
  const entries = fs.readdirSync(gitCacheDir);

  for (const entry of entries) {
    const entryPath = path.join(gitCacheDir, entry);
    const metadataPath = path.join(entryPath, '.ai-tool-sync-metadata.json');

    try {
      if (fs.existsSync(metadataPath)) {
        const content = fs.readFileSync(metadataPath, 'utf-8');
        result.push(JSON.parse(content) as GitCacheMetadata);
      }
    } catch {
      // Ignore errors
    }
  }

  return result;
}

