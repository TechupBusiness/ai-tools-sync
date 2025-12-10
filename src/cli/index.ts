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

import { clean } from './commands/clean.js';
import { convert } from './commands/convert.js';
import { create, type CreateCommandOptions } from './commands/create.js';
import { init } from './commands/init.js';
import { lint } from './commands/lint.js';
import { merge } from './commands/merge.js';
import { migrate } from './commands/migrate.js';
import { createPluginsCommand } from './commands/plugins.js';
import { status } from './commands/status.js';
import { sync } from './commands/sync.js';
import { validate } from './commands/validate.js';
import { watch } from './commands/watch.js';

import type { ConvertCommandOptions } from './commands/convert.js';
import type { LintCommandOptions } from './commands/lint.js';
import type { GenericKind } from '@/creators/types.js';

const program = new Command();

program
  .name('ai-sync')
  .description(
    'Unified AI tool configuration - single source of truth for Cursor, Claude Code, Factory, and more'
  )
  .version(VERSION);

function parseListOption(value?: string): string[] | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseGenericKind(value: string): GenericKind | null {
  const normalized = value.toLowerCase();
  if (
    normalized === 'rule' ||
    normalized === 'persona' ||
    normalized === 'command' ||
    normalized === 'hook'
  ) {
    return normalized as GenericKind;
  }
  return null;
}

