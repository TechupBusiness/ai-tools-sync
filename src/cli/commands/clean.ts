import * as path from 'node:path';

import { deleteFile, fileExists } from '../../utils/fs.js';
import { type ManifestV2, readManifest, isFileModified } from '../../utils/manifest.js';
import {
  printHeader,
  printSummary,
  printWarning,
  printSuccess,
  printSubHeader,
  printListItem,
  printNewLine,
} from '../output.js';

/**
 * Options for the clean command
 */
export interface CleanOptions {
  /** Enable verbose output */
  verbose?: boolean | undefined;
  /** Force removal of modified files */
  force?: boolean | undefined;
  /** Dry run mode - show what would be deleted */
  dryRun?: boolean | undefined;
  /** Project root directory */
  projectRoot?: string | undefined;
  /** Configuration directory name */
  configDir?: string | undefined;
}

/**
 * Result of the clean command
 */
export interface CleanResult {
  success: boolean;
  /** Files that were deleted */
  deleted: string[];
  /** Files skipped because they were modified by user */
  skipped: string[];
  /** Files that no longer exist (already cleaned) */
  missing: string[];
  /** Errors encountered during cleanup */
  errors: string[];
  /** Duration in milliseconds */
  duration: number;
}

/**
 * Remove generated files with safety checks
 */
export async function clean(options: CleanOptions = {}): Promise<CleanResult> {
  const startTime = Date.now();
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());

  printHeader('AI Tool Sync Clean');

  if (options.dryRun) {
    printWarning('Dry run - no files will be deleted');
    printNewLine();
  }

  const manifestResult = await readManifest(projectRoot);
  if (!manifestResult.ok) {
    const message = manifestResult.error instanceof Error ? manifestResult.error.message : String(manifestResult.error);
    printWarning(`Failed to read manifest: ${message}`);
    printSummary({
      success: false,
      message: 'Clean failed',
      duration: Date.now() - startTime,
      dryRun: options.dryRun,
    });
    return {
      success: false,
      deleted: [],
      skipped: [],
      missing: [],
      errors: [message],
      duration: Date.now() - startTime,
    };
  }

  const manifest = manifestResult.value;
  if (!manifest) {
    printSuccess('Nothing to clean');
    printSummary({
      success: true,
      message: 'Nothing to clean',
      duration: Date.now() - startTime,
      dryRun: options.dryRun,
    });
    return {
      success: true,
      deleted: [],
      skipped: [],
      missing: [],
      errors: [],
      duration: Date.now() - startTime,
    };
  }

  if (manifest.files.length === 0) {
    printSuccess('No generated files found');
    printSummary({
      success: true,
      message: 'No generated files found',
      duration: Date.now() - startTime,
      dryRun: options.dryRun,
    });
    return {
      success: true,
      deleted: [],
      skipped: [],
      missing: [],
      errors: [],
      duration: Date.now() - startTime,
    };
  }

  const deleted: string[] = [];
  const skipped: string[] = [];
  const missing: string[] = [];
  const errors: string[] = [];

  await cleanV2({
    manifest,
    projectRoot,
    options,
    deleted,
    skipped,
    missing,
    errors,
  });

  const success = errors.length === 0;

  printSubHeader('Summary');
  printListItem(`Deleted: ${deleted.length}`);
  printListItem(`Skipped: ${skipped.length}`);
  printListItem(`Missing: ${missing.length}`);
  if (errors.length > 0) {
    printListItem(`Errors: ${errors.length}`);
  }

  printSummary({
    success,
    message: success
      ? `Cleaned ${deleted.length} file${deleted.length === 1 ? '' : 's'}`
      : 'Clean completed with errors',
    duration: Date.now() - startTime,
    dryRun: options.dryRun,
  });

  return {
    success,
    deleted,
    skipped,
    missing,
    errors,
    duration: Date.now() - startTime,
  };
}

async function cleanV2(params: {
  manifest: ManifestV2;
  projectRoot: string;
  options: CleanOptions;
  deleted: string[];
  skipped: string[];
  missing: string[];
  errors: string[];
}): Promise<void> {
  const {
    manifest,
    projectRoot,
    options,
    deleted,
    skipped,
    missing,
    errors,
  }: {
    manifest: ManifestV2;
    projectRoot: string;
    options: CleanOptions;
    deleted: string[];
    skipped: string[];
    missing: string[];
    errors: string[];
  } = params;

  if (options.force) {
    printWarning('Force mode - modified files will be removed');
    printNewLine();
  }

  printSubHeader('Removing generated files...');

  for (const entry of manifest.files) {
    const filePath = path.join(projectRoot, entry.path);

    if (!(await fileExists(filePath))) {
      missing.push(entry.path);
      printListItem(`Already missing: ${entry.path}`);
      continue;
    }

    const modifiedResult = await isFileModified(projectRoot, entry);
    if (!modifiedResult.ok) {
      const message = `Failed to check ${entry.path}: ${
        modifiedResult.error instanceof Error ? modifiedResult.error.message : String(modifiedResult.error)
      }`;
      errors.push(message);
      printWarning(message);
      continue;
    }

    if (modifiedResult.value && !options.force) {
      skipped.push(entry.path);
      printWarning(`Skipping modified file: ${entry.path}`);
      continue;
    }

    if (modifiedResult.value && options.force) {
      printWarning(`Removing modified file: ${entry.path} (user changes will be lost)`);
    } else {
      printListItem(`Deleting: ${entry.path}`);
    }

    if (options.dryRun) {
      continue;
    }

    const deleteResult = await deleteFile(filePath);
    if (deleteResult.ok) {
      deleted.push(entry.path);
    } else {
      const message = `Failed to delete ${entry.path}: ${
        deleteResult.error instanceof Error ? deleteResult.error.message : String(deleteResult.error)
      }`;
      errors.push(message);
      printWarning(message);
    }
  }
}

