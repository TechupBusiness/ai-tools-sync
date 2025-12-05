/**
 * @file pip Loader
 * @description Load content from Python pip packages
 *
 * Resolves pip packages to their installed location and loads
 * rules, personas, commands, and hooks from them.
 *
 * Supports:
 * - Regular packages: ai-rules-django
 * - Namespaced packages: company.ai_rules
 * - Version constraints: pip:package>=1.0.0
 * - Virtual environments (auto-detected)
 */

import { execSync } from 'node:child_process';
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
 * pip package prefix
 */
export const PIP_PREFIX = 'pip:';

/**
 * Result of resolving a pip package
 */
export interface PipPackageInfo {
  /** Package name (without version) */
  name: string;
  /** Resolved version (from metadata) */
  version: string;
  /** Path to the package directory */
  path: string;
  /** Package metadata */
  metadata: PipPackageMetadata;
}

/**
 * Metadata structure we care about (from pyproject.toml or setup.py/cfg)
 */
export interface PipPackageMetadata {
  name: string;
  version: string;
  /** Path to ai content directory (defaults to 'defaults' or 'ai_content') */
  aiContentPath?: string | undefined;
  /** Alternative: direct paths for each content type */
  aiToolSync?: {
    rules?: string;
    personas?: string;
    commands?: string;
    hooks?: string;
  } | undefined;
}

/**
 * Options specific to pip loader
 */
export interface PipLoaderOptions extends LoaderOptions {
  /**
   * Search paths for site-packages (default: auto-detected)
   */
  sitePackagesPaths?: string[];

  /**
   * Path to Python executable (for resolving virtual env)
   */
  pythonPath?: string;

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
 * Loader for pip packages
 */
export class PipLoader implements Loader {
  readonly name = 'pip';

  private localLoader: LocalLoader;

  constructor() {
    this.localLoader = new LocalLoader();
  }

  /**
   * Check if this loader can handle the given source
   * pip loader handles:
   * - Sources starting with 'pip:'
   */
  canLoad(source: string): boolean {
    return source.startsWith(PIP_PREFIX);
  }

