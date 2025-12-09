/**
 * @file Base Loader Interface
 * @description Interface and types for content loaders
 */

import type { ParsedCommand } from '../parsers/command.js';
import type { ParsedHook } from '../parsers/hook.js';
import type { McpServer } from '../parsers/mcp.js';
import type { ParsedPersona } from '../parsers/persona.js';
import type { ParsedRule } from '../parsers/rule.js';
import type { ParseError, TargetType } from '../parsers/types.js';

/**
 * Result of loading content from a source
 */
export interface LoadResult {
  /** Parsed rules */
  rules: ParsedRule[];
  /** Parsed personas */
  personas: ParsedPersona[];
  /** Parsed commands */
  commands: ParsedCommand[];
  /** Parsed hooks */
  hooks: ParsedHook[];
  /** MCP servers from plugins */
  mcpServers?: Record<string, McpServer>;
  /** Non-fatal errors encountered during loading */
  errors?: LoadError[];
  /** Source identifier (e.g., path or URL) */
  source?: string;
  /** Optional metadata from loader (e.g., plugin info) */
  metadata?: {
    pluginName?: string;
    pluginVersion?: string;
    pluginDescription?: string;
    [key: string]: unknown;
  };
}

/**
 * Error that occurred during loading (non-fatal)
 */
export interface LoadError {
  /** Type of content that failed to load */
  type: 'rule' | 'persona' | 'command' | 'hook' | 'directory' | 'file';
  /** File path that caused the error */
  path: string;
  /** Error message */
  message: string;
  /** Original parse error if applicable */
  parseError?: ParseError;
}

/**
 * Options for loading content
 */
export interface LoaderOptions {
  /**
   * Base directory for resolving paths
   */
  basePath?: string;

  /**
   * Filter to specific targets
   */
  targets?: TargetType[];

  /**
   * Include patterns (glob patterns)
   */
  include?: string[];

  /**
   * Exclude patterns (glob patterns)
   */
  exclude?: string[];

  /**
   * Whether to continue loading on errors (default: true)
   */
  continueOnError?: boolean;

  /**
   * Custom subdirectory names for each content type
   */
  directories?: {
    rules?: string;
    personas?: string;
    commands?: string;
    hooks?: string;
  };
}

/**
 * Default directory names for content types
 */
export const DEFAULT_DIRECTORIES = {
  rules: 'rules',
  personas: 'personas',
  commands: 'commands',
  hooks: 'hooks',
} as const;

/**
 * Interface that all loaders must implement
 */
export interface Loader {
  /**
   * Unique name for this loader
   */
  readonly name: string;

  /**
   * Check if this loader can handle the given source
   */
  canLoad(source: string): boolean;

  /**
   * Load content from the source
   */
  load(source: string, options?: LoaderOptions): Promise<LoadResult>;
}

/**
 * Create an empty load result
 */
export function emptyLoadResult(): LoadResult {
  return {
    rules: [],
    personas: [],
    commands: [],
    hooks: [],
  };
}

/**
 * Create an empty load result with source
 */
export function emptyLoadResultWithSource(source: string): LoadResult {
  return {
    rules: [],
    personas: [],
    commands: [],
    hooks: [],
    source,
  };
}

/**
 * Merge multiple load results
 */
export function mergeLoadResults(...results: LoadResult[]): LoadResult {
  const errors: LoadError[] = [];
  let mcpServers: Record<string, McpServer> | undefined;

  for (const r of results) {
    if (r.errors && r.errors.length > 0) {
      errors.push(...r.errors);
    }

    if (r.mcpServers) {
      mcpServers = { ...mcpServers, ...r.mcpServers };
    }
  }

  const merged: LoadResult = {
    rules: results.flatMap((r) => r.rules),
    personas: results.flatMap((r) => r.personas),
    commands: results.flatMap((r) => r.commands),
    hooks: results.flatMap((r) => r.hooks),
  };

  if (mcpServers && Object.keys(mcpServers).length > 0) {
    merged.mcpServers = mcpServers;
  }

  if (errors.length > 0) {
    merged.errors = errors;
  }

  return merged;
}

/**
 * Filter load result by target
 */
export function filterLoadResultByTarget(result: LoadResult, target: TargetType): LoadResult {
  const filtered: LoadResult = {
    rules: result.rules.filter((r) =>
      (r.frontmatter.targets ?? ['cursor', 'claude', 'factory']).includes(target)
    ),
    personas: result.personas.filter((p) =>
      (p.frontmatter.targets ?? ['cursor', 'claude', 'factory']).includes(target)
    ),
    commands: result.commands.filter((c) =>
      (c.frontmatter.targets ?? ['cursor', 'claude', 'factory']).includes(target)
    ),
    hooks: result.hooks.filter((h) => (h.frontmatter.targets ?? ['claude']).includes(target)),
  };

  // Only add optional properties if they have values
  if (result.errors !== undefined) {
    filtered.errors = result.errors;
  }
  if (result.source !== undefined) {
    filtered.source = result.source;
  }

  return filtered;
}

/**
 * Check if a load result is empty
 */
export function isLoadResultEmpty(result: LoadResult): boolean {
  return (
    result.rules.length === 0 &&
    result.personas.length === 0 &&
    result.commands.length === 0 &&
    result.hooks.length === 0
  );
}

/**
 * Get statistics for a load result
 */
export function getLoadResultStats(result: LoadResult): {
  rules: number;
  personas: number;
  commands: number;
  hooks: number;
  errors: number;
  total: number;
} {
  return {
    rules: result.rules.length,
    personas: result.personas.length,
    commands: result.commands.length,
    hooks: result.hooks.length,
    errors: result.errors?.length ?? 0,
    total:
      result.rules.length + result.personas.length + result.commands.length + result.hooks.length,
  };
}
