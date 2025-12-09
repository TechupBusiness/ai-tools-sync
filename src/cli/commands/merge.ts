/**
 * @file Merge Command
 * @description Merge input files from .ai-tool-sync/input/ into configuration
 *
 * This command processes files from the input/ folder (populated by migrate or
 * manual import), compares them with existing content, and helps users merge
 * imported content into their configuration.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as readline from 'node:readline';

import pc from 'picocolors';

import { getAiPaths, resolveConfigDir } from '../../config/loader.js';
import { parseCommand } from '../../parsers/command.js';
import { parseFrontmatter } from '../../parsers/frontmatter.js';
import { parseHook } from '../../parsers/hook.js';
import { parsePersona } from '../../parsers/persona.js';
import { parseRule } from '../../parsers/rule.js';
import { copyFile, ensureDir, glob, readFile, toPosixPath } from '../../utils/fs.js';
import { logger } from '../../utils/logger.js';
import {
  createSpinner,
  printError,
  printHeader,
  printInfo,
  printKeyValue,
  printListItem,
  printNewLine,
  printSubHeader,
  printSuccess,
  printSummary,
  printWarning,
} from '../output.js';

/**
 * Content difference status
 */
export type DiffStatus =
  | 'new' // File doesn't exist in target
  | 'modified' // File exists with different content
  | 'identical' // File exists with same content
  | 'conflict' // Cannot auto-merge (e.g., different names, same path)
  | 'invalid'; // Cannot be parsed

/**
 * Analyzed input file
 */
export interface InputFile {
  /** Path relative to input/ folder */
  relativePath: string;
  /** Absolute path to input file */
  inputPath: string;
  /** Detected content type */
  contentType: 'rule' | 'persona' | 'command' | 'hook' | 'unknown';
  /** Target folder for this content type */
  targetFolder: string;
  /** Expected output path */
  targetPath: string;
  /** Comparison status */
  status: DiffStatus;
  /** Parsed frontmatter name (if available) */
  name?: string;
  /** Parse errors if invalid */
  parseErrors?: string[];
  /** Diff details for modified files */
  diffDetails?: DiffDetails;
}

/**
 * Diff details between input and existing file
 */
export interface DiffDetails {
  /** Frontmatter field changes */
  frontmatterChanges: FieldChange[];
  /** Content has changed */
  contentChanged: boolean;
  /** Summary of content changes */
  contentSummary?: string;
}

/**
 * Single field change in frontmatter
 */
export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Options for merge command
 */
export interface MergeOptions {
  projectRoot?: string;
  configDir?: string;
  dryRun?: boolean;
  verbose?: boolean;
  yes?: boolean;
  file?: string;
}

/**
 * Result of merge command
 */
export interface MergeResult {
  success: boolean;
  /** Files analyzed */
  analyzed: InputFile[];
  /** Files merged */
  merged: string[];
  /** Files skipped */
  skipped: string[];
  /** Errors encountered */
  errors: string[];
}

/**
 * Prompt user for input (simple readline wrapper)
 */
