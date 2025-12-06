/**
 * @file Glob Matcher
 * @description Match files against glob patterns
 *
 * This module provides utilities for matching file paths against glob patterns,
 * supporting standard glob syntax including wildcards, recursive patterns,
 * alternations, and negations.
 *
 * Glob Pattern Syntax:
 * - `*` - Match any characters except path separator
 * - `**` - Match any characters including path separator (recursive)
 * - `?` - Match single character except path separator
 * - `[abc]` - Match characters in brackets
 * - `[a-z]` - Match character range
 * - `{a,b,c}` - Match any of the alternatives
 * - `!pattern` - Negate pattern (exclude matches)
 */

import { minimatch, type MinimatchOptions } from 'minimatch';

/**
 * Options for glob matching
 */
export interface GlobMatchOptions {
  /**
   * Whether to use case-insensitive matching
   * @default false
   */
  nocase?: boolean;

  /**
   * Whether to match dotfiles
   * @default false
   */
  dot?: boolean;

  /**
   * Whether to require a full path match
   * @default false
   */
  matchBase?: boolean;

  /**
   * Whether patterns starting with / should match only from root
   * @default true
   */
  flipNegate?: boolean;
}

/**
 * Result of pattern separation
 */
export interface SeparatedPatterns {
  /**
   * Positive patterns (files to include)
   */
  positive: string[];

  /**
   * Negative patterns (files to exclude, without the ! prefix)
   */
  negative: string[];
}

/**
 * Convert our options to minimatch options
 */
function toMinimatchOptions(options?: GlobMatchOptions): MinimatchOptions {
  return {
    nocase: options?.nocase ?? false,
    dot: options?.dot ?? false,
    matchBase: options?.matchBase ?? false,
    flipNegate: options?.flipNegate ?? true,
  };
}

/**
 * Check if a path matches any of the glob patterns
 *
 * @param filePath - File path to test
 * @param patterns - Array of glob patterns
 * @param options - Matching options
 * @returns true if the path matches any pattern
 *
 * @example
 * matchGlob('src/utils/helper.ts', ['*.ts'])        // false (doesn't match at root)
 * matchGlob('src/utils/helper.ts', ['**\/*.ts'])     // true
 * matchGlob('src/utils/helper.ts', ['src/**'])      // true
 */