program
  .command('sync', { isDefault: true })
  .description('Sync configuration to tool-specific outputs')
  .option('-v, --verbose', 'Enable verbose output')
  .option('-d, --dry-run', 'Show what would be generated without writing files')
  .option('-w, --watch', 'Watch for changes and auto-regenerate')
  .option('--debounce <ms>', 'Debounce interval for watch mode (default: 300)', '300')
  .option('--no-clean', 'Do not clean output directories before generating')
  .option('--update-gitignore', 'Update .gitignore with generated paths (default: true)')
  .option('--no-update-gitignore', 'Do not update .gitignore')
  .option('-p, --project <path>', 'Project root directory')
  .option('-c, --config-dir <path>', 'Configuration directory name (default: .ai-tool-sync)')
  .action(
    async (options: {
      verbose?: boolean;
      dryRun?: boolean;
      watch?: boolean;
      debounce?: string;
      clean?: boolean;
      updateGitignore?: boolean;
      project?: string;
      configDir?: string;
    }) => {
      if (options.verbose) {
        logger.setVerbose(true);
      }

      try {
        if (options.watch) {
          const debounceMs = Number.parseInt(options.debounce ?? '300', 10);
          const result = await watch({
            verbose: options.verbose,
            dryRun: options.dryRun,
            clean: options.clean,
            updateGitignore: options.updateGitignore,
            projectRoot: options.project,
            configDir: options.configDir,
            debounceMs: Number.isNaN(debounceMs) ? undefined : debounceMs,
          });
          if (!result.success) {
            process.exit(1);
          }
        } else {
          const result = await sync({
            verbose: options.verbose,
            dryRun: options.dryRun,
            clean: options.clean,
            updateGitignore: options.updateGitignore,
            projectRoot: options.project,
            configDir: options.configDir,
          });
          if (!result.success) {
            process.exit(1);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Sync failed: ${message}`);
        if (options.verbose && error instanceof Error && error.stack) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    }
  );

program
  .command('init')
  .description('Initialize configuration directory with template configuration')
  .option('-f, --force', 'Overwrite existing configuration')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .option('--update-gitignore', 'Update .gitignore with generated paths')
  .option('--no-update-gitignore', 'Do not update .gitignore')
  .option('-p, --project <path>', 'Project root directory')
  .option('-c, --config-dir <path>', 'Configuration directory name (default: .ai-tool-sync)')
  .action(
    async (options: {
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
    }
  );

program
  .command('create')
  .description('Create a new generic format file (rule, persona, command, hook)')
  .argument('<kind>', 'Type of file to create (rule|persona|command|hook)')
  .argument('<name>', 'Name/slug for the new file')
  .option('--description <text>', 'Description for frontmatter')
  .option('--targets <targets>', 'Comma-separated list of targets (cursor, claude, factory)')
  .option('--globs <globs>', 'Comma or whitespace separated glob patterns')
  .option('--tools <tools>', 'Comma-separated tool list')
  .option('--model <model>', 'Model to use (personas)')
  .option('--execute <command>', 'Execute command (commands only)')
  .option('--priority <priority>', 'Priority for rules (low|medium|high)')
  .option('--template <template>', 'Template id (default: <kind>/basic)')
  .option('--body <body>', 'Markdown body content')
  .option('-f, --force', 'Overwrite if file already exists')
  .option('--run-lint', 'Run lint checks for rules')
  .option('-d, --dry-run', 'Preview without writing files')
  .option('-p, --project <path>', 'Project root directory')
  .option('-c, --config-dir <path>', 'Configuration directory name (default: .ai-tool-sync)')
  .action(
    async (
      kind: string,
      name: string,
      options: {
        description?: string;
        targets?: string;
        globs?: string;
        tools?: string;
        model?: string;
        execute?: string;
        priority?: string;
        template?: string;
        body?: string;
        force?: boolean;
        runLint?: boolean;
        dryRun?: boolean;
        project?: string;
        configDir?: string;
      }
    ) => {
      const parsedKind = parseGenericKind(kind);
      if (!parsedKind) {
        logger.error(`Invalid kind '${kind}'. Use rule, persona, command, or hook.`);
        process.exit(1);
      }

      const parsedTargets =
        options.targets !== undefined ? parseListOption(options.targets) : undefined;
      const parsedGlobs = options.globs !== undefined ? parseListOption(options.globs) : undefined;
      const parsedTools = options.tools !== undefined ? parseListOption(options.tools) : undefined;
      const parsedPriority =
        options.priority && ['low', 'medium', 'high'].includes(options.priority)
          ? (options.priority as CreateCommandOptions['priority'])
          : undefined;
      const createOptions: CreateCommandOptions = {
        ...(options.description !== undefined ? { description: options.description } : {}),
        ...(parsedTargets !== undefined ? { targets: parsedTargets } : {}),
        ...(parsedGlobs !== undefined ? { globs: parsedGlobs } : {}),
        ...(parsedTools !== undefined ? { tools: parsedTools } : {}),
        ...(options.model !== undefined ? { model: options.model } : {}),
        ...(options.execute !== undefined ? { execute: options.execute } : {}),
        ...(parsedPriority !== undefined ? { priority: parsedPriority } : {}),
        ...(options.template !== undefined ? { template: options.template } : {}),
        ...(options.body !== undefined ? { body: options.body } : {}),
        ...(options.force !== undefined ? { overwrite: options.force } : {}),
        ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
        ...(options.runLint !== undefined ? { runLint: options.runLint } : {}),
        ...(options.project !== undefined ? { projectRoot: options.project } : {}),
        ...(options.configDir !== undefined ? { configDir: options.configDir } : {}),
      };

      try {
        const result = await create(parsedKind, name, createOptions);
        if (!result.success) {
          process.exit(1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Create failed: ${message}`);
        process.exit(1);
      }
    }
  );

program
  .command('validate')
  .description('Validate configuration without generating output')
  .option('-v, --verbose', 'Show detailed validation results')
  .option('-p, --project <path>', 'Project root directory')
  .option('-c, --config-dir <path>', 'Configuration directory name (default: .ai-tool-sync)')
  .action(async (options: { verbose?: boolean; project?: string; configDir?: string }) => {
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
  .command('lint')
  .description('Lint rules for common issues')
  .option('-s, --strict', 'Treat warnings as errors')
  .option('-r, --rules <rules>', 'Comma-separated lint rules to run')
  .option('-i, --ignore <rules>', 'Comma-separated lint rules to ignore')
  .option('--include-info', 'Include info-level issues')
  .option('--list-rules', 'List available lint rules')
  .option('-v, --verbose', 'Verbose output')
  .option('-p, --project <path>', 'Project root directory')
  .option('-c, --config-dir <path>', 'Configuration directory name (default: .ai-tool-sync)')
  .action(
    async (options: {
      strict?: boolean;
      rules?: string;
      ignore?: string;
      includeInfo?: boolean;
      listRules?: boolean;
      verbose?: boolean;
      project?: string;
      configDir?: string;
    }) => {
      if (options.verbose) {
        logger.setVerbose(true);
      }

      try {
        const lintOptions: LintCommandOptions = {};
        if (options.project !== undefined) lintOptions.projectRoot = options.project;
        if (options.configDir !== undefined) lintOptions.configDir = options.configDir;
        if (options.strict !== undefined) lintOptions.strict = options.strict;
        if (options.rules !== undefined) {
          lintOptions.rules = options.rules.split(',').filter(Boolean);
        }
        if (options.ignore !== undefined) {
          lintOptions.ignore = options.ignore.split(',').filter(Boolean);
        }
        if (options.includeInfo !== undefined) lintOptions.includeInfo = options.includeInfo;
        if (options.listRules !== undefined) lintOptions.listRules = options.listRules;
        if (options.verbose !== undefined) lintOptions.verbose = options.verbose;

        const result = await lint(lintOptions);
        if (!result.success) {
          process.exit(1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Lint failed: ${message}`);
        process.exit(1);
      }
    }
  );

program
  .command('clean')
  .description('Remove generated files')
  .option('-v, --verbose', 'Show detailed output')
  .option('-f, --force', 'Remove even modified files (with warnings)')
  .option('-d, --dry-run', 'Show what would be deleted without deleting')
  .option('-p, --project <path>', 'Project root directory')
  .option('-c, --config-dir <path>', 'Configuration directory name')
  .action(
    async (options: {
      verbose?: boolean;
      force?: boolean;
      dryRun?: boolean;
      project?: string;
      configDir?: string;
    }) => {
      if (options.verbose) {
        logger.setVerbose(true);
      }

      try {
        const result = await clean({
          verbose: options.verbose,
          force: options.force,
          dryRun: options.dryRun,
          projectRoot: options.project,
          configDir: options.configDir,
        });

        if (!result.success) {
          process.exit(1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Clean failed: ${message}`);
        process.exit(1);
      }
    }
  );

program
  .command('status')
  .description('Show status of generated files')
  .option('-v, --verbose', 'Show all files, not just summary')
  .option('-p, --project <path>', 'Project root directory')
  .option('-c, --config-dir <path>', 'Configuration directory name')
  .action(async (options: { verbose?: boolean; project?: string; configDir?: string }) => {
    if (options.verbose) {
      logger.setVerbose(true);
    }

    try {
      const result = await status({
        verbose: options.verbose,
        projectRoot: options.project,
        configDir: options.configDir,
      });

      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Status failed: ${message}`);
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
  .action(
    async (options: {
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
    }
  );

program
  .command('convert')
  .description('Convert platform files into .ai-tool-sync format')
  .option('-v, --verbose', 'Enable verbose output')
  .option('-d, --dry-run', 'Show what would be converted without writing files')
  .option('-s, --strict', 'Treat warnings as errors')
  .option('--include-unknown', 'Attempt best-effort conversion of unknown or mixed files')
  .option('--run-lint', 'Run lint on converted rules')
  .option('--no-infer-name-from-path', 'Do not infer name from filename when missing')
  .option('-p, --project <path>', 'Project root directory')
  .option('-c, --config-dir <path>', 'Configuration directory name (default: .ai-tool-sync)')
  .option('-f, --file <path>', 'Convert a specific file only')
  .action(
    async (options: {
      verbose?: boolean;
      dryRun?: boolean;
      strict?: boolean;
      includeUnknown?: boolean;
      runLint?: boolean;
      inferNameFromPath?: boolean;
      project?: string;
      configDir?: string;
      file?: string;
    }) => {
      if (options.verbose) {
        logger.setVerbose(true);
      }

      try {
        const convertOptions: ConvertCommandOptions = {};
        if (options.dryRun !== undefined) convertOptions.dryRun = options.dryRun;
        if (options.strict !== undefined) convertOptions.strict = options.strict;
        if (options.includeUnknown !== undefined)
          convertOptions.includeUnknown = options.includeUnknown;
        if (options.runLint !== undefined) convertOptions.runLint = options.runLint;
        if (options.inferNameFromPath !== undefined)
          convertOptions.inferNameFromPath = options.inferNameFromPath;
        if (options.project !== undefined) convertOptions.projectRoot = options.project;
        if (options.configDir !== undefined) convertOptions.configDir = options.configDir;
        if (options.file !== undefined) convertOptions.file = options.file;

        const result = await convert(convertOptions);

        if (!result.success) {
          process.exit(1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Convert failed: ${message}`);
        if (options.verbose && error instanceof Error && error.stack) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    }
  );

program.addCommand(createPluginsCommand());

program
  .command('merge')
  .description('Merge input files into configuration')
  .option('-v, --verbose', 'Show detailed diff output')
  .option('-d, --dry-run', 'Show what would be merged without changes')
  .option('-y, --yes', 'Skip interactive prompts')
  .option('-f, --file <path>', 'Process specific file only')
  .option('-p, --project <path>', 'Project root directory')
  .option('-c, --config-dir <path>', 'Configuration directory name (default: .ai-tool-sync)')
  .action(
    async (options: {
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
    }
  );

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
export { sync, init, validate, migrate, merge, clean, status, lint, convert, create };
export type { SyncOptions, SyncResult } from './commands/sync.js';
export type { InitOptions, InitResult } from './commands/init.js';
export type { ValidateOptions, ValidateResult } from './commands/validate.js';
export type { LintCommandOptions } from './commands/lint.js';
export type { CreateCommandOptions, CreateCommandResult } from './commands/create.js';
export type {
  MigrateOptions,
  MigrateResult,
  DiscoveryResult,
  DiscoveredFile,
} from './commands/migrate.js';
export type { MergeOptions, MergeResult, InputFile, DiffStatus } from './commands/merge.js';
export type { CleanOptions, CleanResult } from './commands/clean.js';
export type { StatusOptions, StatusResult, FileStatus } from './commands/status.js';
export type { ConvertCommandOptions, ConvertCommandResult } from './commands/convert.js';
export { createPluginsCommand } from './commands/plugins.js';

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