  /**
   * Load content from a pip package
   *
   * @param source - pip package identifier (pip:package-name or pip:package>=version)
   * @param options - Loading options
   * @returns LoadResult containing all parsed content
   */
  async load(source: string, options?: PipLoaderOptions): Promise<LoadResult> {
    const result = emptyLoadResultWithSource(source);
    const errors: LoadError[] = [];

    // Parse the package specifier
    const { packageName, versionSpec } = this.parsePackageSpecifier(source);

    logger.debug(`Loading pip package: ${packageName}${versionSpec ? versionSpec : ''}`);

    // Resolve the package path
    const packageInfo = await this.resolvePackage(packageName, options);

    if (!packageInfo) {
      errors.push({
        type: 'directory',
        path: source,
        message: `Could not resolve pip package: ${packageName}. Make sure it is installed.`,
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
        message: `Package ${packageName} does not contain ai-tool-sync content. Expected 'defaults/', 'ai_content/', or 'ai_content_path' in pyproject.toml.`,
      });
      result.errors = errors;
      return result;
    }

    // Load content using LocalLoader
    const loaderOptions: LoaderOptions = {};

    if (options?.targets) loaderOptions.targets = options.targets;
    if (options?.include) loaderOptions.include = options.include;
    if (options?.exclude) loaderOptions.exclude = options.exclude;
    if (options?.continueOnError !== undefined) loaderOptions.continueOnError = options.continueOnError;

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
   * Parse pip package specifier
   * Formats:
   * - pip:package-name
   * - pip:package_name
   * - pip:package>=1.0.0
   * - pip:package~=1.0.0
   * - pip:package==1.0.0
   */
  private parsePackageSpecifier(source: string): {
    packageName: string;
    versionSpec: string | undefined;
  } {
    // Remove pip: prefix
    const spec = source.slice(PIP_PREFIX.length);

    // Find version specifier (>=, <=, ==, ~=, !=, <, >)
    const versionMatch = spec.match(/^([a-zA-Z0-9_.-]+)((?:>=|<=|==|~=|!=|<|>).+)?$/);

    if (!versionMatch) {
      return { packageName: spec, versionSpec: undefined };
    }

    return {
      packageName: versionMatch[1] ?? spec,
      versionSpec: versionMatch[2],
    };
  }

  /**
   * Resolve pip package to its installed path
   */
  private async resolvePackage(
    packageName: string,
    options?: PipLoaderOptions
  ): Promise<PipPackageInfo | null> {
    // Normalize package name (pip uses underscores internally)
    const normalizedName = this.normalizePackageName(packageName);

    // Check cache first
    const cacheKey = normalizedName;
    if (options?.useCache !== false && packagePathCache.has(cacheKey)) {
      const cachedPath = packagePathCache.get(cacheKey)!;
      return this.loadPackageInfo(cachedPath, normalizedName);
    }

    // Get search paths
    const searchPaths = this.getSitePackagesPaths(options);

    for (const searchPath of searchPaths) {
      // Try different package directory naming conventions
      const possiblePaths = [
        path.join(searchPath, normalizedName),
        path.join(searchPath, packageName.replace(/-/g, '_')),
        path.join(searchPath, packageName),
      ];

      for (const packagePath of possiblePaths) {
        try {
          await fs.promises.access(packagePath, fs.constants.R_OK);

          // Verify it's a directory
          const stat = await fs.promises.stat(packagePath);
          if (!stat.isDirectory()) continue;

          // Package found, cache it
          if (options?.useCache !== false) {
            packagePathCache.set(cacheKey, packagePath);
          }

          return this.loadPackageInfo(packagePath, normalizedName);
        } catch {
          // Package not found in this path, continue searching
          continue;
        }
      }

      // Also check for dist-info metadata to find the package
      const distInfoPath = await this.findDistInfo(searchPath, normalizedName);
      if (distInfoPath) {
        const packagePath = await this.getPackagePathFromDistInfo(searchPath, distInfoPath, normalizedName);
        if (packagePath) {
          if (options?.useCache !== false) {
            packagePathCache.set(cacheKey, packagePath);
          }
          return this.loadPackageInfo(packagePath, normalizedName);
        }
      }
    }

    return null;
  }

  /**
   * Find the dist-info directory for a package
   */
  private async findDistInfo(sitePackagesPath: string, packageName: string): Promise<string | null> {
    try {
      const entries = await fs.promises.readdir(sitePackagesPath);
      const normalizedName = packageName.toLowerCase().replace(/[-_.]+/g, '_');

      for (const entry of entries) {
        if (entry.endsWith('.dist-info')) {
          const distInfoName = entry.slice(0, -10).toLowerCase().replace(/[-_.]+/g, '_');
          // Remove version from dist-info name
          const nameWithoutVersion = distInfoName.replace(/-[\d.]+$/, '');
          if (nameWithoutVersion === normalizedName) {
            return path.join(sitePackagesPath, entry);
          }
        }
      }
    } catch {
      // Directory not readable
    }
    return null;
  }

  /**
   * Get package path from dist-info RECORD file
   */
  private async getPackagePathFromDistInfo(
    sitePackagesPath: string,
    distInfoPath: string,
    packageName: string
  ): Promise<string | null> {
    try {
      const recordPath = path.join(distInfoPath, 'RECORD');
      const content = await fs.promises.readFile(recordPath, 'utf-8');
      
      // Parse RECORD file to find package directory
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.includes('/__init__.py') || line.match(/^[^/]+\/__init__\.py/)) {
          const packageDir = line.split('/')[0];
          if (packageDir) {
            const fullPath = path.join(sitePackagesPath, packageDir);
            try {
              await fs.promises.access(fullPath, fs.constants.R_OK);
              return fullPath;
            } catch {
              // Not accessible
            }
          }
        }
      }

      // Fallback: try the normalized package name
      const normalizedPath = path.join(sitePackagesPath, packageName.replace(/-/g, '_'));
      try {
        await fs.promises.access(normalizedPath, fs.constants.R_OK);
        return normalizedPath;
      } catch {
        // Not found
      }
    } catch {
      // RECORD file not readable
    }
    return null;
  }

  /**
   * Load package metadata and create package info
   */
  private async loadPackageInfo(packagePath: string, packageName: string): Promise<PipPackageInfo | null> {
    try {
      const metadata = await this.loadPackageMetadata(packagePath, packageName);

      return {
        name: metadata.name,
        version: metadata.version,
        path: packagePath,
        metadata,
      };
    } catch {
      return null;
    }
  }

