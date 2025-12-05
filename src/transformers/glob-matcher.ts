/**
 * @file Glob Matcher
 * @description Match files against glob patterns
 *
 * This is a stub file - full implementation in Phase 4
 */

import { minimatch } from 'minimatch';

/**
 * Check if a path matches any of the glob patterns
 */
export function matchGlob(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (minimatch(filePath, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a path matches a single glob pattern
 */
export function matchSingleGlob(filePath: string, pattern: string): boolean {
  return minimatch(filePath, pattern);
}

/**
 * Filter an array of paths by glob patterns
 */
export function filterByGlob(paths: string[], patterns: string[]): string[] {
  return paths.filter((p) => matchGlob(p, patterns));
}

/**
 * Check if a pattern is a negation pattern
 */
export function isNegationPattern(pattern: string): boolean {
  return pattern.startsWith('!');
}

/**
 * Separate patterns into positive and negative patterns
 */
export function separatePatterns(patterns: string[]): {
  positive: string[];
  negative: string[];
} {
  const positive: string[] = [];
  const negative: string[] = [];

  for (const pattern of patterns) {
    if (isNegationPattern(pattern)) {
      negative.push(pattern.slice(1));
    } else {
      positive.push(pattern);
    }
  }

  return { positive, negative };
}

/**
 * Match with support for negation patterns
 */
export function matchWithNegation(filePath: string, patterns: string[]): boolean {
  const { positive, negative } = separatePatterns(patterns);

  // Must match at least one positive pattern
  if (!matchGlob(filePath, positive)) {
    return false;
  }

  // Must not match any negative pattern
  if (matchGlob(filePath, negative)) {
    return false;
  }

  return true;
}

