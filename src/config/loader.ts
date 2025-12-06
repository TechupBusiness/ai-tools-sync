/**
 * @file Configuration Loader
 * @description Load and parse .ai-tool-sync/config.yaml (or custom directory)
 *
 * Config directory resolution priority:
 * 1. CLI flag (--config-dir=<path>)
 * 2. Environment variable (AI_TOOL_SYNC_DIR)
 * 3. package.json ("ai-tool-sync": { "configDir": ".ai" })
 * 4. Default (.ai-tool-sync)
 */

import * as path from 'node:path';

import { dirExists, fileExists, readFile, readJson } from '../utils/fs.js';
import { type Result, err, ok } from '../utils/result.js';
import { parseYaml, type YamlParseError } from '../utils/yaml.js';

import { applyDefaults } from './defaults.js';
import { formatValidationErrors, validateConfig } from './validator.js';

import type { ConfigDirResolutionOptions, ConfigOptions, ConfigValidationError, ResolvedConfig } from './types.js';

/**
 * Default configuration directory name
 */
export const DEFAULT_CONFIG_DIR = '.ai-tool-sync';

/**
 * Environment variable name for config directory
 */
export const CONFIG_DIR_ENV_VAR = 'AI_TOOL_SYNC_DIR';

/**
 * package.json key for ai-tool-sync configuration
 */
export const PACKAGE_JSON_KEY = 'ai-tool-sync';

/**
 * Error thrown when configuration loading fails
 */
export class ConfigLoadError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error | YamlParseError | ConfigValidationError[]
  ) {
    super(message);
    this.name = 'ConfigLoadError';
  }
}

/**
 * Configuration stored in package.json under "ai-tool-sync" key
 */
interface PackageJsonAiToolSyncConfig {
  configDir?: string;
}

/**
 * Read ai-tool-sync configuration from package.json
 */
async function readPackageJsonConfig(projectRoot: string): Promise<PackageJsonAiToolSyncConfig | undefined> {
  const packageJsonPath = path.join(projectRoot, 'package.json');

  if (!(await fileExists(packageJsonPath))) {
    return undefined;
  }

  const result = await readJson<{ [PACKAGE_JSON_KEY]?: PackageJsonAiToolSyncConfig }>(packageJsonPath);
  if (!result.ok) {
    return undefined;
  }

  return result.value[PACKAGE_JSON_KEY];
}

/**
 * Resolve the configuration directory name from multiple sources
 *
 * Priority order:
 * 1. Explicit configDir option (from CLI flag)
 * 2. AI_TOOL_SYNC_DIR environment variable
 * 3. package.json "ai-tool-sync.configDir"
 * 4. Default (.ai-tool-sync)
 *
 * @param options Resolution options
 * @returns The resolved config directory name (relative to project root)
 */
export async function resolveConfigDir(options: ConfigDirResolutionOptions = {}): Promise<string> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());

  // Priority 1: Explicit configDir option (from CLI flag)
  if (options.configDir) {
    return options.configDir;
  }

  // Priority 2: Environment variable
  const envDir = process.env[CONFIG_DIR_ENV_VAR];
  if (envDir) {
    return envDir;
  }

  // Priority 3: package.json
  const packageJsonConfig = await readPackageJsonConfig(projectRoot);
  if (packageJsonConfig?.configDir) {
    return packageJsonConfig.configDir;
  }

  // Priority 4: Default
  return DEFAULT_CONFIG_DIR;
}

/**
 * Synchronous version of resolveConfigDir that doesn't check package.json
 * Used when we need synchronous resolution (e.g., getAiDir, getAiPaths)
 */
export function resolveConfigDirSync(options: { configDir?: string } = {}): string {
  // Priority 1: Explicit configDir option (from CLI flag)
  if (options.configDir) {
    return options.configDir;
  }

  // Priority 2: Environment variable
  const envDir = process.env[CONFIG_DIR_ENV_VAR];
  if (envDir) {
    return envDir;
  }

  // Priority 3: Default (can't check package.json synchronously without reading it)
  return DEFAULT_CONFIG_DIR;
}

