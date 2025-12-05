/**
 * @file Command Parser
 * @description Parse command files with frontmatter
 *
 * This is a stub file - full implementation in Phase 3
 */

import { type Result, ok } from '../utils/result.js';

import { parseFrontmatter } from './frontmatter.js';

/**
 * Command argument definition
 */
export interface CommandArg {
  name: string;
  type: 'string' | 'number' | 'boolean';
  default?: string | number | boolean;
  choices?: (string | number)[];
  required?: boolean;
}

/**
 * Command frontmatter structure
 */
export interface Command {
  name: string;
  description?: string;
  version?: string;
  execute?: string;
  args?: CommandArg[];
  targets?: string[];
}

/**
 * Parsed command with content
 */
export interface ParsedCommand {
  frontmatter: Command;
  content: string;
  filePath: string | undefined;
}

/**
 * Parse a command file
 */
export function parseCommand(content: string, filePath?: string): Result<ParsedCommand> {
  const result = parseFrontmatter<Command>(content);

  if (!result.ok) {
    return result;
  }

  return ok({
    frontmatter: result.value.data,
    content: result.value.content,
    filePath,
  });
}

