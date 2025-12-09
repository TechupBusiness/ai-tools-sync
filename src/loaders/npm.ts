/**
 * @file npm Loader
 * @description Load content from npm packages
 *
 * Resolves npm packages to their installed location and loads
 * rules, personas, commands, and hooks from them.
 *
 * Supports:
 * - Regular packages: ai-rules-typescript
 * - Scoped packages: @company/ai-rules-react
 * - Version constraints: npm:@company/pkg@^1.0.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { logger } from '../utils/logger.js';

import {
  type Loader,
  type LoaderOptions,
  type LoadError,
  type LoadResult,
  emptyLoadResultWithSource,
} from './base.js';
import { LocalLoader } from './local.js';

/**
 * npm package prefix
 */
export const NPM_PREFIX = 'npm:';

/**
 * Result of resolving an npm package
 */
export interface NpmPackageInfo {
  /** Package name (without version) */
  name: string;
  /** Resolved version (from package.json) */
  version: string;
  /** Path to the package directory */
  path: string;
  /** Package.json contents */
  packageJson: NpmPackageJson;
}

/**
 * Minimal package.json structure we care about
 */
export interface NpmPackageJson {
  name: string;
  version: string;
  /** Path to ai content directory (defaults to 'defaults' or 'ai-content') */
  aiContentPath?: string;
  /** Alternative: direct paths for each content type */
  aiToolSync?: {
    rules?: string;
    personas?: string;
    commands?: string;
    hooks?: string;
  };
}

/**
 * Options specific to npm loader
 */
export interface NpmLoaderOptions extends LoaderOptions {
  /**
   * Search paths for node_modules (default: starts from basePath)
   */
  nodeModulesPaths?: string[];

  /**
   * Cache resolved package paths (default: true)
   */
  useCache?: boolean;
}

/**
 * Cache for resolved package paths
 */
const packagePathCache = new Map<string, string>();

/**
 * Loader for npm packages
 */
export class NpmLoader implements Loader {
  readonly name = 'npm';

  private localLoader: LocalLoader;

  constructor() {
    this.localLoader = new LocalLoader();
  }