async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    rl.question(`${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * Discover input files
 */
async function discoverInputFiles(aiDir: string): Promise<string[]> {
  const inputDir = path.join(aiDir, 'input');

  // Check if input directory exists
  const exists = await fs
    .stat(inputDir)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    return [];
  }

  // Glob all markdown files
  const files = await glob('**/*.md', {
    cwd: inputDir,
    absolute: true,
    dot: false,
  });

  return files;
}

/**
 * Detect content type from file content
 */
function detectContentType(
  content: string,
  relativePath: string
): 'rule' | 'persona' | 'command' | 'hook' | 'unknown' {
  // Parse frontmatter to check for discriminating fields
  const fmResult = parseFrontmatter<Record<string, unknown>>(content);

  if (fmResult.ok && !fmResult.value.isEmpty) {
    const data = fmResult.value.data;

    // Check for hook-specific field (event is unique to hooks)
    if (data.event !== undefined) {
      const hookResult = parseHook(content);
      if (hookResult.ok) return 'hook';
    }

    // Check for command-specific fields (execute is unique to commands)
    if (data.execute !== undefined) {
      const commandResult = parseCommand(content);
      if (commandResult.ok) return 'command';
    }

    // Check for persona-specific fields (tools/model are more specific to personas)
    if (data.tools !== undefined || data.model !== undefined) {
      const personaResult = parsePersona(content);
      if (personaResult.ok) return 'persona';
    }

    // Check for rule-specific fields (globs/always_apply are specific to rules)
    if (
      data.globs !== undefined ||
      data.always_apply !== undefined ||
      data.alwaysApply !== undefined
    ) {
      const ruleResult = parseRule(content);
      if (ruleResult.ok) return 'rule';
    }
  }

  // Try each parser as fallback
  const hookResult = parseHook(content);
  if (hookResult.ok) return 'hook';

  const commandResult = parseCommand(content);
  if (commandResult.ok) return 'command';

  const personaResult = parsePersona(content);
  if (personaResult.ok) return 'persona';

  const ruleResult = parseRule(content);
  if (ruleResult.ok) return 'rule';

  // Fall back to path-based detection
  const lowerPath = relativePath.toLowerCase();
  if (lowerPath.includes('rule') || lowerPath.includes('skill')) return 'rule';
  if (lowerPath.includes('persona') || lowerPath.includes('agent') || lowerPath.includes('droid'))
    return 'persona';
  if (lowerPath.includes('command')) return 'command';
  if (lowerPath.includes('hook')) return 'hook';

  return 'unknown';
}

/**
 * Get target folder for content type
 */
function getTargetFolder(contentType: string, aiDir: string): string {
  switch (contentType) {
    case 'rule':
      return path.join(aiDir, 'rules');
    case 'persona':
      return path.join(aiDir, 'personas');
    case 'command':
      return path.join(aiDir, 'commands');
    case 'hook':
      return path.join(aiDir, 'hooks');
    default:
      return path.join(aiDir, 'input');
  }
}

/**
 * Analyze a single file
 */
function analyzeFile(
  content: string,
  relativePath: string,
  inputPath: string,
  aiDir: string
): InputFile {
  // Detect content type
  const contentType = detectContentType(content, relativePath);
  const targetFolder = getTargetFolder(contentType, aiDir);

  // Extract name from frontmatter if possible
  let name: string | undefined;
  const fmResult = parseFrontmatter<Record<string, unknown>>(content);
  if (fmResult.ok && !fmResult.value.isEmpty) {
    name = fmResult.value.data.name as string | undefined;
  }

  // Determine target filename
  const fileName = name ? `${name}.md` : path.basename(relativePath);
  const targetPath = path.join(targetFolder, fileName);

  const result: InputFile = {
    relativePath,
    inputPath,
    contentType,
    targetFolder,
    targetPath,
    status: 'new', // Will be updated by comparison
  };

  // Only set name if it exists
  if (name !== undefined) {
    result.name = name;
  }

  return result;
}

/**
 * Compute diff between two file contents
 */
function computeDiff(existing: string, incoming: string): DiffDetails {
  const existingFm = parseFrontmatter<Record<string, unknown>>(existing);
  const incomingFm = parseFrontmatter<Record<string, unknown>>(incoming);

  const frontmatterChanges: FieldChange[] = [];

  if (existingFm.ok && incomingFm.ok) {
    const allKeys = new Set([
      ...Object.keys(existingFm.value.data),
      ...Object.keys(incomingFm.value.data),
    ]);

    for (const key of allKeys) {
      const oldVal = existingFm.value.data[key];
      const newVal = incomingFm.value.data[key];

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        frontmatterChanges.push({
          field: key,
          oldValue: oldVal,
          newValue: newVal,
        });
      }
    }
  }

  const contentChanged =
    existingFm.ok && incomingFm.ok
      ? existingFm.value.content !== incomingFm.value.content
      : existing !== incoming;

  const result: DiffDetails = {
    frontmatterChanges,
    contentChanged,
  };

  // Only set contentSummary if content actually changed
  if (contentChanged) {
    result.contentSummary = `Content differs (${existing.length} → ${incoming.length} chars)`;
  }

  return result;
}

/**
 * Compare input file with existing content
 */
async function compareWithExisting(inputFile: InputFile): Promise<void> {
  // Check if target exists
  const targetExists = await fs
    .stat(inputFile.targetPath)
    .then(() => true)
    .catch(() => false);

  if (!targetExists) {
    inputFile.status = 'new';
    return;
  }

  // Read existing file
  const existingResult = await readFile(inputFile.targetPath);
  if (!existingResult.ok) {
    inputFile.status = 'conflict';
    return;
  }

  const inputContent = await readFile(inputFile.inputPath);
  if (!inputContent.ok) {
    inputFile.status = 'invalid';
    return;
  }

  // Compare contents
  if (existingResult.value === inputContent.value) {
    inputFile.status = 'identical';
    return;
  }

  // Parse and compare frontmatter
  inputFile.status = 'modified';
  inputFile.diffDetails = computeDiff(existingResult.value, inputContent.value);
}

/**
 * Analyze input files
 */
async function analyzeInputFiles(files: string[], aiDir: string): Promise<InputFile[]> {
  const results: InputFile[] = [];
  const inputDir = path.join(aiDir, 'input');

  for (const filePath of files) {
    const relativePath = toPosixPath(path.relative(inputDir, filePath));
    const contentResult = await readFile(filePath);

    if (!contentResult.ok) {
      results.push({
        relativePath,
        inputPath: filePath,
        contentType: 'unknown',
        targetFolder: '',
        targetPath: '',
        status: 'invalid',
        parseErrors: [contentResult.error.message],
      });
      continue;
    }

    const content = contentResult.value;
    const analyzed = analyzeFile(content, relativePath, filePath, aiDir);

    // Compare with existing
    await compareWithExisting(analyzed);

    results.push(analyzed);
  }

  return results;
}

/**
 * Print merge report
 */
function printMergeReport(files: InputFile[], verbose?: boolean): void {
  // Group by status
  const byStatus = {
    new: files.filter((f) => f.status === 'new'),
    modified: files.filter((f) => f.status === 'modified'),
    identical: files.filter((f) => f.status === 'identical'),
    conflict: files.filter((f) => f.status === 'conflict'),
    invalid: files.filter((f) => f.status === 'invalid'),
  };

  printSubHeader('Analysis Results');

  // New files (ready to add)
  if (byStatus.new.length > 0) {
    printNewLine();
    printInfo(pc.green(`New files (${byStatus.new.length}):`));
    for (const f of byStatus.new) {
      const targetRelPath = path.relative(path.dirname(path.dirname(f.targetPath)), f.targetPath);
      printListItem(`${f.relativePath} → ${targetRelPath}`);
    }
  }

  // Modified files (need review)
  if (byStatus.modified.length > 0) {
    printNewLine();
    printInfo(pc.yellow(`Modified files (${byStatus.modified.length}):`));
    for (const f of byStatus.modified) {
      printListItem(`${f.relativePath}`);
      if (verbose && f.diffDetails) {
        for (const change of f.diffDetails.frontmatterChanges) {
          printListItem(
            `${change.field}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`,
            1
          );
        }
        if (f.diffDetails.contentChanged) {
          printListItem(f.diffDetails.contentSummary ?? 'Content changed', 1);
        }
      }
    }
  }

  // Identical files (can skip)
  if (byStatus.identical.length > 0) {
    printNewLine();
    printInfo(pc.dim(`Identical files (${byStatus.identical.length}):`));
    for (const f of byStatus.identical) {
      printListItem(pc.dim(f.relativePath));
    }
  }

  // Conflicts
  if (byStatus.conflict.length > 0) {
    printNewLine();
    printWarning(`Conflicts (${byStatus.conflict.length}):`);
    for (const f of byStatus.conflict) {
      printListItem(f.relativePath);
    }
  }

  // Invalid
  if (byStatus.invalid.length > 0) {
    printNewLine();
    printError(`Invalid files (${byStatus.invalid.length}):`);
    for (const f of byStatus.invalid) {
      printListItem(`${f.relativePath}: ${f.parseErrors?.join(', ')}`);
    }
  }

  // Summary
  printNewLine();
  printKeyValue('Ready to merge', (byStatus.new.length + byStatus.modified.length).toString());
  printKeyValue('Skippable', byStatus.identical.length.toString());
  printKeyValue('Need attention', (byStatus.conflict.length + byStatus.invalid.length).toString());
}

/**
 * Show full diff for a file
 */
function showFullDiff(file: InputFile): void {
  printNewLine();
  printInfo('=== Diff Details ===');
  printInfo(`File: ${file.relativePath}`);
  printInfo(`Target: ${path.relative(process.cwd(), file.targetPath)}`);

  if (file.diffDetails) {
    if (file.diffDetails.frontmatterChanges.length > 0) {
      printNewLine();
      printInfo('Frontmatter changes:');
      for (const change of file.diffDetails.frontmatterChanges) {
        printListItem(`${change.field}:`);
        printListItem(`- ${JSON.stringify(change.oldValue)}`, 1);
        printListItem(`+ ${JSON.stringify(change.newValue)}`, 1);
      }
    }

    if (file.diffDetails.contentChanged) {
      printNewLine();
      printInfo('Content: Changed');
      if (file.diffDetails.contentSummary) {
        printListItem(file.diffDetails.contentSummary);
      }
    }
  }

  printInfo('=== End Diff ===');
  printNewLine();
}

/**
 * Perform merge operation
 */
async function performMerge(files: InputFile[], options: MergeOptions): Promise<MergeResult> {
  const result: MergeResult = {
    success: true,
    analyzed: files,
    merged: [],
    skipped: [],
    errors: [],
  };

  const mergeable = files.filter((f) => f.status === 'new' || f.status === 'modified');

  if (mergeable.length === 0) {
    printInfo('No files to merge.');
    return result;
  }

  printNewLine();
  printSubHeader('Merge Phase');

  for (const file of mergeable) {
    // Skip if not in interactive mode and file is modified
    if (!options.yes && file.status === 'modified') {
      const action = await prompt(`Merge ${file.relativePath}? (y)es, (n)o, (d)iff`, 'y');

      if (action.toLowerCase() === 'n') {
        result.skipped.push(file.relativePath);
        printInfo(`Skipped: ${file.relativePath}`);
        continue;
      }

      if (action.toLowerCase() === 'd') {
        // Show full diff
        showFullDiff(file);
        const confirm = await prompt('Merge this file?', 'y');
        if (confirm.toLowerCase() !== 'y') {
          result.skipped.push(file.relativePath);
          printInfo(`Skipped: ${file.relativePath}`);
          continue;
        }
      }
    }

    // Perform merge
    try {
      await ensureDir(path.dirname(file.targetPath));
      await copyFile(file.inputPath, file.targetPath);
      result.merged.push(file.relativePath);
      printSuccess(`Merged: ${file.relativePath}`);

      // Remove from input/
      await fs.unlink(file.inputPath);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to merge ${file.relativePath}: ${errorMsg}`);
      printError(`Failed: ${file.relativePath}`);
    }
  }

  return result;
}