/**
 * Load configuration from .ai-tool-sync/config.yaml (or custom directory)
 */
export async function loadConfig(options: ConfigOptions = {}): Promise<Result<ResolvedConfig, ConfigLoadError>> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());

  // Resolve the config directory using priority order
  let aiDir: string;
  if (options.aiDir) {
    // Explicit aiDir takes precedence
    aiDir = options.aiDir;
  } else {
    // Resolve using priority: CLI configDir > ENV > package.json > default
    const configDirName = await resolveConfigDir({
      projectRoot,
      configDir: options.configDir,
    });
    aiDir = path.join(projectRoot, configDirName);
  }

  const configPath = options.configPath ?? path.join(aiDir, 'config.yaml');

  // Check if config directory exists
  if (!(await dirExists(aiDir))) {
    return err(
      new ConfigLoadError(
        `AI configuration directory not found: ${aiDir}\nRun 'ai-sync init' to create it.`
      )
    );
  }

  // Check if config file exists
  if (!(await fileExists(configPath))) {
    // Try with .yml extension
    const ymlPath = configPath.replace(/\.yaml$/, '.yml');
    if (await fileExists(ymlPath)) {
      return loadConfigFromPath(ymlPath, projectRoot, aiDir);
    }

    return err(
      new ConfigLoadError(
        `Configuration file not found: ${configPath}\nCreate a config.yaml file in your ${path.basename(aiDir)} directory.`
      )
    );
  }

  return loadConfigFromPath(configPath, projectRoot, aiDir);
}

/**
 * Load configuration from a specific path
 */
async function loadConfigFromPath(
  configPath: string,
  projectRoot: string,
  aiDir: string
): Promise<Result<ResolvedConfig, ConfigLoadError>> {
  // Read the file
  const contentResult = await readFile(configPath);
  if (!contentResult.ok) {
    return err(new ConfigLoadError(`Failed to read configuration file: ${configPath}`, contentResult.error));
  }

  // Parse YAML
  const parseResult = parseYaml<Record<string, unknown>>(contentResult.value);
  if (!parseResult.ok) {
    const yamlError = parseResult.error;
    const location = yamlError.line ? ` at line ${yamlError.line}` : '';
    return err(new ConfigLoadError(`Failed to parse YAML${location}: ${yamlError.message}`, yamlError));
  }

  // Handle empty config file
  if (parseResult.value === null || parseResult.value === undefined) {
    return err(new ConfigLoadError('Configuration file is empty'));
  }

  // Validate the config
  const validationResult = validateConfig(parseResult.value);
  if (!validationResult.ok) {
    return err(
      new ConfigLoadError(
        `Configuration validation failed:\n${formatValidationErrors(validationResult.error)}`,
        validationResult.error
      )
    );
  }

  // Apply defaults
  const configWithDefaults = applyDefaults(validationResult.value);

  // Create resolved config with absolute paths
  const resolved: ResolvedConfig = {
    ...configWithDefaults,
    projectRoot,
    aiDir,
    configPath,
  };

  return ok(resolved);
}

/**
 * Load configuration with fallback to defaults
 * Used when config directory doesn't exist but we want to proceed with defaults
 */
export async function loadConfigWithDefaults(options: ConfigOptions = {}): Promise<ResolvedConfig> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());

  // Resolve the config directory using priority order
  let aiDir: string;
  if (options.aiDir) {
    aiDir = options.aiDir;
  } else {
    const configDirName = await resolveConfigDir({
      projectRoot,
      configDir: options.configDir,
    });
    aiDir = path.join(projectRoot, configDirName);
  }

  const configPath = options.configPath ?? path.join(aiDir, 'config.yaml');

  const result = await loadConfig(options);

  if (result.ok) {
    return result.value;
  }

  // Return default config
  const defaultConfig = applyDefaults({ version: '1.0.0' });
  return {
    ...defaultConfig,
    projectRoot,
    aiDir,
    configPath,
  };
}

/**
 * Options for directory helper functions
 */
export interface AiDirOptions {
  /**
   * Path to the project root (defaults to cwd)
   */
  projectRoot?: string;