  /**
   * Check if this loader can handle the given source
   * npm loader handles:
   * - Sources starting with 'npm:'
   * - Scoped packages in npm format (@org/pkg)
   */
  canLoad(source: string): boolean {
    // Explicit npm: prefix
    if (source.startsWith(NPM_PREFIX)) {
      return true;
    }

    // Scoped packages without prefix (auto-detect)
    if (source.startsWith('@') && source.includes('/')) {
      // Check it's not a file path
      if (!source.startsWith('@/') && !source.includes('://')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Load content from an npm package
   *
   * @param source - npm package identifier (npm:package-name or npm:@scope/package@version)
   * @param options - Loading options
   * @returns LoadResult containing all parsed content
   */
  async load(source: string, options?: NpmLoaderOptions): Promise<LoadResult> {
    const result = emptyLoadResultWithSource(source);
    const errors: LoadError[] = [];

    // Parse the package specifier
    const { packageName, versionSpec } = this.parsePackageSpecifier(source);

    logger.debug(`Loading npm package: ${packageName}${versionSpec ? `@${versionSpec}` : ''}`);

    // Resolve the package path
    const packageInfo = await this.resolvePackage(packageName, options);

    if (!packageInfo) {
      errors.push({
        type: 'directory',
        path: source,
        message: `Could not resolve npm package: ${packageName}. Make sure it is installed.`,
      });
      result.errors = errors;
      return result;
    }

    // Validate version if specified
    if (versionSpec && !this.versionSatisfies(packageInfo.version, versionSpec)) {
      errors.push({
        type: 'directory',
        path: source,
        message: `Package ${packageName} version ${packageInfo.version} does not satisfy ${versionSpec}`,
      });
      result.errors = errors;
      return result;
    }

    logger.debug(`Resolved ${packageName}@${packageInfo.version} to ${packageInfo.path}`);

    // Determine content directory
    const contentPath = this.getContentPath(packageInfo);

    if (!contentPath) {
      errors.push({
        type: 'directory',
        path: packageInfo.path,
        message: `Package ${packageName} does not contain ai-tool-sync content. Expected 'defaults/', 'ai-content/', or 'aiContentPath' in package.json.`,
      });
      result.errors = errors;
      return result;
    }

    // Load content using LocalLoader
    // Create options without basePath (contentPath is already absolute)
    // Only include defined properties to satisfy exactOptionalPropertyTypes
    const loaderOptions: LoaderOptions = {};

    if (options?.targets) loaderOptions.targets = options.targets;
    if (options?.include) loaderOptions.include = options.include;
    if (options?.exclude) loaderOptions.exclude = options.exclude;
    if (options?.continueOnError !== undefined)
      loaderOptions.continueOnError = options.continueOnError;

    // Add custom directories if defined
    const customDirs = this.getDirectories(packageInfo);
    if (customDirs) {
      loaderOptions.directories = customDirs;
    }

    const loadResult = await this.localLoader.load(contentPath, loaderOptions);

    // Copy results
    result.rules = loadResult.rules;
    result.personas = loadResult.personas;
    result.commands = loadResult.commands;
    result.hooks = loadResult.hooks;

    // Merge errors
    if (loadResult.errors) {
      errors.push(...loadResult.errors);
    }

    if (errors.length > 0) {
      result.errors = errors;
    }

    return result;
  }

  /**
   * Parse npm package specifier
   * Formats:
   * - npm:package-name
   * - npm:@scope/package-name
   * - npm:package-name@^1.0.0
   * - npm:@scope/package-name@~2.0.0
   */
  private parsePackageSpecifier(source: string): {
    packageName: string;
    versionSpec: string | undefined;
  } {
    // Remove npm: prefix if present
    const spec = source.startsWith(NPM_PREFIX) ? source.slice(NPM_PREFIX.length) : source;

    // Handle scoped packages (@scope/name@version)
    if (spec.startsWith('@')) {
      // Find the second @ which separates version
      const firstSlash = spec.indexOf('/');
      if (firstSlash === -1) {
        return { packageName: spec, versionSpec: undefined };
      }

      const afterSlash = spec.slice(firstSlash + 1);
      const versionAt = afterSlash.indexOf('@');

      if (versionAt === -1) {
        return { packageName: spec, versionSpec: undefined };
      }

      return {
        packageName: spec.slice(0, firstSlash + 1 + versionAt),
        versionSpec: afterSlash.slice(versionAt + 1),
      };
    }

    // Handle unscoped packages (name@version)
    const atIndex = spec.indexOf('@');
    if (atIndex === -1) {
      return { packageName: spec, versionSpec: undefined };
    }

    return {
      packageName: spec.slice(0, atIndex),
      versionSpec: spec.slice(atIndex + 1),
    };
  }

  /**
   * Resolve npm package to its installed path
   */
  private async resolvePackage(
    packageName: string,
    options?: NpmLoaderOptions
  ): Promise<NpmPackageInfo | null> {
    // Check cache first
    const cacheKey = packageName;
    if (options?.useCache !== false && packagePathCache.has(cacheKey)) {
      const cachedPath = packagePathCache.get(cacheKey)!;
      return this.loadPackageInfo(cachedPath);
    }

    // Get search paths
    const searchPaths = this.getNodeModulesPaths(options);

    for (const searchPath of searchPaths) {
      const packagePath = path.join(searchPath, packageName);

      try {
        const packageJsonPath = path.join(packagePath, 'package.json');
        await fs.promises.access(packageJsonPath, fs.constants.R_OK);

        // Package found, cache it
        if (options?.useCache !== false) {
          packagePathCache.set(cacheKey, packagePath);
        }

        return this.loadPackageInfo(packagePath);
      } catch {
        // Package not found in this path, continue searching
        continue;
      }
    }

    return null;
  }

  /**
   * Load package.json and create package info
   */
  private async loadPackageInfo(packagePath: string): Promise<NpmPackageInfo | null> {
    try {
      const packageJsonPath = path.join(packagePath, 'package.json');
      const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content) as NpmPackageJson;

      return {
        name: packageJson.name,
        version: packageJson.version,
        path: packagePath,
        packageJson,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get node_modules search paths
   * Follows Node.js module resolution algorithm
   */
  private getNodeModulesPaths(options?: NpmLoaderOptions): string[] {
    // Use custom paths if provided
    if (options?.nodeModulesPaths && options.nodeModulesPaths.length > 0) {
      return options.nodeModulesPaths;
    }

    // Start from basePath or cwd
    const startPath = options?.basePath ?? process.cwd();
    const paths: string[] = [];

    // Walk up the directory tree looking for node_modules
    let current = path.resolve(startPath);
    const root = path.parse(current).root;

    while (current !== root) {
      paths.push(path.join(current, 'node_modules'));
      current = path.dirname(current);
    }

    // Add global node_modules locations
    const globalPaths = this.getGlobalNodeModulesPaths();
    paths.push(...globalPaths);

    return paths;
  }

  /**
   * Get global node_modules paths
   */
  private getGlobalNodeModulesPaths(): string[] {
    const paths: string[] = [];

    // npm global prefix
    const npmPrefix = process.env.npm_config_prefix;
    if (npmPrefix) {
      paths.push(path.join(npmPrefix, 'lib', 'node_modules'));
    }

    // Common global locations
    if (process.platform === 'win32') {
      const appData = process.env.APPDATA;
      if (appData) {
        paths.push(path.join(appData, 'npm', 'node_modules'));
      }
    } else {
      paths.push('/usr/local/lib/node_modules');
      paths.push('/usr/lib/node_modules');

      // Home directory
      const home = process.env.HOME;
      if (home) {
        paths.push(path.join(home, '.npm-global', 'lib', 'node_modules'));
        paths.push(path.join(home, 'node_modules'));
      }
    }

    return paths;
  }

  /**
   * Get the content directory path for a package
   */
  private getContentPath(packageInfo: NpmPackageInfo): string | null {
    const { path: packagePath, packageJson } = packageInfo;

    // Check for explicit aiContentPath in package.json
    if (packageJson.aiContentPath) {
      const customPath = path.join(packagePath, packageJson.aiContentPath);
      if (this.directoryExists(customPath)) {
        return customPath;
      }
    }

    // Check for aiToolSync configuration
    if (packageJson.aiToolSync) {
      // If aiToolSync is defined, the content is in the package root
      // The directories will be handled by getDirectories()
      return packagePath;
    }

    // Try common default directories
    const defaultDirs = ['defaults', 'ai-content', 'content', '.ai'];

    for (const dir of defaultDirs) {
      const dirPath = path.join(packagePath, dir);
      if (this.directoryExists(dirPath)) {
        return dirPath;
      }
    }

    // Check if package root has rules/personas/etc directories directly
    const contentDirs = ['rules', 'personas', 'commands', 'hooks'];
    for (const dir of contentDirs) {
      const dirPath = path.join(packagePath, dir);
      if (this.directoryExists(dirPath)) {
        // Content is in package root
        return packagePath;
      }
    }

    return null;
  }

  /**
   * Get custom directory names from package.json
   */
  private getDirectories(packageInfo: NpmPackageInfo): LoaderOptions['directories'] | undefined {
    const aiToolSync = packageInfo.packageJson.aiToolSync;
    if (!aiToolSync) {
      return undefined;
    }

    // Only include defined directory overrides
    const directories: LoaderOptions['directories'] = {};
    if (aiToolSync.rules) directories.rules = aiToolSync.rules;
    if (aiToolSync.personas) directories.personas = aiToolSync.personas;
    if (aiToolSync.commands) directories.commands = aiToolSync.commands;
    if (aiToolSync.hooks) directories.hooks = aiToolSync.hooks;

    return Object.keys(directories).length > 0 ? directories : undefined;
  }

  /**
   * Check if directory exists (sync for simplicity)
   */
  private directoryExists(dirPath: string): boolean {
    try {
      const stat = fs.statSync(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if installed version satisfies version spec
   * Supports: exact, ^, ~, >=, >, <=, <, x ranges
   */
  private versionSatisfies(installed: string, spec: string): boolean {
    // For now, implement basic version checking
    // In a production environment, use semver package

    // Clean versions
    const cleanInstalled = this.cleanVersion(installed);
    const cleanSpec = spec.trim();

    // Exact match
    if (!cleanSpec.match(/^[\^~<>=]/)) {
      return cleanInstalled === this.cleanVersion(cleanSpec);
    }

    // Parse version parts
    const installedParts = this.parseVersion(cleanInstalled);
    if (!installedParts) return false;

    // Handle different specifiers
    if (cleanSpec.startsWith('^')) {
      // Compatible with version (major must match)
      const specParts = this.parseVersion(cleanSpec.slice(1));
      if (!specParts) return false;

      if (installedParts.major !== specParts.major) return false;
      if (installedParts.major === 0) {
        // For 0.x, minor must match
        if (installedParts.minor !== specParts.minor) return false;
        return installedParts.patch >= specParts.patch;
      }
      return this.compareVersions(installedParts, specParts) >= 0;
    }

    if (cleanSpec.startsWith('~')) {
      // Approximately equivalent (major.minor must match)
      const specParts = this.parseVersion(cleanSpec.slice(1));
      if (!specParts) return false;

      return (
        installedParts.major === specParts.major &&
        installedParts.minor === specParts.minor &&
        installedParts.patch >= specParts.patch
      );
    }

    if (cleanSpec.startsWith('>=')) {
      const specParts = this.parseVersion(cleanSpec.slice(2));
      if (!specParts) return false;
      return this.compareVersions(installedParts, specParts) >= 0;
    }

    if (cleanSpec.startsWith('>')) {
      const specParts = this.parseVersion(cleanSpec.slice(1));
      if (!specParts) return false;
      return this.compareVersions(installedParts, specParts) > 0;
    }

    if (cleanSpec.startsWith('<=')) {
      const specParts = this.parseVersion(cleanSpec.slice(2));
      if (!specParts) return false;
      return this.compareVersions(installedParts, specParts) <= 0;
    }

    if (cleanSpec.startsWith('<')) {
      const specParts = this.parseVersion(cleanSpec.slice(1));
      if (!specParts) return false;
      return this.compareVersions(installedParts, specParts) < 0;
    }

    // Unknown spec format, be permissive
    logger.debug(`Unknown version spec format: ${cleanSpec}, allowing`);
    return true;
  }

  /**
   * Clean version string (remove v prefix, etc)
   */
  private cleanVersion(version: string): string {
    return version.replace(/^v/, '').trim();
  }

  /**
   * Parse version into parts
   */
  private parseVersion(version: string): { major: number; minor: number; patch: number } | null {
    const cleaned = this.cleanVersion(version);
    const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match || !match[1] || !match[2] || !match[3]) return null;

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
    };
  }

  /**
   * Compare two versions
   * Returns: -1 if a < b, 0 if a == b, 1 if a > b
   */
  private compareVersions(
    a: { major: number; minor: number; patch: number },
    b: { major: number; minor: number; patch: number }
  ): number {
    if (a.major !== b.major) return a.major < b.major ? -1 : 1;
    if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
    if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
    return 0;
  }
}

/**
 * Create an NpmLoader instance
 */
export function createNpmLoader(): NpmLoader {
  return new NpmLoader();
}

/**
 * Clear the package path cache
 */
export function clearNpmCache(): void {
  packagePathCache.clear();
}

/**
 * Get cached package paths (for testing/debugging)
 */
export function getNpmCacheEntries(): Map<string, string> {
  return new Map(packagePathCache);
}
