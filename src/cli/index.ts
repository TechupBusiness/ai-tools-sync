/**
 * @file CLI Entry Point
 * @description Command-line interface for ai-sync
 *
 * Provides three main commands:
 * - sync (default): Sync .ai/ configuration to tool-specific outputs
 * - init: Initialize .ai/ directory with template configuration
 * - validate: Validate configuration without generating output
 */

import { Command } from 'commander';

import { VERSION } from '../index.js';
import { logger } from '../utils/logger.js';

import { init } from './commands/init.js';
import { merge } from './commands/merge.js';
import { migrate } from './commands/migrate.js';
import { sync } from './commands/sync.js';
import { validate } from './commands/validate.js';

const program = new Command();

program
  .name('ai-sync')
  .description('Unified AI tool configuration - single source of truth for Cursor, Claude Code, Factory, and more')
  .version(VERSION);

program
  .command('sync', { isDefault: true })
  .description('Sync configuration to tool-specific outputs')
  .option('-v, --verbose', 'Enable verbose output')
  .option('-d, --dry-run', 'Show what would be generated without writing files')
  .option('--no-clean', 'Do not clean output directories before generating')
  .option('--update-gitignore', 'Update .gitignore with generated paths (default: true)')
  .option('--no-update-gitignore', 'Do not update .gitignore')
  .option('-p, --project <path>', 'Project root directory')
  .option('-c, --config-dir <path>', 'Configuration directory name (default: .ai-tool-sync)')
  .action(async (options: {
    verbose?: boolean;
    dryRun?: boolean;
    clean?: boolean;
    updateGitignore?: boolean;
    project?: string;
    configDir?: string;
  }) => {
    if (options.verbose) {
      logger.setVerbose(true);
    }

    try {
      const result = await sync({
        verbose: options.verbose,
        dryRun: options.dryRun,
        clean: options.clean,
        updateGitignore: options.updateGitignore,
        projectRoot: options.project,
        configDir: options.configDir,
      });

      // Exit with error code if sync failed
      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Sync failed: ${message}`);
      if (options.verbose && error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize configuration directory with template configuration')
  .option('-f, --force', 'Overwrite existing configuration')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .option('--update-gitignore', 'Update .gitignore with generated paths')
  .option('--no-update-gitignore', 'Do not update .gitignore')
  .option('-p, --project <path>', 'Project root directory')
  .option('-c, --config-dir <path>', 'Configuration directory name (default: .ai-tool-sync)')
  .action(async (options: {
    force?: boolean;
    yes?: boolean;
    updateGitignore?: boolean;
    project?: string;
    configDir?: string;
  }) => {
    try {
      const result = await init({
        force: options.force,
        yes: options.yes,
        updateGitignore: options.updateGitignore,
        projectRoot: options.project,
        configDir: options.configDir,
      });

      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Init failed: ${message}`);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate configuration without generating output')
  .option('-v, --verbose', 'Show detailed validation results')
  .option('-p, --project <path>', 'Project root directory')
  .option('-c, --config-dir <path>', 'Configuration directory name (default: .ai-tool-sync)')
  .action(async (options: {
    verbose?: boolean;
    project?: string;
    configDir?: string;
  }) => {
    if (options.verbose) {
      logger.setVerbose(true);
    }

    try {
      const result = await validate({
        verbose: options.verbose,
        projectRoot: options.project,
        configDir: options.configDir,
      });

      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Validate failed: ${message}`);
      process.exit(1);
    }
  });

program
  .command('migrate')
  .description('Discover and migrate existing AI tool configurations')
  .option('-v, --verbose', 'Enable verbose output')
  .option('-d, --dry-run', 'Show what would be migrated without making changes')
  .option('-b, --backup', 'Create backup before migration')
  .option('-y, --yes', 'Skip interactive prompts')
  .option('--discovery-only', 'Only run discovery phase (no migration)')
  .option('-p, --project <path>', 'Project root directory')
  .option('-c, --config-dir <path>', 'Configuration directory name (default: .ai-tool-sync)')
  .action(async (options: {
    verbose?: boolean;
    dryRun?: boolean;
    backup?: boolean;
    yes?: boolean;
    discoveryOnly?: boolean;
    project?: string;
    configDir?: string;
  }) => {
    if (options.verbose) {
      logger.setVerbose(true);
    }

    try {
      const result = await migrate({
        verbose: options.verbose,
        dryRun: options.dryRun,
        backup: options.backup,
        yes: options.yes,
        discoveryOnly: options.discoveryOnly,
        projectRoot: options.project,
        configDir: options.configDir,
      });

      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Migration failed: ${message}`);
      if (options.verbose && error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('merge')
  .description('Merge input files into configuration')
  .option('-v, --verbose', 'Show detailed diff output')
  .option('-d, --dry-run', 'Show what would be merged without changes')
  .option('-y, --yes', 'Skip interactive prompts')
  .option('-f, --file <path>', 'Process specific file only')
  .option('-p, --project <path>', 'Project root directory')
  .option('-c, --config-dir <path>', 'Configuration directory name (default: .ai-tool-sync)')
  .action(async (options: {
    verbose?: boolean;
    dryRun?: boolean;
    yes?: boolean;
    file?: string;
    project?: string;
    configDir?: string;
  }) => {
    if (options.verbose) {
      logger.setVerbose(true);
    }

    try {
      const mergeOptions: Parameters<typeof merge>[0] = {};
      if (options.verbose !== undefined) mergeOptions.verbose = options.verbose;
      if (options.dryRun !== undefined) mergeOptions.dryRun = options.dryRun;
      if (options.yes !== undefined) mergeOptions.yes = options.yes;
      if (options.file !== undefined) mergeOptions.file = options.file;
      if (options.project !== undefined) mergeOptions.projectRoot = options.project;
      if (options.configDir !== undefined) mergeOptions.configDir = options.configDir;

      const result = await merge(mergeOptions);

      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Merge failed: ${message}`);
      if (options.verbose && error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

/**
 * Run the CLI
 */
export function run(): void {
  program.parse();
}

/**
 * Default export for direct imports
 */
export default run;

// Re-export commands for programmatic usage
export { sync, init, validate, migrate, merge };
export type { SyncOptions, SyncResult } from './commands/sync.js';
export type { InitOptions, InitResult } from './commands/init.js';
export type { ValidateOptions, ValidateResult } from './commands/validate.js';
export type { MigrateOptions, MigrateResult, DiscoveryResult, DiscoveredFile } from './commands/migrate.js';
export type { MergeOptions, MergeResult, InputFile, DiffStatus } from './commands/merge.js';

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
