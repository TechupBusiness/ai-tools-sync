/**
 * @file Persona Parser
 * @description Parse persona files with frontmatter
 *
 * This is a stub file - full implementation in Phase 3
 */

import { type Result, ok } from '../utils/result.js';

import { parseFrontmatter } from './frontmatter.js';

/**
 * Persona frontmatter structure
 */
export interface Persona {
  name: string;
  description?: string;
  version?: string;
  tools?: string[];
  model?: string;
  targets?: string[];
}

/**
 * Parsed persona with content
 */
export interface ParsedPersona {
  frontmatter: Persona;
  content: string;
  filePath: string | undefined;
}

/**
 * Parse a persona file
 */
export function parsePersona(content: string, filePath?: string): Result<ParsedPersona> {
  const result = parseFrontmatter<Persona>(content);

  if (!result.ok) {
    return result;
  }

  return ok({
    frontmatter: result.value.data,
    content: result.value.content,
    filePath,
  });
}

