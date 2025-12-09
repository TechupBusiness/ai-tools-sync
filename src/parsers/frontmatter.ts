/**
 * @file Frontmatter Parser
 * @description Extract YAML frontmatter from markdown files
 *
 * This parser extracts YAML frontmatter from markdown files and provides
 * detailed error information including line numbers for parse errors.
 */

import matter from 'gray-matter';

import { type Result, err, ok } from '../utils/result.js';

/**
 * Error information for frontmatter parsing
 */
export interface FrontmatterParseError {
  message: string;
  line?: number;
  column?: number;
  source?: string;
}

/**
 * Parsed frontmatter result
 */
export interface ParsedFrontmatter<T = Record<string, unknown>> {
  /** Parsed frontmatter data */
  data: T;
  /** Content after frontmatter (markdown body) */
  content: string;
  /** Whether the frontmatter is empty or missing */
  isEmpty: boolean;
  /** Starting line of the content (after frontmatter) */
  contentStartLine: number;
  /** Raw frontmatter string (without delimiters) */
  rawFrontmatter: string;
}

/**
 * Check if content has frontmatter
 * Frontmatter must start with '---' at the beginning of the file
 */
export function hasFrontmatter(content: string): boolean {
  return content.trimStart().startsWith('---');
}

/**
 * Extract line number from YAML parse error
 */
function extractLineNumber(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    // js-yaml errors have a 'mark' property with line info
    const yamlError = error as { mark?: { line?: number }; line?: number };
    if (yamlError.mark?.line !== undefined) {
      return yamlError.mark.line + 1; // js-yaml uses 0-based line numbers
    }
    if (yamlError.line !== undefined) {
      return yamlError.line;
    }
  }
  return undefined;
}

/**
 * Extract column number from YAML parse error
 */
function extractColumnNumber(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const yamlError = error as { mark?: { column?: number }; column?: number };
    if (yamlError.mark?.column !== undefined) {
      return yamlError.mark.column + 1; // 0-based to 1-based
    }
    if (yamlError.column !== undefined) {
      return yamlError.column;
    }
  }
  return undefined;
}

/**
 * Count the number of lines in the frontmatter section
 * Returns the line number where content starts (1-indexed)
 */
function getContentStartLine(rawContent: string): number {
  // Find the opening ---
  const openingMatch = rawContent.match(/^---\r?\n/);
  if (!openingMatch) {
    return 1; // No frontmatter, content starts at line 1
  }

  // Find the closing ---
  const afterOpening = rawContent.slice(openingMatch[0].length);
  const closingMatch = afterOpening.match(/\r?\n---\r?\n/);

  if (!closingMatch) {
    return 1; // Malformed frontmatter
  }

  // Count lines in frontmatter section
  const frontmatterSection = rawContent.slice(
    0,
    openingMatch[0].length + (closingMatch.index ?? 0) + closingMatch[0].length
  );
  const lines = frontmatterSection.split(/\r?\n/).length;

  return lines;
}

/**
 * Extract the raw frontmatter string (without delimiters)
 */
function extractRawFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match?.[1] ?? '';
}

/**
 * Parse frontmatter from markdown content
 *
 * @param content - The markdown content to parse
 * @returns Result containing parsed frontmatter or error with line information
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  content: string
): Result<ParsedFrontmatter<T>, FrontmatterParseError> {
  // Handle empty content
  if (!content || content.trim() === '') {
    return ok({
      data: {} as T,
      content: '',
      isEmpty: true,
      contentStartLine: 1,
      rawFrontmatter: '',
    });
  }

  // Check if content has frontmatter
  if (!hasFrontmatter(content)) {
    return ok({
      data: {} as T,
      content: content,
      isEmpty: true,
      contentStartLine: 1,
      rawFrontmatter: '',
    });
  }

  try {
    const result = matter(content);

    const isEmpty = Object.keys(result.data).length === 0;
    const contentStartLine = getContentStartLine(content);
    const rawFrontmatter = extractRawFrontmatter(content);

    return ok({
      data: result.data as T,
      content: result.content,
      isEmpty,
      contentStartLine,
      rawFrontmatter,
    });
  } catch (error) {
    const line = extractLineNumber(error);
    const column = extractColumnNumber(error);
    const message = error instanceof Error ? error.message : 'Failed to parse frontmatter';

    // Build error object with only defined properties (for exactOptionalPropertyTypes)
    const parseError: FrontmatterParseError = {
      message: `Failed to parse YAML frontmatter: ${message}`,
      source: extractRawFrontmatter(content),
    };

    if (line !== undefined) {
      parseError.line = line + 1; // +1 for the opening ---
    }
    if (column !== undefined) {
      parseError.column = column;
    }

    return err(parseError);
  }
}

/**
 * Validate that frontmatter contains required fields
 *
 * @param data - The parsed frontmatter data
 * @param requiredFields - Array of required field names
 * @returns Array of missing field names, empty if all present
 */
export function validateRequiredFields(
  data: Record<string, unknown>,
  requiredFields: string[]
): string[] {
  return requiredFields.filter((field) => data[field] === undefined);
}

/**
 * Apply default values to parsed frontmatter
 *
 * @param data - The parsed frontmatter data
 * @param defaults - Default values to apply
 * @returns Merged data with defaults applied for missing fields
 */
export function applyDefaults<T extends Record<string, unknown>>(
  data: Partial<T>,
  defaults: Partial<T>
): T {
  const result = { ...defaults } as T;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return result;
}

/**
 * Format a frontmatter parse error for display
 */
export function formatParseError(error: FrontmatterParseError, filePath?: string): string {
  let location = '';
  if (error.line !== undefined) {
    location = `:${error.line}`;
    if (error.column !== undefined) {
      location += `:${error.column}`;
    }
  }

  const prefix = filePath ? `${filePath}${location}: ` : location ? `Line ${error.line}: ` : '';

  return `${prefix}${error.message}`;
}
