/**
 * @file Hook Parser
 * @description Parse hook files with frontmatter
 *
 * This is a stub file - full implementation in Phase 3
 */

import { type Result, ok } from '../utils/result.js';

import { parseFrontmatter } from './frontmatter.js';

/**
 * Hook event types
 */
export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PreMessage'
  | 'PostMessage'
  | 'PreCommit';

/**
 * Hook frontmatter structure
 */
export interface Hook {
  name: string;
  description?: string;
  version?: string;
  event: HookEvent;
  tool_match?: string;
  execute?: string;
  targets?: string[];
}

/**
 * Parsed hook with content
 */
export interface ParsedHook {
  frontmatter: Hook;
  content: string;
  filePath: string | undefined;
}

/**
 * Parse a hook file
 */
export function parseHook(content: string, filePath?: string): Result<ParsedHook> {
  const result = parseFrontmatter<Hook>(content);

  if (!result.ok) {
    return result;
  }

  return ok({
    frontmatter: result.value.data,
    content: result.value.content,
    filePath,
  });
}

