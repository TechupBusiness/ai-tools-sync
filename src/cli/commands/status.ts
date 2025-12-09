import * as path from 'node:path';

import { fileExists } from '../../utils/fs.js';
import { type ManifestV2, readManifest, isFileModified } from '../../utils/manifest.js';
import {
  printHeader,
  printSummary,
  printWarning,
  printSubHeader,
  printListItem,
  printNewLine,
} from '../output.js';

/**
 * Options for the status command
 */
export interface StatusOptions {
  /** Enable verbose output (show all files, not just modified) */
  verbose?: boolean | undefined;
  /** Project root directory */
  projectRoot?: string | undefined;
  /** Configuration directory name */
  configDir?: string | undefined;
}

/**
 * Status of a single generated file
 */
export interface FileStatus {
  path: string;
  status: 'unchanged' | 'modified' | 'missing' | 'unknown';
}

/**
 * Result of the status command
 */
export interface StatusResult {
  success: boolean;
  /** Total files tracked in manifest */
  totalFiles: number;
  /** Files that are unchanged since generation */
  unchangedFiles: number;
  /** Files that have been modified by user */
  modifiedFiles: number;
  /** Files that no longer exist */
  missingFiles: number;
  /** Detailed file statuses (populated when verbose) */
  files?: FileStatus[];
  /** Duration in milliseconds */
  duration: number;
}

/**
 * Show status of generated files
 */
export async function status(options: StatusOptions = {}): Promise<StatusResult> {
  const startTime = Date.now();
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());

  printHeader('AI Tool Sync Status');

  const manifestResult = await readManifest(projectRoot);
  if (!manifestResult.ok) {
    const message =
      manifestResult.error instanceof Error
        ? manifestResult.error.message
        : String(manifestResult.error);
    printWarning(`Failed to read manifest: ${message}`);
    printSummary({
      success: false,
      message: 'Status failed',
      duration: Date.now() - startTime,
    });
    return {
      success: false,
      totalFiles: 0,
      unchangedFiles: 0,
      modifiedFiles: 0,
      missingFiles: 0,
      duration: Date.now() - startTime,
    };
  }

  const manifest = manifestResult.value;
  if (!manifest) {
    printWarning('No generated files tracked');
    printSummary({
      success: true,
      message: 'No generated files tracked',
      duration: Date.now() - startTime,
    });
    return {
      success: true,
      totalFiles: 0,
      unchangedFiles: 0,
      modifiedFiles: 0,
      missingFiles: 0,
      duration: Date.now() - startTime,
    };
  }

  if (manifest.files.length === 0) {
    printWarning('No generated files found');
    printSummary({
      success: true,
      message: 'No generated files found',
      duration: Date.now() - startTime,
    });
    return {
      success: true,
      totalFiles: 0,
      unchangedFiles: 0,
      modifiedFiles: 0,
      missingFiles: 0,
      duration: Date.now() - startTime,
    };
  }

  const statuses = await getFileStatuses(projectRoot, manifest);

  const counts = summarizeStatuses(statuses);

  printSubHeader('Summary');
  printListItem(`Generated files: ${counts.total}`);
  printListItem(`Unchanged: ${counts.unchanged}`);
  printListItem(`Modified: ${counts.modified}`);
  printListItem(`Missing: ${counts.missing}`);
  if (counts.unknown > 0) {
    printListItem(`Unknown: ${counts.unknown}`);
  }

  if (options.verbose) {
    printNewLine();
    printSubHeader('Files');
    for (const entry of statuses) {
      const prefix =
        entry.status === 'modified'
          ? '⚠'
          : entry.status === 'missing'
            ? '✗'
            : entry.status === 'unknown'
              ? '?'
              : '✓';
      printListItem(`${prefix} ${entry.path} (${entry.status})`);
    }
  }

  printSummary({
    success: true,
    message: 'Status complete',
    duration: Date.now() - startTime,
  });

  const result: StatusResult = {
    success: true,
    totalFiles: counts.total,
    unchangedFiles: counts.unchanged,
    modifiedFiles: counts.modified,
    missingFiles: counts.missing,
    duration: Date.now() - startTime,
  };

  if (options.verbose) {
    result.files = statuses;
  }

  return result;
}

async function getFileStatuses(projectRoot: string, manifest: ManifestV2): Promise<FileStatus[]> {
  const statuses: FileStatus[] = [];

  for (const entry of manifest.files) {
    const filePath = path.join(projectRoot, entry.path);

    if (!(await fileExists(filePath))) {
      statuses.push({ path: entry.path, status: 'missing' });
      continue;
    }

    const modifiedResult = await isFileModified(projectRoot, entry);
    if (!modifiedResult.ok) {
      statuses.push({ path: entry.path, status: 'missing' });
      continue;
    }

    statuses.push({
      path: entry.path,
      status: modifiedResult.value ? 'modified' : 'unchanged',
    });
  }

  return statuses;
}

function summarizeStatuses(statuses: FileStatus[]): {
  total: number;
  unchanged: number;
  modified: number;
  missing: number;
  unknown: number;
} {
  return statuses.reduce(
    (acc, curr) => {
      acc.total += 1;
      switch (curr.status) {
        case 'unchanged':
          acc.unchanged += 1;
          break;
        case 'modified':
          acc.modified += 1;
          break;
        case 'missing':
          acc.missing += 1;
          break;
        case 'unknown':
          acc.unknown += 1;
          break;
      }
      return acc;
    },
    { total: 0, unchanged: 0, modified: 0, missing: 0, unknown: 0 }
  );
}
