/**
 * @file Gitignore Utilities
 * @description Manage .gitignore with auto-managed sections for generated files
 *
 * Uses marked sections to allow automatic updates without affecting
 * user-managed entries in the gitignore file.
 */

import * as path from 'node:path';

import { fileExists, readFile, writeFile } from './fs.js';
import { MANIFEST_FILENAME, getGitignorePaths, type Manifest } from './manifest.js';
import { ok, err, type Result } from './result.js';

/**
 * Markers for the auto-managed section
 */
export const GITIGNORE_START_MARKER = '# >>> AI Tool Sync Generated (auto-managed) >>>';
export const GITIGNORE_END_MARKER = '# <<< AI Tool Sync Generated <<<';

/**
 * Options for updating .gitignore
 */
export interface UpdateGitignoreOptions {
  /**
   * Whether to create .gitignore if it doesn't exist
   */
  createIfMissing?: boolean;
}

/**
 * Result of gitignore update
 */
export interface GitignoreUpdateResult {
  /**
   * Whether the gitignore was created (vs updated)
   */
  created: boolean;

  /**
   * Whether any changes were made
   */
  changed: boolean;

  /**
   * Paths that were added to the managed section
   */
  paths: string[];
}

/**
 * Check if content has our managed section
 */
export function hasManagedSection(content: string): boolean {
  return content.includes(GITIGNORE_START_MARKER) && content.includes(GITIGNORE_END_MARKER);
}

/**
 * Extract the managed section from gitignore content
 */
export function extractManagedSection(content: string): string | null {
  const startIndex = content.indexOf(GITIGNORE_START_MARKER);
  const endIndex = content.indexOf(GITIGNORE_END_MARKER);

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    return null;
  }

  return content.slice(
    startIndex + GITIGNORE_START_MARKER.length,
    endIndex
  ).trim();
}

/**
 * Create the managed section content
 */
export function createManagedSection(paths: string[]): string {
  const lines = [
    GITIGNORE_START_MARKER,
    ...paths.map(p => p),
    GITIGNORE_END_MARKER,
  ];
  return lines.join('\n');
}

/**
 * Update gitignore content with new managed section
 * Preserves all content outside the managed section
 */
export function updateGitignoreContent(existingContent: string, paths: string[]): string {
  const newSection = createManagedSection(paths);

  if (hasManagedSection(existingContent)) {
    // Replace existing managed section
    const startIndex = existingContent.indexOf(GITIGNORE_START_MARKER);
    const endIndex = existingContent.indexOf(GITIGNORE_END_MARKER) + GITIGNORE_END_MARKER.length;

    const before = existingContent.slice(0, startIndex);
    const after = existingContent.slice(endIndex);

    // Clean up extra whitespace
    const cleanBefore = before.trimEnd();
    const cleanAfter = after.trimStart();

    // Join with appropriate spacing
    let result = cleanBefore;
    if (result.length > 0) {
      result += '\n\n';
    }
    result += newSection;
    if (cleanAfter.length > 0) {
      result += '\n\n' + cleanAfter;
    } else {
      result += '\n';
    }

    return result;
  } else {
    // Append new managed section
    const trimmed = existingContent.trimEnd();
    if (trimmed.length > 0) {
      return trimmed + '\n\n' + newSection + '\n';
    }
    return newSection + '\n';
  }
}

/**
 * Get default paths for gitignore when no manifest exists
 */
export function getDefaultGitignorePaths(): string[] {
  return [
    '.cursor/rules/',
    '.cursor/commands/',
    '.claude/',
    '.factory/',
    'CLAUDE.md',
    'AGENTS.md',
    'mcp.json',
    MANIFEST_FILENAME,
  ];
}

/**
 * Update .gitignore with generated paths from manifest
 */
export async function updateGitignore(
  projectRoot: string,
  manifest: Manifest | null,
  options: UpdateGitignoreOptions = {}
): Promise<Result<GitignoreUpdateResult>> {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const exists = await fileExists(gitignorePath);

  // Determine paths to add
  const paths = manifest
    ? getGitignorePaths(manifest)
    : getDefaultGitignorePaths();

  // If gitignore doesn't exist
  if (!exists) {
    if (!options.createIfMissing) {
      return ok({
        created: false,
        changed: false,
        paths: [],
      });
    }

    // Create new gitignore with managed section
    const content = createManagedSection(paths) + '\n';
    const result = await writeFile(gitignorePath, content);
    if (!result.ok) {
      return err(result.error);
    }

    return ok({
      created: true,
      changed: true,
      paths,
    });
  }

  // Read existing content
  const existingResult = await readFile(gitignorePath);
  if (!existingResult.ok) {
    return err(existingResult.error);
  }

  const existingContent = existingResult.value;
  const newContent = updateGitignoreContent(existingContent, paths);

  // Check if content changed
  if (existingContent === newContent) {
    return ok({
      created: false,
      changed: false,
      paths,
    });
  }

  // Write updated content
  const writeResult = await writeFile(gitignorePath, newContent);
  if (!writeResult.ok) {
    return err(writeResult.error);
  }

  return ok({
    created: false,
    changed: true,
    paths,
  });
}

/**
 * Remove the managed section from .gitignore
 */
export async function removeManagedSection(projectRoot: string): Promise<Result<boolean>> {
  const gitignorePath = path.join(projectRoot, '.gitignore');

  if (!(await fileExists(gitignorePath))) {
    return ok(false);
  }

  const existingResult = await readFile(gitignorePath);
  if (!existingResult.ok) {
    return err(existingResult.error);
  }

  const existingContent = existingResult.value;

  if (!hasManagedSection(existingContent)) {
    return ok(false);
  }

  // Remove the managed section
  const startIndex = existingContent.indexOf(GITIGNORE_START_MARKER);
  const endIndex = existingContent.indexOf(GITIGNORE_END_MARKER) + GITIGNORE_END_MARKER.length;

  const before = existingContent.slice(0, startIndex);
  const after = existingContent.slice(endIndex);

  // Clean up and join
  const cleanBefore = before.trimEnd();
  const cleanAfter = after.trimStart();

  let newContent = cleanBefore;
  if (cleanBefore.length > 0 && cleanAfter.length > 0) {
    newContent += '\n\n' + cleanAfter;
  } else if (cleanAfter.length > 0) {
    newContent = cleanAfter;
  }

  // Ensure trailing newline
  if (newContent.length > 0 && !newContent.endsWith('\n')) {
    newContent += '\n';
  }

  const writeResult = await writeFile(gitignorePath, newContent);
  if (!writeResult.ok) {
    return err(writeResult.error);
  }

  return ok(true);
}