  /**
   * Load package metadata from various sources
   */
  private async loadPackageMetadata(packagePath: string, packageName: string): Promise<PipPackageMetadata> {
    // Try pyproject.toml first
    const pyprojectPath = path.join(packagePath, 'pyproject.toml');
    try {
      const content = await fs.promises.readFile(pyprojectPath, 'utf-8');
      const metadata = this.parsePyprojectToml(content);
      if (metadata) return metadata;
    } catch {
      // pyproject.toml not found or not readable
    }

    // Try to find metadata in dist-info
    const sitePackages = path.dirname(packagePath);
    const distInfoPath = await this.findDistInfo(sitePackages, packageName);
    if (distInfoPath) {
      const metadata = await this.loadDistInfoMetadata(distInfoPath);
      if (metadata) return metadata;
    }

    // Try ai_tool_sync.json (custom metadata file)
    const aiToolSyncPath = path.join(packagePath, 'ai_tool_sync.json');
    try {
      const content = await fs.promises.readFile(aiToolSyncPath, 'utf-8');
      const data = JSON.parse(content) as PipPackageMetadata;
      return {
        name: data.name ?? packageName,
        version: data.version ?? '0.0.0',
        aiContentPath: data.aiContentPath,
        aiToolSync: data.aiToolSync,
      };
    } catch {
      // ai_tool_sync.json not found
    }

    // Fallback: create minimal metadata
    return {
      name: packageName,
      version: '0.0.0',
    };
  }

