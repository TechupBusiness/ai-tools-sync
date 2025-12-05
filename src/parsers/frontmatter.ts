/**
 * @file Frontmatter Parser
 * @description Extract YAML frontmatter from markdown files
 *
 * This is a stub file - full implementation in Phase 3
 */

import matter from 'gray-matter';

import { type Result, ok } from '../utils/result.js';

/**
 * Parsed frontmatter result
 */
export interface ParsedFrontmatter<T = Record<string, unknown>> {
  data: T;
  content: string;
  isEmpty: boolean;
}

/**
 * Parse frontmatter from markdown content
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  content: string
): Result<ParsedFrontmatter<T>> {
  const result = matter(content);

  return ok({
    data: result.data as T,
    content: result.content,
    isEmpty: Object.keys(result.data).length === 0,
  });
}

/**
 * Check if content has frontmatter
 */
export function hasFrontmatter(content: string): boolean {
  return content.trimStart().startsWith('---');
}

