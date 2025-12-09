/**
 * @file Migrate Command
 * @description Scan for existing AI tool configurations and help migrate them
 *
 * This command discovers existing AI tool configurations in a project and
 * helps users migrate them to the unified .ai-tool-sync format.
 *
 * Supported discovery:
 * - .cursor/rules/*.mdc (Cursor rules)
 * - .cursorrules (deprecated Cursor format)
 * - CLAUDE.md (manual Claude instructions)
 * - .claude/ directory (Claude Code)
 * - .factory/ directory (Factory)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as readline from 'node:readline';

import { getAiPaths, resolveConfigDir } from '../../config/loader.js';
import { parseFrontmatter, hasFrontmatter } from '../../parsers/frontmatter.js';
import { ensureDir, glob, readFile, writeFile, copyFile } from '../../utils/fs.js';
import { logger } from '../../utils/logger.js';
import {
  printHeader,
  printSubHeader,
  printInfo,
  printSuccess,
  printWarning,
  printError,
  printSummary,
  printNewLine,
  printListItem,
  printKeyValue,
  createSpinner,
} from '../output.js';

/**
 * Discovered file information
 */
export interface DiscoveredFile {
  /** Absolute path to the file */
  path: string;
  /** Relative path from project root */
  relativePath: string;
  /** File size in bytes */
  size: number;
  /** Source platform (cursor, claude, factory, unknown) */
  platform: 'cursor' | 'claude' | 'factory' | 'unknown';
  /** Detected content type */
  contentType: 'rule' | 'persona' | 'command' | 'hook' | 'config' | 'mixed' | 'unknown';
  /** Whether the file has frontmatter */
  hasFrontmatter: boolean;
  /** Parsed frontmatter (if present) */
  frontmatter?: Record<string, unknown> | undefined;
  /** Whether this appears to be a multi-topic file that should be split */
  shouldSplit: boolean;
  /** Detected topics/sections in the file */
  detectedTopics: string[];
  /** Warnings about the file */
  warnings: string[];
}

/**
 * Migration discovery result
 */
export interface DiscoveryResult {
  /** All discovered files */
  files: DiscoveredFile[];
  /** Files grouped by platform */
  byPlatform: {
    cursor: DiscoveredFile[];
    claude: DiscoveredFile[];
    factory: DiscoveredFile[];
    unknown: DiscoveredFile[];
  };
  /** Summary statistics */
  stats: {
    totalFiles: number;
    totalSize: number;
    filesWithFrontmatter: number;
    filesNeedingSplit: number;
    platforms: string[];
  };
  /** Discovery warnings */
  warnings: string[];
}

/**
 * Options for the migrate command
 */
export interface MigrateOptions {
  /** Project root directory */
  projectRoot?: string | undefined;
  /** Configuration directory name (relative to project root) */
  configDir?: string | undefined;
  /** Enable backup before migration */
  backup?: boolean | undefined;
  /** Run in dry-run mode (no changes) */
  dryRun?: boolean | undefined;
  /** Skip interactive prompts */
  yes?: boolean | undefined;
  /** Enable verbose output */
  verbose?: boolean | undefined;
  /** Only run discovery (no migration) */
  discoveryOnly?: boolean | undefined;
}

/**
 * Result of the migrate command
 */
export interface MigrateResult {
  success: boolean;
  discovery: DiscoveryResult;
  migratedFiles: string[];
  backupPath?: string;
  errors: string[];
}

/**
 * File pattern definitions for discovery
 */
