/**
 * @file Configuration Types
 * @description Type definitions for .ai/config.yaml
 */

/**
 * Plugin configuration
 */
export interface PluginConfig {
  name: string;
  source: string;
  version?: string;
  enabled: boolean;
  include?: string[];
  exclude?: string[];
}

/**
 * Loader configuration
 */
export interface LoaderConfig {
  type: 'ai-tool-sync' | 'local' | 'npm' | 'pip' | 'claude-plugin' | 'url';
  source?: string;
  package?: string;
  version?: string;
}

/**
 * Rule configuration
 */
export interface RuleConfig {
  always_apply?: boolean;
  globs?: string[];
  targets?: string[];
  source?: string;
  description?: string;
}

/**
 * Subfolder context configuration
 */
export interface SubfolderContextConfig {
  rules: string[];
  personas?: string[];
  description?: string;
}

/**
 * Hook configuration
 */
export interface HookConfig {
  name: string;
  match: string;
  action: 'warn' | 'block' | 'allow';
  message?: string;
}

/**
 * Output configuration
 */
export interface OutputConfig {
  clean_before_sync?: boolean;
  add_do_not_edit_headers?: boolean;
  update_gitignore?: boolean;
}

/**
 * What to use from defaults
 */
export interface UseConfig {
  personas?: string[];
  commands?: string[];
  plugins?: PluginConfig[];
}

/**
 * Main configuration structure for .ai/config.yaml
 */
export interface Config {
  version: string;
  project_name?: string;

  use?: UseConfig;
  loaders?: LoaderConfig[];
  targets?: string[];
  rules?: Record<string, RuleConfig>;
  subfolder_contexts?: Record<string, SubfolderContextConfig>;
  hooks?: Record<string, HookConfig[]>;
  output?: OutputConfig;
}

/**
 * Options for loading configuration
 */
export interface ConfigOptions {
  /**
   * Path to the project root (defaults to cwd)
   */
  projectRoot?: string;

  /**
   * Path to the .ai directory (defaults to projectRoot/.ai-tool-sync)
   * Can also be set via:
   * - CLI flag: --config-dir=<path>
   * - Environment variable: AI_TOOL_SYNC_DIR
   * - package.json: "ai-tool-sync": { "configDir": ".ai" }
   */
  aiDir?: string;

  /**
   * Path to config.yaml (defaults to aiDir/config.yaml)
   */
  configPath?: string;

  /**
   * Custom config directory name (relative to project root)
   * Priority: CLI flag > ENV var > package.json > default (.ai-tool-sync)
   */
  configDir?: string | undefined;
}

/**
 * Options for resolving config directory
 */
export interface ConfigDirResolutionOptions {
  /**
   * Path to the project root (defaults to cwd)
   */
  projectRoot?: string | undefined;

  /**
   * Explicit config directory (highest priority, from CLI flag)
   */
  configDir?: string | undefined;
}

/**
 * Validation error for configuration
 */
export interface ConfigValidationError {
  path: string;
  message: string;
  value?: unknown;
}

/**
 * Resolved configuration with all paths absolute
 */
export interface ResolvedConfig extends Config {
  projectRoot: string;
  aiDir: string;
  configPath: string;
}

