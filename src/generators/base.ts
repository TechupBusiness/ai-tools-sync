/**
 * @file Base Generator Interface
 * @description Interface and types for output generators
 *
 * This is a stub file - full implementation in Phase 6
 */

import type { LoadResult } from '../loaders/base.js';

/**
 * Resolved content ready for generation
 */
export interface ResolvedContent extends LoadResult {
  /**
   * Project root directory
   */
  projectRoot: string;

  /**
   * Project name
   */
  projectName?: string;
}

/**
 * Options for generating output
 */
export interface GeneratorOptions {
  /**
   * Output directory (defaults to project root)
   */
  outputDir?: string;

  /**
   * Clean existing files before generating
   */
  clean?: boolean;

  /**
   * Add "do not edit" headers to generated files
   */
  addHeaders?: boolean;

  /**
   * Dry run mode - don't write files
   */
  dryRun?: boolean;
}

/**
 * Result of a generation operation
 */
export interface GenerateResult {
  /**
   * Files that were created or updated
   */
  files: string[];

  /**
   * Files that were deleted (if clean mode)
   */
  deleted: string[];

  /**
   * Warnings encountered during generation
   */
  warnings: string[];
}

/**
 * Interface that all generators must implement
 */
export interface Generator {
  /**
   * Unique name for this generator (e.g., 'cursor', 'claude', 'factory')
   */
  readonly name: string;

  /**
   * Generate output files
   */
  generate(content: ResolvedContent, options?: GeneratorOptions): Promise<GenerateResult>;
}

/**
 * Create an empty generate result
 */
export function emptyGenerateResult(): GenerateResult {
  return {
    files: [],
    deleted: [],
    warnings: [],
  };
}