const DISCOVERY_PATTERNS = [
  // Cursor
  { pattern: '.cursor/rules/**/*.mdc', platform: 'cursor' as const, contentType: 'rule' as const },
  { pattern: '.cursor/rules/**/*.md', platform: 'cursor' as const, contentType: 'rule' as const },
  {
    pattern: '.cursor/commands/**/*.md',
    platform: 'cursor' as const,
    contentType: 'command' as const,
  },
  { pattern: '.cursorrules', platform: 'cursor' as const, contentType: 'rule' as const },

  // Claude
  { pattern: 'CLAUDE.md', platform: 'claude' as const, contentType: 'mixed' as const },
  {
    pattern: '.claude/skills/**/SKILL.md',
    platform: 'claude' as const,
    contentType: 'rule' as const,
  },
  { pattern: '.claude/skills/**/*.md', platform: 'claude' as const, contentType: 'rule' as const },
  {
    pattern: '.claude/agents/**/*.md',
    platform: 'claude' as const,
    contentType: 'persona' as const,
  },
  { pattern: '.claude/settings.json', platform: 'claude' as const, contentType: 'config' as const },

  // Factory
  { pattern: 'AGENTS.md', platform: 'factory' as const, contentType: 'mixed' as const },
  {
    pattern: '.factory/skills/**/SKILL.md',
    platform: 'factory' as const,
    contentType: 'rule' as const,
  },
  {
    pattern: '.factory/skills/**/*.md',
    platform: 'factory' as const,
    contentType: 'rule' as const,
  },
  {
    pattern: '.factory/droids/**/*.md',
    platform: 'factory' as const,
    contentType: 'persona' as const,
  },
  {
    pattern: '.factory/commands/**/*.md',
    platform: 'factory' as const,
    contentType: 'command' as const,
  },
];

/**
 * Analyze file content for topics/sections
 */
function analyzeContent(content: string): { topics: string[]; shouldSplit: boolean } {
  const topics: string[] = [];
  const lines = content.split('\n');

  // Look for H1 and H2 headers that indicate separate topics
  let h1Count = 0;
  let h2Count = 0;

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)/);
    const h2Match = line.match(/^##\s+(.+)/);

    if (h1Match?.[1]) {
      h1Count++;
      topics.push(h1Match[1]);
    } else if (h2Match?.[1]) {
      h2Count++;
      // Only include H2 if we haven't exceeded our limit
      if (topics.length < 10) {
        topics.push(`  └─ ${h2Match[1]}`);
      }
    }
  }

  // A file should be split if it has multiple H1 sections or many H2 sections
  const shouldSplit = h1Count > 1 || h2Count > 5;

  return { topics, shouldSplit };
}

/**
 * Detect content type from file content and path
 */
function detectContentType(
  content: string,
  filePath: string,
  frontmatter: Record<string, unknown> | undefined
): 'rule' | 'persona' | 'command' | 'hook' | 'config' | 'mixed' | 'unknown' {
  // Check frontmatter for explicit type indicators
  if (frontmatter) {
    if (frontmatter.tools || frontmatter.model) return 'persona';
    if (frontmatter.execute || frontmatter.args) return 'command';
    if (frontmatter.event || frontmatter.tool_match) return 'hook';
    if (frontmatter.globs || frontmatter.always_apply || frontmatter.alwaysApply) return 'rule';
  }

  // Check file path patterns
  const lowerPath = filePath.toLowerCase();
  if (
    lowerPath.includes('/rules/') ||
    lowerPath.includes('/skills/') ||
    lowerPath.endsWith('.mdc')
  ) {
    return 'rule';
  }
  if (
    lowerPath.includes('/personas/') ||
    lowerPath.includes('/agents/') ||
    lowerPath.includes('/droids/') ||
    lowerPath.includes('/roles/')
  ) {
    return 'persona';
  }
  if (lowerPath.includes('/commands/') && !lowerPath.includes('/roles/')) {
    return 'command';
  }
  if (lowerPath.includes('/hooks/')) {
    return 'hook';
  }
  if (lowerPath.endsWith('.json')) {
    return 'config';
  }

  // Check content patterns
  const lowerContent = content.toLowerCase();
  if (
    lowerContent.includes('# you are') ||
    lowerContent.includes('persona') ||
    lowerContent.includes('your role')
  ) {
    return 'persona';
  }

  // CLAUDE.md and AGENTS.md are typically mixed
  const fileName = path.basename(filePath).toLowerCase();
  if (fileName === 'claude.md' || fileName === 'agents.md') {
    return 'mixed';
  }

  return 'rule'; // Default to rule for .md files
}

/**
 * Format file size in human-readable form
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Discover existing AI tool configuration files
 */
