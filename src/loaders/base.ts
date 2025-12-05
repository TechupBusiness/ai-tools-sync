/**
 * @file Base Loader Interface
 * @description Interface and types for content loaders
 *
 * This is a stub file - full implementation in Phase 5
 */

import type { ParsedCommand } from '../parsers/command.js';
import type { ParsedHook } from '../parsers/hook.js';
import type { ParsedPersona } from '../parsers/persona.js';
import type { ParsedRule } from '../parsers/rule.js';

/**
 * Result of loading content from a source
 */
export interface LoadResult {
  rules: ParsedRule[];
  personas: ParsedPersona[];
  commands: ParsedCommand[];
  hooks: ParsedHook[];
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
  targets?: string[];

  /**
   * Include patterns
   */
  include?: string[];

  /**
   * Exclude patterns
   */
  exclude?: string[];
}

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
 * Merge multiple load results
 */
export function mergeLoadResults(...results: LoadResult[]): LoadResult {
  return {
    rules: results.flatMap((r) => r.rules),
    personas: results.flatMap((r) => r.personas),
    commands: results.flatMap((r) => r.commands),
    hooks: results.flatMap((r) => r.hooks),
  };
}

