/**
 * @file Configuration Loader
 * @description Load and parse .ai/config.yaml
 */

import * as path from 'node:path';

import { dirExists, fileExists, readFile } from '../utils/fs.js';
import { type Result, err, ok } from '../utils/result.js';
import { parseYaml, YamlParseError } from '../utils/yaml.js';

import { applyDefaults } from './defaults.js';
import type { ConfigOptions, ConfigValidationError, ResolvedConfig } from './types.js';
import { formatValidationErrors, validateConfig } from './validator.js';

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
 * Load configuration from .ai/config.yaml
 */
export async function loadConfig(options: ConfigOptions = {}): Promise<Result<ResolvedConfig, ConfigLoadError>> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const aiDir = options.aiDir ?? path.join(projectRoot, '.ai');
  const configPath = options.configPath ?? path.join(aiDir, 'config.yaml');

  // Check if .ai directory exists
  if (!(await dirExists(aiDir))) {
    return err(
      new ConfigLoadError(
        `AI configuration directory not found: ${aiDir}\nRun 'ai-sync --init' to create it.`
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
        `Configuration file not found: ${configPath}\nCreate a config.yaml file in your .ai directory.`
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
 * Used when .ai directory doesn't exist but we want to proceed with defaults
 */
export async function loadConfigWithDefaults(options: ConfigOptions = {}): Promise<ResolvedConfig> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const aiDir = options.aiDir ?? path.join(projectRoot, '.ai');
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
 * Check if a configuration directory exists
 */
export async function hasConfigDir(projectRoot?: string): Promise<boolean> {
  const root = path.resolve(projectRoot ?? process.cwd());
  const aiDir = path.join(root, '.ai');
  return dirExists(aiDir);
}

/**
 * Check if a configuration file exists
 */
export async function hasConfigFile(projectRoot?: string): Promise<boolean> {
  const root = path.resolve(projectRoot ?? process.cwd());
  const configYaml = path.join(root, '.ai', 'config.yaml');
  const configYml = path.join(root, '.ai', 'config.yml');
  return (await fileExists(configYaml)) || (await fileExists(configYml));
}

/**
 * Get the path to the .ai directory
 */
export function getAiDir(projectRoot?: string): string {
  const root = path.resolve(projectRoot ?? process.cwd());
  return path.join(root, '.ai');
}

/**
 * Get paths for various .ai subdirectories
 */
export function getAiPaths(projectRoot?: string): {
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
  const aiDir = getAiDir(projectRoot);
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