export async function discover(projectRoot: string): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    files: [],
    byPlatform: {
      cursor: [],
      claude: [],
      factory: [],
      unknown: [],
    },
    stats: {
      totalFiles: 0,
      totalSize: 0,
      filesWithFrontmatter: 0,
      filesNeedingSplit: 0,
      platforms: [],
    },
    warnings: [],
  };

  const platformsFound = new Set<string>();

  for (const pattern of DISCOVERY_PATTERNS) {
    const files = await glob(pattern.pattern, {
      cwd: projectRoot,
      absolute: true,
      dot: true,
    });

    for (const filePath of files) {
      // Skip files we've already processed (in case of overlapping patterns)
      if (result.files.some((f) => f.path === filePath)) {
        continue;
      }

      try {
        const stats = await fs.stat(filePath);
        const relativePath = path.relative(projectRoot, filePath);
        const contentResult = await readFile(filePath);
        const content = contentResult.ok ? contentResult.value : '';

        // Parse frontmatter
        let frontmatter: Record<string, unknown> | undefined;
        let hasFm = false;

        if (content && hasFrontmatter(content)) {
          const parsed = parseFrontmatter(content);
          if (parsed.ok && !parsed.value.isEmpty) {
            frontmatter = parsed.value.data;
            hasFm = true;
          }
        }

        // Analyze content
        const analysis = analyzeContent(content);

        // Detect content type
        const contentType = detectContentType(content, filePath, frontmatter);

        // Build warnings
        const warnings: string[] = [];
        if (analysis.shouldSplit) {
          warnings.push('File may contain multiple topics - consider splitting');
        }
        if (!hasFm && (pattern.contentType === 'rule' || pattern.contentType === 'persona')) {
          warnings.push('No frontmatter detected - will need manual metadata');
        }

        const discovered: DiscoveredFile = {
          path: filePath,
          relativePath,
          size: stats.size,
          platform: pattern.platform,
          contentType: contentType === 'unknown' ? pattern.contentType : contentType,
          hasFrontmatter: hasFm,
          frontmatter,
          shouldSplit: analysis.shouldSplit,
          detectedTopics: analysis.topics,
          warnings,
        };

        result.files.push(discovered);
        result.byPlatform[pattern.platform].push(discovered);
        platformsFound.add(pattern.platform);

        // Update stats
        result.stats.totalFiles++;
        result.stats.totalSize += stats.size;
        if (hasFm) result.stats.filesWithFrontmatter++;
        if (analysis.shouldSplit) result.stats.filesNeedingSplit++;
      } catch (error) {
        result.warnings.push(
          `Failed to analyze ${filePath}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  result.stats.platforms = Array.from(platformsFound);

  return result;
}

/**
 * Create a timestamped backup directory
 */
async function createBackup(
  projectRoot: string,
  configDir: string,
  files: DiscoveredFile[],
  dryRun: boolean
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(projectRoot, configDir, 'backups', timestamp);

  if (!dryRun) {
    await ensureDir(backupDir);

    for (const file of files) {
      const destPath = path.join(backupDir, file.relativePath);
      await ensureDir(path.dirname(destPath));
      await copyFile(file.path, destPath);
    }
  }

  return backupDir;
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
 * Prompt for yes/no confirmation
 */
async function confirm(question: string, defaultYes: boolean = true): Promise<boolean> {
  const hint = defaultYes ? '(Y/n)' : '(y/N)';
  const answer = await prompt(`${question} ${hint}`);

  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

/**
 * Generate migration prompt for AI assistance
 */
function generateMigrationPrompt(file: DiscoveredFile): string {
  const content = `
I need help converting the following file from ${file.platform} format to ai-tool-sync generic format.

Source file: ${file.relativePath}
Detected type: ${file.contentType}
Has frontmatter: ${file.hasFrontmatter}
${file.shouldSplit ? 'Note: This file may need to be split into multiple files.\n' : ''}

Please convert this to the generic format with the following frontmatter structure:

For rules:
\`\`\`yaml
---
name: <rule-name>
description: <brief description>
version: 1.0.0
always_apply: false  # or true if always needed
globs:
  - "**/*.ts"  # file patterns this applies to
targets: [cursor, claude, factory]
priority: medium  # low, medium, high
---
\`\`\`

For personas:
\`\`\`yaml
---
name: <persona-name>
description: <brief description>
version: 1.0.0
tools:
  - read
  - write
  - edit
model: default
targets: [cursor, claude, factory]
---
\`\`\`

For commands:
\`\`\`yaml
---
name: <command-name>
description: <brief description>
version: 1.0.0
execute: <command to run>
targets: [cursor, claude, factory]
---
\`\`\`

Current frontmatter (if any): ${file.frontmatter ? JSON.stringify(file.frontmatter, null, 2) : 'None'}

Topics detected in file:
${file.detectedTopics.map((t) => `- ${t}`).join('\n') || '- (no clear topics detected)'}
`.trim();

  return content;
}

/**
 * Print discovery results
 */
function printDiscoveryResults(discovery: DiscoveryResult): void {
  printSubHeader('Discovered Files');

  if (discovery.files.length === 0) {
    printInfo('No existing AI tool configuration files found.');
    return;
  }

  // Print summary by platform
  for (const platform of ['cursor', 'claude', 'factory'] as const) {
    const files = discovery.byPlatform[platform];
    if (files.length > 0) {
      printNewLine();
      printInfo(`${platform.charAt(0).toUpperCase() + platform.slice(1)} (${files.length} files):`);

      for (const file of files) {
        const sizeStr = formatSize(file.size);
        const typeIcon =
          file.contentType === 'mixed'
            ? '📁'
            : file.contentType === 'rule'
              ? '📜'
              : file.contentType === 'persona'
                ? '👤'
                : file.contentType === 'command'
                  ? '⚡'
                  : '📄';
        const fmIcon = file.hasFrontmatter ? '✓' : '○';

        printListItem(`${typeIcon} ${file.relativePath} (${sizeStr}) [fm:${fmIcon}]`);

        if (file.warnings.length > 0) {
          for (const warning of file.warnings) {
            printListItem(`⚠ ${warning}`, 1);
          }
        }
      }
    }
  }

  // Print statistics
  printNewLine();
  printSubHeader('Summary');
  printKeyValue('Total files', discovery.stats.totalFiles.toString());
  printKeyValue('Total size', formatSize(discovery.stats.totalSize));
  printKeyValue('Files with frontmatter', discovery.stats.filesWithFrontmatter.toString());
  printKeyValue('Files needing split', discovery.stats.filesNeedingSplit.toString());
  printKeyValue('Platforms found', discovery.stats.platforms.join(', ') || 'none');

  // Print warnings
  if (discovery.warnings.length > 0) {
    printNewLine();
    printSubHeader('Warnings');
    for (const warning of discovery.warnings) {
      printWarning(warning);
    }
  }
}

/**
 * Execute the migrate command
 */
export async function migrate(options: MigrateOptions = {}): Promise<MigrateResult> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const configDirName = options.configDir ?? (await resolveConfigDir({ projectRoot }));
  const paths = getAiPaths(projectRoot, configDirName);

  const result: MigrateResult = {
    success: true,
    discovery: {
      files: [],
      byPlatform: { cursor: [], claude: [], factory: [], unknown: [] },
      stats: {
        totalFiles: 0,
        totalSize: 0,
        filesWithFrontmatter: 0,
        filesNeedingSplit: 0,
        platforms: [],
      },
      warnings: [],
    },
    migratedFiles: [],
    errors: [],
  };

  printHeader('Migration Wizard');

  // Phase 1: Discovery
  const spinner = createSpinner('Scanning for existing AI tool configurations...');
  spinner.start();

  try {
    result.discovery = await discover(projectRoot);
    spinner.stop(`Found ${result.discovery.stats.totalFiles} files`, true);
  } catch (error) {
    spinner.stop('Discovery failed', false);
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }

  // Print discovery results
  printDiscoveryResults(result.discovery);

  // If discovery only, stop here
  if (options.discoveryOnly) {
    printSummary({
      success: true,
      message: 'Discovery complete',
    });
    return result;
  }

  // If no files found, nothing to migrate
  if (result.discovery.files.length === 0) {
    printSummary({
      success: true,
      message: 'No files to migrate',
    });
    return result;
  }

  // Check if user wants to continue
  printNewLine();

  if (!options.yes && !options.dryRun) {
    const shouldContinue = await confirm('Would you like to proceed with migration?', true);
    if (!shouldContinue) {
      printInfo('Migration cancelled.');
      return result;
    }
  }

  // Phase 2: Backup (if requested)
  if (options.backup) {
    printNewLine();
    const backupSpinner = createSpinner('Creating backup...');
    backupSpinner.start();

    try {
      result.backupPath = await createBackup(
        projectRoot,
        configDirName,
        result.discovery.files,
        options.dryRun ?? false
      );
      backupSpinner.stop(`Backup created at ${result.backupPath}`, true);
    } catch (error) {
      backupSpinner.stop('Backup failed', false);
      result.success = false;
      result.errors.push(
        `Backup failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return result;
    }
  }

  // Phase 3: Interactive migration
  if (!options.dryRun) {
    printNewLine();
    printSubHeader('Migration');

    // Ensure config directory exists
    await ensureDir(paths.aiDir);
    await ensureDir(paths.rulesDir);
    await ensureDir(paths.personasDir);
    await ensureDir(paths.commandsDir);
    await ensureDir(paths.hooksDir);
    await ensureDir(path.join(paths.aiDir, 'input'));

    for (const file of result.discovery.files) {
      printNewLine();
      printInfo(`Processing: ${file.relativePath}`);

      // For complex files, suggest AI-assisted migration
      if (file.shouldSplit || !file.hasFrontmatter || file.contentType === 'mixed') {
        if (!options.yes) {
          printWarning('This file may need AI-assisted conversion.');
          const action = await prompt(
            'Action: (c)opy to input folder, (s)kip, (m)igration prompt',
            'c'
          );

          if (action.toLowerCase() === 's') {
            printListItem('Skipped');
            continue;
          }

          if (action.toLowerCase() === 'm') {
            // Print migration prompt
            printNewLine();
            printInfo('=== Migration Prompt (copy and send to your AI assistant) ===');
            printInfo(generateMigrationPrompt(file));
            printInfo('=== End Migration Prompt ===');
            printNewLine();

            // Also copy to input folder
            const destPath = path.join(paths.aiDir, 'input', file.relativePath);
            await ensureDir(path.dirname(destPath));
            await copyFile(file.path, destPath);
            result.migratedFiles.push(destPath);
            printSuccess(`Copied to ${path.relative(projectRoot, destPath)}`);
            continue;
          }
        }

        // Copy to input folder for later processing
        const destPath = path.join(paths.aiDir, 'input', file.relativePath);
        await ensureDir(path.dirname(destPath));
        await copyFile(file.path, destPath);
        result.migratedFiles.push(destPath);
        printSuccess(`Copied to ${path.relative(projectRoot, destPath)}`);
      } else {
        // Simple files can be directly migrated
        const targetDir =
          file.contentType === 'rule'
            ? paths.rulesDir
            : file.contentType === 'persona'
              ? paths.personasDir
              : file.contentType === 'command'
                ? paths.commandsDir
                : file.contentType === 'hook'
                  ? paths.hooksDir
                  : path.join(paths.aiDir, 'input');

        const fileName = path.basename(file.path).replace(/\.mdc$/, '.md');
        const destPath = path.join(targetDir, fileName);

        // Read and potentially transform content
        const contentResult = await readFile(file.path);
        if (contentResult.ok) {
          await writeFile(destPath, contentResult.value);
          result.migratedFiles.push(destPath);
          printSuccess(`Migrated to ${path.relative(projectRoot, destPath)}`);
        } else {
          printError(`Failed to read ${file.relativePath}`);
          result.errors.push(`Failed to read ${file.relativePath}`);
        }
      }
    }
  }

  // Final summary
  printSummary({
    success: result.errors.length === 0,
    message: options.dryRun
      ? `Dry run complete - ${result.discovery.files.length} files would be processed`
      : `Migration complete - ${result.migratedFiles.length} files processed`,
    dryRun: options.dryRun,
  });

  if (result.migratedFiles.length > 0 && !options.dryRun) {
    printNewLine();
    logger.info('Next steps:');
    logger.list(`Review files in ${configDirName}/input/`);
    logger.list(`Convert complex files using AI assistance`);
    logger.list(
      `Move converted files to ${configDirName}/rules/, ${configDirName}/personas/, etc.`
    );
    logger.list('Run ai-sync to generate tool configurations');
  }

  result.success = result.errors.length === 0;
  return result;
}
