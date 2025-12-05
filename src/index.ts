/**
 * @file AI Tool Sync - Main Entry Point
 * @description Unified AI tool configuration - single source of truth for Cursor, Claude Code, Factory, and more
 *
 * This module exports the public API for programmatic usage of ai-tool-sync.
 */

// Re-export types
export type { Config, ConfigOptions } from './config/types.js';
export type { Rule, ParsedRule } from './parsers/rule.js';
export type { Persona, ParsedPersona } from './parsers/persona.js';
export type { Command, ParsedCommand } from './parsers/command.js';
export type { Hook, ParsedHook } from './parsers/hook.js';
export type { Result, Ok, Err } from './utils/result.js';

// Re-export core functionality
export { loadConfig, validateConfig } from './config/loader.js';
export {
  loadTargetMapping,
  loadAllTargetMappings,
  getOutputDir,
  isFeatureSupported,
  getTerminology,
  getToolMapping,
  getModelMapping,
  getFrontmatterConfig,
  supportsImportSyntax,
  getImportFormat,
} from './config/target-mapping.js';
export type {
  TargetMapping,
  TargetOutputConfig,
  ToolMappingOptions,
  ModelMappingOptions,
  FrontmatterConfig,
  FrontmatterConfigs,
  TerminologyMapping,
  ImportSyntaxConfig,
  LoadTargetMappingOptions,
} from './config/target-mapping.js';
export { parseRule } from './parsers/rule.js';
export { parsePersona } from './parsers/persona.js';
export { parseCommand } from './parsers/command.js';
export { parseHook } from './parsers/hook.js';

// Re-export loaders
export { LocalLoader, createLocalLoader } from './loaders/local.js';
export {
  NpmLoader,
  createNpmLoader,
  clearNpmCache,
  getNpmCacheEntries,
  NPM_PREFIX,
} from './loaders/npm.js';
export type { NpmPackageInfo, NpmPackageJson, NpmLoaderOptions } from './loaders/npm.js';
export {
  PipLoader,
  createPipLoader,
  clearPipCache,
  getPipCacheEntries,
  PIP_PREFIX,
} from './loaders/pip.js';
export type { PipPackageInfo, PipPackageMetadata, PipLoaderOptions } from './loaders/pip.js';
export {
  ClaudePluginLoader,
  createClaudePluginLoader,
  clearClaudePluginCache,
  getClaudePluginCacheEntries,
  CLAUDE_PLUGIN_PREFIX,
} from './loaders/claude-plugin.js';
export type {
  ClaudePluginInfo,
  ClaudePluginLoaderOptions,
  ClaudeSettings,
  ClaudeHook,
  ClaudeSkillFrontmatter,
  ClaudeAgentFrontmatter,
} from './loaders/claude-plugin.js';
export {
  UrlLoader,
  createUrlLoader,
  clearUrlCache,
  getUrlCacheEntries,
  isValidUrl,
  URL_PREFIX,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_CACHE_TTL_MS,
} from './loaders/url.js';
export type { UrlLoaderOptions } from './loaders/url.js';
export {
  emptyLoadResult,
  mergeLoadResults,
  filterLoadResultByTarget,
  isLoadResultEmpty,
  getLoadResultStats,
  DEFAULT_DIRECTORIES,
} from './loaders/base.js';
export type { Loader, LoadResult, LoaderOptions, LoadError } from './loaders/base.js';

// Re-export generators
export { CursorGenerator } from './generators/cursor.js';
export { ClaudeGenerator } from './generators/claude.js';
export { FactoryGenerator } from './generators/factory.js';
export type { Generator, GeneratorOptions, ResolvedContent } from './generators/base.js';

// Re-export utilities
export { ok, err, isOk, isErr } from './utils/result.js';
export { logger } from './utils/logger.js';

// Version
export const VERSION = '0.1.0';