/**
 * Execute the merge command
 */
export async function merge(options: MergeOptions = {}): Promise<MergeResult> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const configDirName = options.configDir ?? (await resolveConfigDir({ projectRoot }));
  const paths = getAiPaths(projectRoot, configDirName);

  printHeader('Merge Input Files');

  // Phase 1: Discover input files
  const spinner = createSpinner('Scanning input folder...');
  spinner.start();

  const inputFiles = await discoverInputFiles(paths.aiDir);
  spinner.stop(`Found ${inputFiles.length} files`, true);

  if (inputFiles.length === 0) {
    printInfo('No files found in input/ folder.');
    printSummary({
      success: true,
      message: 'No files to process',
    });
    return { success: true, analyzed: [], merged: [], skipped: [], errors: [] };
  }

  // Phase 2: Analyze and compare
  const analyzeSpinner = createSpinner('Analyzing files...');
  analyzeSpinner.start();

  const analyzed = await analyzeInputFiles(inputFiles, paths.aiDir);
  analyzeSpinner.stop('Analysis complete', true);

  // Phase 3: Report
  printMergeReport(analyzed, options.verbose);

  // Phase 4: Merge (if not dry-run)
  if (options.dryRun) {
    printSummary({
      success: true,
      message: 'Dry run complete - no files were modified',
      dryRun: true,
    });
    return { success: true, analyzed, merged: [], skipped: [], errors: [] };
  }

  const mergeResult = await performMerge(analyzed, options);

  // Final summary
  printSummary({
    success: mergeResult.errors.length === 0,
    message:
      mergeResult.errors.length === 0
        ? `Merge complete - ${mergeResult.merged.length} files merged`
        : `Merge completed with ${mergeResult.errors.length} errors`,
  });

  if (mergeResult.merged.length > 0) {
    printNewLine();
    logger.info('Next steps:');
    logger.list('Run ai-sync to regenerate tool configurations');
    logger.list('Test the merged content in your AI tools');
  }

  return mergeResult;
}