  /**
   * Parse pyproject.toml for metadata
   */
  private parsePyprojectToml(content: string): PipPackageMetadata | null {
    try {
      // Simple TOML parsing for the fields we need
      // Note: In production, consider using a proper TOML parser

      let name = '';
      let version = '0.0.0';
      let aiContentPath: string | undefined;
      const aiToolSync: PipPackageMetadata['aiToolSync'] = {};

      // Extract [project] section
      const projectMatch = content.match(/\[project\]([\s\S]*?)(?=\n\[|$)/);
      if (projectMatch) {
        const projectSection = projectMatch[1] ?? '';

        const nameMatch = projectSection.match(/name\s*=\s*["']([^"']+)["']/);
        if (nameMatch?.[1]) name = nameMatch[1];

        const versionMatch = projectSection.match(/version\s*=\s*["']([^"']+)["']/);
        if (versionMatch?.[1]) version = versionMatch[1];
      }

      // Extract [tool.ai-tool-sync] section
      const aiToolSyncMatch = content.match(/\[tool\.ai-tool-sync\]([\s\S]*?)(?=\n\[|$)/);
      if (aiToolSyncMatch) {
        const aiSection = aiToolSyncMatch[1] ?? '';

        const contentPathMatch = aiSection.match(/content_path\s*=\s*["']([^"']+)["']/);
        if (contentPathMatch?.[1]) aiContentPath = contentPathMatch[1];

        const rulesMatch = aiSection.match(/rules\s*=\s*["']([^"']+)["']/);
        if (rulesMatch?.[1]) aiToolSync.rules = rulesMatch[1];

        const personasMatch = aiSection.match(/personas\s*=\s*["']([^"']+)["']/);
        if (personasMatch?.[1]) aiToolSync.personas = personasMatch[1];

        const commandsMatch = aiSection.match(/commands\s*=\s*["']([^"']+)["']/);
        if (commandsMatch?.[1]) aiToolSync.commands = commandsMatch[1];

        const hooksMatch = aiSection.match(/hooks\s*=\s*["']([^"']+)["']/);
        if (hooksMatch?.[1]) aiToolSync.hooks = hooksMatch[1];
      }

      if (!name) return null;

      return {
        name,
        version,
        aiContentPath,
        aiToolSync: Object.keys(aiToolSync).length > 0 ? aiToolSync : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Load metadata from dist-info METADATA file
   */
  private async loadDistInfoMetadata(distInfoPath: string): Promise<PipPackageMetadata | null> {
    try {
      const metadataPath = path.join(distInfoPath, 'METADATA');
      const content = await fs.promises.readFile(metadataPath, 'utf-8');

      let name = '';
      let version = '0.0.0';

      // Parse email-style headers
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.startsWith('Name: ')) {
          name = line.slice(6).trim();
        } else if (line.startsWith('Version: ')) {
          version = line.slice(9).trim();
        }
        // Stop at first blank line (end of headers)
        if (line.trim() === '' && name && version !== '0.0.0') {
          break;
        }
      }

      if (!name) return null;

      return { name, version };
    } catch {
      return null;
    }
  }

  /**
   * Normalize package name (pip convention: lowercase, hyphens to underscores)
   */
  private normalizePackageName(name: string): string {
    return name.toLowerCase().replace(/-/g, '_');
  }

  /**
   * Get site-packages search paths
   */
  private getSitePackagesPaths(options?: PipLoaderOptions): string[] {
    // Use custom paths if provided
    if (options?.sitePackagesPaths && options.sitePackagesPaths.length > 0) {
      return options.sitePackagesPaths;
    }

    const paths: string[] = [];

    // Try to detect virtual environment
    const venvPath = this.detectVirtualEnv();
    if (venvPath) {
      paths.push(...this.getVenvSitePackages(venvPath));
    }

    // Try to get paths from Python
    const pythonPath = options?.pythonPath ?? this.findPython();
    if (pythonPath) {
      const pythonPaths = this.getPythonSitePackages(pythonPath);
      paths.push(...pythonPaths);
    }

    // Add common system locations as fallback
    paths.push(...this.getSystemSitePackages());

    // Remove duplicates
    return [...new Set(paths)];
  }

  /**
   * Detect active virtual environment
   */
  private detectVirtualEnv(): string | null {
    // Check VIRTUAL_ENV environment variable
    if (process.env.VIRTUAL_ENV) {
      return process.env.VIRTUAL_ENV;
    }

    // Check CONDA_PREFIX for conda environments
    if (process.env.CONDA_PREFIX) {
      return process.env.CONDA_PREFIX;
    }

    // Check for .venv in current directory
    const cwd = process.cwd();
    const possibleVenvs = ['.venv', 'venv', '.env', 'env'];

    for (const venvDir of possibleVenvs) {
      const venvPath = path.join(cwd, venvDir);
      if (this.directoryExists(venvPath) && this.isVirtualEnv(venvPath)) {
        return venvPath;
      }
    }

    return null;
  }

  /**
   * Check if a directory is a virtual environment
   */
  private isVirtualEnv(dirPath: string): boolean {
    // Check for pyvenv.cfg (modern venvs)
    if (this.fileExists(path.join(dirPath, 'pyvenv.cfg'))) {
      return true;
    }

    // Check for bin/python or Scripts/python.exe
    const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
    const pythonExe = process.platform === 'win32' ? 'python.exe' : 'python';

    return this.fileExists(path.join(dirPath, binDir, pythonExe));
  }

  /**
   * Get site-packages paths for a virtual environment
   */
  private getVenvSitePackages(venvPath: string): string[] {
    const paths: string[] = [];

    if (process.platform === 'win32') {
      paths.push(path.join(venvPath, 'Lib', 'site-packages'));
    } else {
      // Find Python version directory
      const libPath = path.join(venvPath, 'lib');
      try {
        const entries = fs.readdirSync(libPath);
        for (const entry of entries) {
          if (entry.startsWith('python')) {
            paths.push(path.join(libPath, entry, 'site-packages'));
          }
        }
      } catch {
        // lib directory not readable
      }
    }

    return paths.filter((p) => this.directoryExists(p));
  }

  /**
   * Find Python executable
   */
  private findPython(): string | null {
    const pythonNames = process.platform === 'win32'
      ? ['python.exe', 'python3.exe']
      : ['python3', 'python'];

    for (const pythonName of pythonNames) {
      try {
        // Check if python is in PATH
        execSync(`${pythonName} --version`, { stdio: 'pipe' });
        return pythonName;
      } catch {
        // Python not found with this name
      }
    }

    return null;
  }

  /**
   * Get site-packages paths using Python
   */
  private getPythonSitePackages(pythonPath: string): string[] {
    try {
      const output = execSync(
        `${pythonPath} -c "import site; print('\\n'.join(site.getsitepackages()))"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );

      return output
        .split('\n')
        .map((p) => p.trim())
        .filter((p) => p.length > 0 && this.directoryExists(p));
    } catch {
      return [];
    }
  }

  /**
   * Get common system site-packages locations
   */
  private getSystemSitePackages(): string[] {
    const paths: string[] = [];

    if (process.platform === 'win32') {
      const pythonRoot = process.env.LOCALAPPDATA;
      if (pythonRoot) {
        paths.push(path.join(pythonRoot, 'Programs', 'Python', 'Python311', 'Lib', 'site-packages'));
        paths.push(path.join(pythonRoot, 'Programs', 'Python', 'Python310', 'Lib', 'site-packages'));
        paths.push(path.join(pythonRoot, 'Programs', 'Python', 'Python39', 'Lib', 'site-packages'));
      }
    } else if (process.platform === 'darwin') {
      // macOS
      paths.push('/usr/local/lib/python3.11/site-packages');
      paths.push('/usr/local/lib/python3.10/site-packages');
      paths.push('/usr/local/lib/python3.9/site-packages');

      // Homebrew
      paths.push('/opt/homebrew/lib/python3.11/site-packages');
      paths.push('/opt/homebrew/lib/python3.10/site-packages');

      // User site-packages
      const home = process.env.HOME;
      if (home) {
        paths.push(path.join(home, 'Library', 'Python', '3.11', 'lib', 'python', 'site-packages'));
        paths.push(path.join(home, 'Library', 'Python', '3.10', 'lib', 'python', 'site-packages'));
      }
    } else {
      // Linux
      paths.push('/usr/lib/python3/dist-packages');
      paths.push('/usr/local/lib/python3.11/dist-packages');
      paths.push('/usr/local/lib/python3.10/dist-packages');

      // User site-packages
      const home = process.env.HOME;
      if (home) {
        paths.push(path.join(home, '.local', 'lib', 'python3.11', 'site-packages'));
        paths.push(path.join(home, '.local', 'lib', 'python3.10', 'site-packages'));
      }
    }

    return paths.filter((p) => this.directoryExists(p));
  }

  /**
   * Get the content directory path for a package
   */
  private getContentPath(packageInfo: PipPackageInfo): string | null {
    const { path: packagePath, metadata } = packageInfo;

    // Check for explicit aiContentPath
    if (metadata.aiContentPath) {
      const customPath = path.join(packagePath, metadata.aiContentPath);
      if (this.directoryExists(customPath)) {
        return customPath;
      }
    }

    // Check for aiToolSync configuration
    if (metadata.aiToolSync) {
      // If aiToolSync is defined, content is in the package root
      return packagePath;
    }

    // Try common default directories
    const defaultDirs = ['defaults', 'ai_content', 'ai-content', 'content', '.ai'];

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
        return packagePath;
      }
    }

    return null;
  }

  /**
   * Get custom directory names from metadata
   */
  private getDirectories(packageInfo: PipPackageInfo): LoaderOptions['directories'] | undefined {
    const aiToolSync = packageInfo.metadata.aiToolSync;
    if (!aiToolSync) {
      return undefined;
    }

    const directories: LoaderOptions['directories'] = {};
    if (aiToolSync.rules) directories.rules = aiToolSync.rules;
    if (aiToolSync.personas) directories.personas = aiToolSync.personas;
    if (aiToolSync.commands) directories.commands = aiToolSync.commands;
    if (aiToolSync.hooks) directories.hooks = aiToolSync.hooks;

    return Object.keys(directories).length > 0 ? directories : undefined;
  }

  /**
   * Check if directory exists (sync)
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
   * Check if file exists (sync)
   */
  private fileExists(filePath: string): boolean {
    try {
      const stat = fs.statSync(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Check if installed version satisfies version spec
   * Supports PEP 440 version specifiers: ==, >=, <=, !=, ~=, <, >
   */
  private versionSatisfies(installed: string, spec: string): boolean {
    const cleanInstalled = this.cleanVersion(installed);

    // Parse multiple constraints (e.g., ">=1.0,<2.0")
    const constraints = spec.split(',').map((c) => c.trim());

    for (const constraint of constraints) {
      if (!this.checkSingleConstraint(cleanInstalled, constraint)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check a single version constraint
   */
  private checkSingleConstraint(installed: string, constraint: string): boolean {
    const installedParts = this.parseVersion(installed);
    if (!installedParts) return false;

    // Extract operator and version
    const match = constraint.match(/^(>=|<=|==|~=|!=|<|>)?(.+)$/);
    if (!match) return true; // Invalid constraint, be permissive

    const operator = match[1] ?? '==';
    const specVersion = match[2] ?? '';
    const specParts = this.parseVersion(specVersion);

    if (!specParts) return true; // Invalid version, be permissive

    const comparison = this.compareVersions(installedParts, specParts);

    switch (operator) {
      case '==':
        return comparison === 0;
      case '!=':
        return comparison !== 0;
      case '>=':
        return comparison >= 0;
      case '<=':
        return comparison <= 0;
      case '>':
        return comparison > 0;
      case '<':
        return comparison < 0;
      case '~=':
        // Compatible release: ~=1.4.2 means >=1.4.2, <1.5.0
        if (comparison < 0) return false;
        return installedParts.major === specParts.major && installedParts.minor === specParts.minor;
      default:
        return true;
    }
  }

  /**
   * Clean version string
   */
  private cleanVersion(version: string): string {
    return version.replace(/^v/, '').trim();
  }

  /**
   * Parse version into parts
   */
  private parseVersion(version: string): { major: number; minor: number; patch: number } | null {
    const cleaned = this.cleanVersion(version);
    const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!match || !match[1]) return null;

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2] ?? '0', 10),
      patch: parseInt(match[3] ?? '0', 10),
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
 * Create a PipLoader instance
 */
export function createPipLoader(): PipLoader {
  return new PipLoader();
}

/**
 * Clear the package path cache
 */
export function clearPipCache(): void {
  packagePathCache.clear();
}

/**
 * Get cached package paths (for testing/debugging)
 */
export function getPipCacheEntries(): Map<string, string> {
  return new Map(packagePathCache);
}

