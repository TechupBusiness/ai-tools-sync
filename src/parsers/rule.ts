/**
 * @file Rule Parser
 * @description Parse rule files with frontmatter
 *
 * This is a stub file - full implementation in Phase 3
 */

import { type Result, ok } from '../utils/result.js';

import { parseFrontmatter } from './frontmatter.js';

/**
 * Rule frontmatter structure
 */
export interface Rule {
  name: string;
  description?: string;
  version?: string;
  always_apply?: boolean;
  globs?: string[];
  targets?: string[];
  requires?: string[];
  category?: string;
  priority?: 'low' | 'medium' | 'high';
}

/**
 * Parsed rule with content
 */
export interface ParsedRule {
  frontmatter: Rule;
  content: string;
  filePath: string | undefined;
}

/**
 * Parse a rule file
 */
export function parseRule(content: string, filePath?: string): Result<ParsedRule> {
  const result = parseFrontmatter<Rule>(content);

  if (!result.ok) {
    return result;
  }

  return ok({
    frontmatter: result.value.data,
    content: result.value.content,
    filePath,
  });
}

