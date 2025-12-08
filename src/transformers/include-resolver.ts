/**
 * @file Include Resolver
 * @description Resolve @include directives in markdown content.
 */

import path from 'node:path';

import { readFile, resolvePath } from '../utils/fs.js';
import { err, ok, type Result } from '../utils/result.js';

const INCLUDE_PATTERN = /^[ \t]*@include\s+(.+\.md)\s*$/gm;

/**
 * Options for resolving includes
 */
export interface ResolveIncludesOptions {
  /** Base directory for resolving relative paths (usually the rule file's directory) */
  baseDir: string;
  /** Maximum depth of nested includes (default: 10) */
  maxDepth?: number;
  /** Optional callback for each resolved include (for logging/debugging) */
  onInclude?: (includePath: string, resolvedPath: string) => void;
}

/**
 * Result of resolving includes in content
 */
export interface ResolveIncludesResult {
  /** The content with all includes resolved (inlined) */
  content: string;
  /** List of all files that were included (in resolution order) */
  includedFiles: string[];
  /** Whether any includes were found and resolved */
  hasIncludes: boolean;
}

/**
 * Error types for include resolution
 */
export type IncludeErrorCode = 'CIRCULAR_INCLUDE' | 'FILE_NOT_FOUND' | 'MAX_DEPTH_EXCEEDED' | 'READ_ERROR';

/**
 * Include resolution error
 */
export interface IncludeError {
  code: IncludeErrorCode;
  message: string;
  /** The include path that caused the error */
  includePath: string;
  /** The file that contained the problematic include */
  sourceFile: string;
  /** Include chain leading to this error (for circular includes) */
  chain?: string[];
}

interface IncludeMatch {
  path: string;
  start: number;
  end: number;
  line: string;
}

/**
 * Resolve all @include directives in content
 *
 * @param content - The markdown content (body only, frontmatter already removed)
 * @param sourceFile - Path to the file containing this content
 * @param options - Resolution options
 * @returns Result with resolved content or error
 */
export async function resolveIncludes(
  content: string,
  sourceFile: string,
  options: ResolveIncludesOptions
): Promise<Result<ResolveIncludesResult, IncludeError>> {
  const visited = new Set<string>();
  const includedFiles: string[] = [];
  const maxDepth = options.maxDepth ?? 10;
  const baseDir = options.baseDir;

  return resolveIncludesRecursive(
    content,
    sourceFile,
    baseDir,
    visited,
    includedFiles,
    0,
    maxDepth,
    options.onInclude
  );
}

/**
 * Recursively resolve includes in content
 */
async function resolveIncludesRecursive(
  content: string,
  currentFile: string,
  baseDir: string,
  visited: Set<string>,
  includedFiles: string[],
  depth: number,
  maxDepth: number,
  onInclude?: (includePath: string, resolvedPath: string) => void
): Promise<Result<ResolveIncludesResult, IncludeError>> {
  const normalizedPath = normalizeFilePath(currentFile, baseDir);

  if (depth > maxDepth) {
    return err({
      code: 'MAX_DEPTH_EXCEEDED',
      message: `Include depth exceeded ${maxDepth}`,
      includePath: normalizedPath,
      sourceFile: normalizedPath,
    });
  }

  if (visited.has(normalizedPath)) {
    return err({
      code: 'CIRCULAR_INCLUDE',
      message: `Circular include detected: ${normalizedPath}`,
      includePath: normalizedPath,
      sourceFile: normalizedPath,
      chain: [...visited, normalizedPath],
    });
  }

  visited.add(normalizedPath);

  const includes = findIncludes(content);

  if (includes.length === 0) {
    return ok({
      content,
      includedFiles: [...includedFiles],
      hasIncludes: false,
    });
  }

  let resolvedContent = content;
  let offset = 0;

  for (const include of includes) {
    const resolvedPath = resolveIncludePath(include.path, normalizedPath);
    const startLength = includedFiles.length;

    const readResult = await readFile(resolvedPath);
    if (!readResult.ok) {
      const message = readResult.error instanceof Error ? readResult.error.message : String(readResult.error);
      const isMissing = message.includes('ENOENT');

      return err({
        code: isMissing ? 'FILE_NOT_FOUND' : 'READ_ERROR',
        message: isMissing ? `Include file not found: ${include.path}` : message,
        includePath: include.path,
        sourceFile: normalizedPath,
      });
    }

    const includedContent = extractBodyContent(readResult.value);

    includedFiles.push(resolvedPath);

    const nestedResult = await resolveIncludesRecursive(
      includedContent,
      resolvedPath,
      path.dirname(resolvedPath),
      new Set(visited),
      includedFiles,
      depth + 1,
      maxDepth,
      onInclude
    );

    if (!nestedResult.ok) {
      includedFiles.splice(startLength);
      return nestedResult;
    }

    if (onInclude) {
      onInclude(include.path, resolvedPath);
    }

    const start = include.start + offset;
    const end = include.end + offset;

    resolvedContent = `${resolvedContent.slice(0, start)}${nestedResult.value.content}${resolvedContent.slice(end)}`;
    offset += nestedResult.value.content.length - (include.end - include.start);

  }

  return ok({
    content: resolvedContent,
    includedFiles: [...includedFiles],
    hasIncludes: true,
  });
}

/**
 * Find all include directives in content
 */
export function findIncludes(content: string): IncludeMatch[] {
  const includes: IncludeMatch[] = [];
  const pattern = new RegExp(INCLUDE_PATTERN);
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const includePath = match[1];
    if (!includePath) {
      continue;
    }

    includes.push({
      path: includePath.trim(),
      start: match.index,
      end: match.index + match[0].length,
      line: match[0],
    });
  }

  return includes;
}

/**
 * Extract body content, skipping frontmatter if present
 */
export function extractBodyContent(content: string): string {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) {
    return content;
  }

  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (match) {
    return content.slice(match[0].length);
  }

  return content;
}

/**
 * Resolve include path relative to the source file
 */
function resolveIncludePath(includePath: string, sourceFile: string): string {
  const sourceDir = path.dirname(sourceFile);
  return resolvePath(sourceDir, includePath);
}

/**
 * Normalize file path relative to the base directory
 */
function normalizeFilePath(filePath: string, baseDir: string): string {
  if (path.isAbsolute(filePath)) {
    return path.resolve(filePath);
  }

  return resolvePath(baseDir, filePath);
}