export function matchGlob(
  filePath: string,
  patterns: string[],
  options?: GlobMatchOptions
): boolean {
  const mmOptions = toMinimatchOptions(options);

  for (const pattern of patterns) {
    if (minimatch(filePath, pattern, mmOptions)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a path matches a single glob pattern
 *
 * @param filePath - File path to test
 * @param pattern - Glob pattern
 * @param options - Matching options
 * @returns true if the path matches the pattern
 */
export function matchSingleGlob(
  filePath: string,
  pattern: string,
  options?: GlobMatchOptions
): boolean {
  return minimatch(filePath, pattern, toMinimatchOptions(options));
}

/**
 * Filter an array of paths by glob patterns
 *
 * @param paths - Array of file paths
 * @param patterns - Array of glob patterns
 * @param options - Matching options
 * @returns Filtered array of paths that match at least one pattern
 *
 * @example
 * filterByGlob(
 *   ['src/index.ts', 'src/utils.ts', 'package.json'],
 *   ['**\/*.ts']
 * )
 * // ['src/index.ts', 'src/utils.ts']
 */
export function filterByGlob(
  paths: string[],
  patterns: string[],
  options?: GlobMatchOptions
): string[] {
  return paths.filter((p) => matchGlob(p, patterns, options));
}

/**
 * Check if a pattern is a negation pattern (starts with !)
 *
 * @param pattern - Glob pattern to check
 * @returns true if the pattern is a negation
 */
export function isNegationPattern(pattern: string): boolean {
  return pattern.startsWith('!');
}

/**
 * Separate patterns into positive and negative patterns
 *
 * @param patterns - Array of glob patterns (may include negations)
 * @returns Object with positive and negative pattern arrays
 *
 * @example
 * separatePatterns(['**\/*.ts', '!**\/*.test.ts', 'src/**'])
 * // { positive: ['**\/*.ts', 'src/**'], negative: ['**\/*.test.ts'] }
 */
export function separatePatterns(patterns: string[]): SeparatedPatterns {
  const positive: string[] = [];
  const negative: string[] = [];

  for (const pattern of patterns) {
    if (isNegationPattern(pattern)) {
      // Remove the ! prefix for the negative pattern
      negative.push(pattern.slice(1));
    } else {
      positive.push(pattern);
    }
  }

  return { positive, negative };
}

/**
 * Match with support for negation patterns
 *
 * Files must match at least one positive pattern and must not match
 * any negative pattern.
 *
 * @param filePath - File path to test
 * @param patterns - Array of patterns (may include negations with ! prefix)
 * @param options - Matching options
 * @returns true if the path matches (positive match, not excluded)
 *
 * @example
 * // Match TypeScript files but exclude tests
 * matchWithNegation('src/utils.ts', ['**\/*.ts', '!**\/*.test.ts'])  // true
 * matchWithNegation('src/utils.test.ts', ['**\/*.ts', '!**\/*.test.ts'])  // false
 */
export function matchWithNegation(
  filePath: string,
  patterns: string[],
  options?: GlobMatchOptions
): boolean {
  const { positive, negative } = separatePatterns(patterns);

  // If there are no positive patterns, nothing matches
  if (positive.length === 0) {
    return false;
  }

  // Must match at least one positive pattern
  if (!matchGlob(filePath, positive, options)) {
    return false;
  }

  // Must not match any negative pattern
  if (negative.length > 0 && matchGlob(filePath, negative, options)) {
    return false;
  }

  return true;
}

/**
 * Filter paths with support for negation patterns
 *
 * @param paths - Array of file paths
 * @param patterns - Array of patterns (may include negations)
 * @param options - Matching options
 * @returns Filtered paths
 */
export function filterWithNegation(
  paths: string[],
  patterns: string[],
  options?: GlobMatchOptions
): string[] {
  return paths.filter((p) => matchWithNegation(p, patterns, options));
}

/**
 * Normalize a glob pattern for consistent matching
 *
 * - Removes leading ./
 * - Converts backslashes to forward slashes
 * - Handles empty patterns
 *
 * @param pattern - Glob pattern to normalize
 * @returns Normalized pattern
 */
export function normalizeGlobPattern(pattern: string): string {
  if (!pattern) return pattern;

  // Convert backslashes to forward slashes (Windows paths)
  let normalized = pattern.replace(/\\/g, '/');

  // Remove leading ./
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  return normalized;
}

/**
 * Normalize an array of glob patterns
 *
 * @param patterns - Array of patterns to normalize
 * @returns Normalized patterns
 */
export function normalizeGlobPatterns(patterns: string[]): string[] {
  return patterns.map(normalizeGlobPattern);
}

/**
 * Check if a pattern contains recursive wildcard (**)
 */
export function isRecursivePattern(pattern: string): boolean {
  return pattern.includes('**');
}

/**
 * Check if a pattern contains alternations ({a,b,c})
 */
export function hasAlternation(pattern: string): boolean {
  return /\{[^}]+,[^}]+\}/.test(pattern);
}

/**
 * Expand alternation patterns into multiple patterns
 *
 * Note: This is a simple expansion that handles one level of alternation.
 * For complex nested alternations, use the full minimatch library.
 *
 * @param pattern - Pattern with alternations
 * @returns Array of expanded patterns
 *
 * @example
 * expandAlternations('src/*.{ts,tsx}')
 * // ['src/*.ts', 'src/*.tsx']
 */
export function expandAlternations(pattern: string): string[] {
  const match = pattern.match(/^(.*)\{([^}]+)\}(.*)$/);

  if (!match) {
    return [pattern];
  }

  const prefix = match[1] ?? '';
  const alternations = match[2] ?? '';
  const suffix = match[3] ?? '';
  const options = alternations.split(',').map((s) => s.trim());

  // Recursively expand in case there are more alternations
  const expanded: string[] = [];
  for (const option of options) {
    const expandedPattern = `${prefix}${option}${suffix}`;
    expanded.push(...expandAlternations(expandedPattern));
  }

  return expanded;
}

/**
 * Create a glob matcher function with preset options
 *
 * @param patterns - Patterns to match against
 * @param options - Matching options
 * @returns Matcher function
 *
 * @example
 * const isTypeScript = createGlobMatcher(['**\/*.ts', '**\/*.tsx']);
 * isTypeScript('src/index.ts')  // true
 * isTypeScript('package.json')  // false
 */
export function createGlobMatcher(
  patterns: string[],
  options?: GlobMatchOptions
): (filePath: string) => boolean {
  const { positive, negative } = separatePatterns(patterns);

  return (filePath: string) => {
    // Must match at least one positive pattern
    if (positive.length > 0 && !matchGlob(filePath, positive, options)) {
      return false;
    }

    // Must not match any negative pattern
    if (negative.length > 0 && matchGlob(filePath, negative, options)) {
      return false;
    }

    return positive.length > 0;
  };
}

/**
 * Get all patterns that match a given file path
 *
 * @param filePath - File path to test
 * @param patterns - Array of patterns to test
 * @param options - Matching options
 * @returns Array of patterns that match the file
 */
export function getMatchingPatterns(
  filePath: string,
  patterns: string[],
  options?: GlobMatchOptions
): string[] {
  const mmOptions = toMinimatchOptions(options);
  return patterns.filter((pattern) => minimatch(filePath, pattern, mmOptions));
}

/**
 * Check if a pattern is valid
 *
 * @param pattern - Pattern to validate
 * @returns true if the pattern is syntactically valid
 */
export function isValidGlobPattern(pattern: string): boolean {
  try {
    // Try to create a minimatch instance - it will throw on invalid patterns
    new minimatch.Minimatch(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate an array of patterns
 *
 * @param patterns - Patterns to validate
 * @returns Object with valid patterns and invalid patterns with errors
 */
export function validatePatterns(patterns: string[]): {
  valid: string[];
  invalid: Array<{ pattern: string; error: string }>;
} {
  const valid: string[] = [];
  const invalid: Array<{ pattern: string; error: string }> = [];

  for (const pattern of patterns) {
    try {
      new minimatch.Minimatch(pattern);
      valid.push(pattern);
    } catch (e) {
      invalid.push({
        pattern,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { valid, invalid };
}
