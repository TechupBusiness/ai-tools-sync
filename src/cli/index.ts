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
import { sync } from './commands/sync.js';
import { validate } from './commands/validate.js';

const program = new Command();

program
  .name('ai-sync')
  .description('Unified AI tool configuration - single source of truth for Cursor, Claude Code, Factory, and more')
  .version(VERSION);

program
  .command('sync', { isDefault: true })
  .description('Sync .ai/ configuration to tool-specific outputs')
  .option('-v, --verbose', 'Enable verbose output')
  .option('-d, --dry-run', 'Show what would be generated without writing files')
  .option('--no-clean', 'Do not clean output directories before generating')
  .option('-p, --project <path>', 'Project root directory')
  .action(async (options: {
    verbose?: boolean;
    dryRun?: boolean;
    clean?: boolean;
    project?: string;
  }) => {
    if (options.verbose) {
      logger.setVerbose(true);
    }

    try {
      const result = await sync({
        verbose: options.verbose,
        dryRun: options.dryRun,
        clean: options.clean,
        projectRoot: options.project,
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
  .description('Initialize .ai/ directory with template configuration')
  .option('-f, --force', 'Overwrite existing configuration')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .option('-p, --project <path>', 'Project root directory')
  .action(async (options: {
    force?: boolean;
    yes?: boolean;
    project?: string;
  }) => {
    try {
      const result = await init({
        force: options.force,
        yes: options.yes,
        projectRoot: options.project,
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
  .action(async (options: {
    verbose?: boolean;
    project?: string;
  }) => {
    if (options.verbose) {
      logger.setVerbose(true);
    }

    try {
      const result = await validate({
        verbose: options.verbose,
        projectRoot: options.project,
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
export { sync, init, validate };
export type { SyncOptions, SyncResult } from './commands/sync.js';
export type { InitOptions, InitResult } from './commands/init.js';
export type { ValidateOptions, ValidateResult } from './commands/validate.js';

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