  /**
   * Custom config directory name (relative to project root)
   * If not provided, uses resolveConfigDirSync() which checks CLI > ENV > default
   */
  configDir?: string;
}

/**
 * Check if a configuration directory exists
 */
export async function hasConfigDir(projectRoot?: string, configDir?: string): Promise<boolean> {
  const root = path.resolve(projectRoot ?? process.cwd());

  // If configDir provided, use it directly
  if (configDir) {
    return dirExists(path.join(root, configDir));
  }

  // Try to resolve from package.json first (async)
  const resolvedDir = await resolveConfigDir({ projectRoot: root });
  return dirExists(path.join(root, resolvedDir));
}

/**
 * Check if a configuration file exists
 */
export async function hasConfigFile(projectRoot?: string, configDir?: string): Promise<boolean> {
  const root = path.resolve(projectRoot ?? process.cwd());

  // Resolve config directory
  let aiDirName: string;
  if (configDir) {
    aiDirName = configDir;
  } else {
    aiDirName = await resolveConfigDir({ projectRoot: root });
  }

  const aiDir = path.join(root, aiDirName);
  const configYaml = path.join(aiDir, 'config.yaml');
  const configYml = path.join(aiDir, 'config.yml');
  return (await fileExists(configYaml)) || (await fileExists(configYml));
}

/**
 * Get the path to the AI config directory
 *
 * Note: This is a synchronous function that uses resolveConfigDirSync(),
 * which checks CLI > ENV > default but cannot check package.json.
 * For full resolution including package.json, use resolveConfigDir().
 */
export function getAiDir(projectRoot?: string, configDir?: string): string {
  const root = path.resolve(projectRoot ?? process.cwd());
  const resolvedDir = configDir ?? resolveConfigDirSync();
  return path.join(root, resolvedDir);
}

/**
 * Get paths for various AI config subdirectories
 *
 * Note: This is a synchronous function that uses resolveConfigDirSync(),
 * which checks CLI > ENV > default but cannot check package.json.
 * For full resolution including package.json, use getAiPathsAsync().
 */
export function getAiPaths(projectRoot?: string, configDir?: string): {
  aiDir: string;
  rulesDir: string;
  personasDir: string;
  commandsDir: string;
  hooksDir: string;
  pluginsDir: string;
  overridesDir: string;
  inputDir: string;
  targetsDir: string;
} {
  const aiDir = getAiDir(projectRoot, configDir);
  return {
    aiDir,
    rulesDir: path.join(aiDir, 'rules'),
    personasDir: path.join(aiDir, 'personas'),
    commandsDir: path.join(aiDir, 'commands'),
    hooksDir: path.join(aiDir, 'hooks'),
    pluginsDir: path.join(aiDir, 'plugins'),
    overridesDir: path.join(aiDir, 'overrides'),
    inputDir: path.join(aiDir, 'input'),
    targetsDir: path.join(aiDir, 'targets'),
  };
}

/**
 * Get paths for various AI config subdirectories (async version)
 *
 * This version fully resolves the config directory including package.json.
 */
export async function getAiPathsAsync(projectRoot?: string, configDir?: string): Promise<{
  aiDir: string;
  rulesDir: string;
  personasDir: string;
  commandsDir: string;
  hooksDir: string;
  pluginsDir: string;
  overridesDir: string;
  inputDir: string;
  targetsDir: string;
}> {
  const root = path.resolve(projectRoot ?? process.cwd());
  const resolvedDir = configDir ?? await resolveConfigDir({ projectRoot: root });
  const aiDir = path.join(root, resolvedDir);

  return {
    aiDir,
    rulesDir: path.join(aiDir, 'rules'),
    personasDir: path.join(aiDir, 'personas'),
    commandsDir: path.join(aiDir, 'commands'),
    hooksDir: path.join(aiDir, 'hooks'),
    pluginsDir: path.join(aiDir, 'plugins'),
    overridesDir: path.join(aiDir, 'overrides'),
    inputDir: path.join(aiDir, 'input'),
    targetsDir: path.join(aiDir, 'targets'),
  };
}

/**
 * Re-export validation for external use
 */
export { validateConfig, formatValidationErrors } from './validator.js';
