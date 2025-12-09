/**
 * @file Configuration Types
 * @description Type definitions for .ai/config.yaml
 */

import type { LoaderOptions, LoadResult } from '../loaders/base.js';
import type { PluginCache } from '../utils/plugin-cache.js';

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

export interface PluginLoaderOptions extends LoaderOptions {
  /**
   * Plugin cache instance (for version-aware caching)
   */
  pluginCache?: PluginCache;

  /**
   * Plugin configuration from config.yaml
   */
  config?: PluginConfig;

  /**
   * Whether to force refresh (ignore cache)
   */
  forceRefresh?: boolean;

  /**
   * Timeout for underlying git operations (ms)
   */
  timeout?: number;
}

/**
 * Plugin loader result with metadata
 */
export interface PluginLoadResult extends LoadResult {
  /** Plugin metadata from manifest or source */
  pluginInfo?: {
    name: string;
    version?: string;
    source: string;
    description?: string;
  };
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
 * Claude permission configuration
 */
export interface ClaudePermission {
  /** Tool/pattern match expression (e.g., 'Bash(*)', 'Read') */
  matcher: string;
  /** Permission action */
  action: 'allow' | 'deny' | 'ask';
  /** Optional message explaining the permission */
  message?: string;
}

/**
 * Claude hook configuration (for config.yaml)
 */
export interface ClaudeHookConfig {
  /** Hook identifier for logging/debugging */
  name?: string;
  /** Tool/pattern to match (e.g., 'Bash(*rm*)', 'Write|Edit') */
  matcher?: string;
  /** Shell command to execute */
  command: string;
  /** Hook type (defaults to 'command') */
  type?: 'command' | 'validation' | 'notification';
  /** Action for PreToolUse hooks (warn shows message, block stops) */
  action?: 'warn' | 'block';
  /** User-facing message */
  message?: string;
}

/**
 * Claude settings configuration
 */
export interface ClaudeSettingsConfig {
  /** Permission rules for Claude tools */
  permissions?: ClaudePermission[];
  /** Environment variables for Claude */
  env?: Record<string, string>;
  /** Hooks configuration by event type */
  hooks?: Record<string, ClaudeHookConfig[]>;
}

/**
 * Claude platform-specific configuration
 */
export interface ClaudeConfig {
  /** Claude settings (permissions, env) */
  settings?: ClaudeSettingsConfig;
}

/**
 * Factory hook configuration (for config.yaml)
 * Same structure as ClaudeHookConfig - Factory uses same event system
 */
export interface FactoryHookConfig {
  /** Hook identifier for logging/debugging */
  name?: string;
  /** Tool/pattern to match (e.g., 'Bash(*rm*)', 'Write|Edit') */
  matcher?: string;
  /** Shell command to execute */
  command: string;
  /** Hook type (defaults to 'command') */
  type?: 'command' | 'validation' | 'notification';
  /** Action for PreToolUse hooks (warn shows message, block stops) */
  action?: 'warn' | 'block';
  /** User-facing message */
  message?: string;
}

/**
 * Factory settings configuration
 */
export interface FactorySettingsConfig {
  /** Environment variables for Factory */
  env?: Record<string, string>;
  /** Hooks configuration by event type */
  hooks?: Record<string, FactoryHookConfig[]>;
}

/**
 * Factory platform-specific configuration
 */
export interface FactoryConfig {
  /** Factory settings */
  settings?: FactorySettingsConfig;
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
  /** User-defined variables for conditional rules */
  context?: Record<string, string | number | boolean>;

  /** Claude Code platform-specific settings */
  claude?: ClaudeConfig;

  /** Factory platform-specific settings */
  factory?: FactoryConfig;
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
