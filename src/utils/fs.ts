/**
 * @file File System Utilities
 * @description Async file operations, directory traversal, and path utilities
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import fg from 'fast-glob';

import { type Result, err, ok, tryCatchAsync } from './result.js';

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists
 */
export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Read a file as string
 */
export async function readFile(filePath: string): Promise<Result<string>> {
  return tryCatchAsync(
    () => fs.readFile(filePath, 'utf-8'),
    (e) =>
      new Error(`Failed to read file ${filePath}: ${e instanceof Error ? e.message : String(e)}`)
  );
}

/**
 * Write a string to a file, creating directories as needed
 */
export async function writeFile(filePath: string, content: string): Promise<Result<void>> {
  return tryCatchAsync(async () => {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  });
}

/**
 * Delete a file if it exists
 */
export async function deleteFile(filePath: string): Promise<Result<void>> {
  return tryCatchAsync(async () => {
    if (await fileExists(filePath)) {
      await fs.unlink(filePath);
    }
  });
}

/**
 * Create a directory recursively
 */
export async function ensureDir(dirPath: string): Promise<Result<void>> {
  return tryCatchAsync(() => fs.mkdir(dirPath, { recursive: true }).then(() => undefined));
}

/**
 * Delete a directory recursively
 */
export async function removeDir(dirPath: string): Promise<Result<void>> {
  return tryCatchAsync(async () => {
    if (await dirExists(dirPath)) {
      await fs.rm(dirPath, { recursive: true, force: true });
    }
  });
}

/**
 * Copy a file
 */
export async function copyFile(src: string, dest: string): Promise<Result<void>> {
  return tryCatchAsync(async () => {
    const dir = path.dirname(dest);
    await fs.mkdir(dir, { recursive: true });
    await fs.copyFile(src, dest);
  });
}

/**
 * List files in a directory
 */
export async function listFiles(dirPath: string): Promise<Result<string[]>> {
  return tryCatchAsync(async () => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  });
}

/**
 * List directories in a directory
 */
export async function listDirs(dirPath: string): Promise<Result<string[]>> {
  return tryCatchAsync(async () => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  });
}

/**
 * Find files matching a glob pattern
 */
export async function glob(
  patterns: string | string[],
  options?: {
    cwd?: string;
    ignore?: string[];
    absolute?: boolean;
    onlyFiles?: boolean;
    onlyDirectories?: boolean;
    dot?: boolean;
  }
): Promise<string[]> {
  const defaultOptions = {
    onlyFiles: true,
    dot: false,
    ignore: ['**/node_modules/**', '**/.git/**'],
    ...options,
  };

  return fg(patterns, defaultOptions);
}

/**
 * Find markdown files in a directory
 */
export async function findMarkdownFiles(dirPath: string): Promise<string[]> {
  if (!(await dirExists(dirPath))) {
    return [];
  }

  return glob('**/*.md', {
    cwd: dirPath,
    absolute: true,
  });
}

/**
 * Find yaml files in a directory
 */
export async function findYamlFiles(dirPath: string): Promise<string[]> {
  if (!(await dirExists(dirPath))) {
    return [];
  }

  return glob('**/*.{yaml,yml}', {
    cwd: dirPath,
    absolute: true,
  });
}

/**
 * Resolve a path relative to a base directory
 */
export function resolvePath(basePath: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  return path.resolve(basePath, relativePath);
}

/**
 * Get the relative path from one directory to another
 */
export function relativePath(from: string, to: string): string {
  return path.relative(from, to);
}

/**
 * Get file extension without the dot
 */
export function getExtension(filePath: string): string {
  const ext = path.extname(filePath);
  return ext.startsWith('.') ? ext.slice(1) : ext;
}

/**
 * Get filename without extension
 */
export function getBasename(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

/**
 * Join path segments
 */
export function joinPath(...segments: string[]): string {
  return path.join(...segments);
}

/**
 * Get the directory name from a path
 */
export function getDirname(filePath: string): string {
  return path.dirname(filePath);
}

/**
 * Normalize a path (resolve . and ..)
 */
export function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}

/**
 * Check if a path is absolute
 */
export function isAbsolutePath(filePath: string): boolean {
  return path.isAbsolute(filePath);
}

/**
 * Read JSON file
 */
export async function readJson<T>(filePath: string): Promise<Result<T>> {
  const content = await readFile(filePath);
  if (!content.ok) {
    return content;
  }

  try {
    return ok(JSON.parse(content.value) as T);
  } catch (e) {
    return err(
      new Error(
        `Failed to parse JSON from ${filePath}: ${e instanceof Error ? e.message : String(e)}`
      )
    );
  }
}

/**
 * Write JSON file with pretty formatting
 */
export async function writeJson(filePath: string, data: unknown): Promise<Result<void>> {
  const content = JSON.stringify(data, null, 2) + '\n';
  return writeFile(filePath, content);
}
