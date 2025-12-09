/**
 * @file Init Command
 * @description Initialize configuration directory with template configuration
 *
 * Creates the following structure:
 * .ai-tool-sync/ (or custom directory name)
 * ├── config.yaml       # Main configuration
 * ├── rules/            # Project-specific rules
 * │   └── _core.md      # Example core rule
 * ├── personas/         # Project-specific personas (empty)
 * ├── commands/         # Project-specific commands (empty)
 * └── hooks/            # Project-specific hooks (empty)
 */

import * as path from 'node:path';
import * as readline from 'node:readline';

import { getAiPaths, hasConfigDir, resolveConfigDir } from '../../config/loader.js';
import { ensureDir, writeFile, fileExists } from '../../utils/fs.js';
import { updateGitignore, getDefaultGitignorePaths } from '../../utils/gitignore.js';
import { logger } from '../../utils/logger.js';
import {
  printHeader,
  printSuccess,
  printWarning,
  printError,
  printSummary,
  printNewLine,
  printGeneratedFile,
} from '../output.js';

/**
 * Options for the init command
 */
export interface InitOptions {
  /** Overwrite existing configuration */
  force?: boolean | undefined;
  /** Project root directory */
  projectRoot?: string | undefined;
  /** Skip interactive prompts (use defaults) */
  yes?: boolean | undefined;
  /** Configuration directory name (relative to project root) */
  configDir?: string | undefined;
  /** Update .gitignore to exclude generated files */
  updateGitignore?: boolean | undefined;
}

/**
 * Result of the init command
 */
export interface InitResult {
  success: boolean;
  filesCreated: string[];
  errors: string[];
  gitignoreUpdated: boolean;
}

/**
 * Prompt user for yes/no confirmation
 */
async function promptYesNo(question: string, defaultYes = true): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const hint = defaultYes ? '(Y/n)' : '(y/N)';

  return new Promise((resolve) => {
    rl.question(`${question} ${hint} `, (answer) => {
      rl.close();
      const normalizedAnswer = answer.trim().toLowerCase();

      if (!normalizedAnswer) {
        resolve(defaultYes);
      } else {
        resolve(normalizedAnswer === 'y' || normalizedAnswer === 'yes');
      }
    });
  });
}

/**
 * Template for config.yaml
 */
const CONFIG_TEMPLATE = `# =============================================================================
# AI Tool Sync - Project Configuration
# =============================================================================
# This file configures how ai-sync generates tool-specific outputs.
# For full documentation, see: https://github.com/TechupBusiness/ai-tools-sync

version: "1.0.0"
# project_name: my-project

# =============================================================================
# What to Use from ai-tool-sync Defaults
# =============================================================================
# Uncomment and customize to enable built-in personas and commands

# use:
#   personas:
#     - architect
#     - implementer
#     - security-hacker
#     - test-zealot
#   commands:
#     - lint-fix
#     - type-check

# =============================================================================
# Loaders Configuration
# =============================================================================
# Configure where to load content from

loaders:
  - type: ai-tool-sync    # Load built-in defaults

  # Add more loaders as needed:
  # - type: local
  #   source: ../shared-rules/     # Monorepo shared rules
  # - type: npm
  #   package: "@company/ai-rules"
  #   version: "^1.0.0"

# =============================================================================
# Targets to Generate
# =============================================================================
# Which AI tools to generate configuration for

targets:
  - cursor
  - claude
  - factory

# =============================================================================
# Output Settings
# =============================================================================

output:
  clean_before_sync: true
  add_do_not_edit_headers: true

# =============================================================================
# Rules Configuration (Optional)
# =============================================================================
# Override settings for specific rules

# rules:
#   _core:
#     always_apply: true
#     description: "Core project context"
#   database:
#     always_apply: false
#     globs:
#       - "**/*.sql"
#       - "**/migrations/**"

# =============================================================================
# Subfolder Context Generation (Optional)
# =============================================================================
# Generate CLAUDE.md/AGENTS.md in subfolders for monorepo support

# subfolder_contexts:
#   packages/backend:
#     rules: [_core, database]
#     personas: [implementer, data-specialist]
#     description: "Backend package"
`;

/**
 * Get the template for _core.md rule with the correct directory name
 */
function getCoreRuleTemplate(configDirName: string): string {
  return `---
name: _core
description: Core project context and guidelines
version: 1.0.0

always_apply: true
targets: [cursor, claude, factory]
priority: high
---

# Project Overview

This is the core context for the project. Edit this file to add:

- Project description and purpose
- Key architectural decisions
- Important conventions and patterns
- Technology stack overview
- Development guidelines

## Getting Started

1. Edit this file to describe your project
2. Add more rules in \`${configDirName}/rules/\` for specific topics
3. Run \`ai-sync\` to generate tool-specific configurations

## Example Content

\`\`\`
This project is a [describe your project].

Key technologies:
- [Technology 1]
- [Technology 2]

Important patterns:
- [Pattern 1]
- [Pattern 2]
\`\`\`
`;
}

/**
 * Execute the init command
 */
export async function init(options: InitOptions = {}): Promise<InitResult> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());

  // Resolve the config directory name
  const configDirName = options.configDir ?? await resolveConfigDir({ projectRoot });
  const paths = getAiPaths(projectRoot, configDirName);
  const filesCreated: string[] = [];
  const errors: string[] = [];

  printHeader('Initialize AI Configuration');

  // Check if config directory already exists
  if (await hasConfigDir(projectRoot, configDirName)) {
    if (!options.force) {
      printWarning(`Configuration directory already exists: ${configDirName}/`);
      printNewLine();
      printError('Use --force to overwrite existing configuration');
      return {
        success: false,
        filesCreated: [],
        errors: ['Configuration already exists. Use --force to overwrite.'],
        gitignoreUpdated: false,
      };
    }
    printWarning('Overwriting existing configuration (--force)');
    printNewLine();
  }

  try {
    // Create directory structure
    const directories = [
      paths.aiDir,
      paths.rulesDir,
      paths.personasDir,
      paths.commandsDir,
      paths.hooksDir,
    ];

    for (const dir of directories) {
      const result = await ensureDir(dir);
      if (!result.ok) {
        errors.push(`Failed to create directory: ${dir}`);
        logger.error(`Failed to create ${dir}: ${result.error.message}`);
      } else {
        logger.debug(`Created directory: ${dir}`);
      }
    }

    // Create config.yaml
    const configPath = path.join(paths.aiDir, 'config.yaml');
    if (options.force || !(await fileExists(configPath))) {
      const result = await writeFile(configPath, CONFIG_TEMPLATE);
      if (result.ok) {
        filesCreated.push(`${configDirName}/config.yaml`);
        printGeneratedFile(`${configDirName}/config.yaml`, 'created');
      } else {
        errors.push(`Failed to create config.yaml: ${result.error.message}`);
      }
    } else {
      printGeneratedFile(`${configDirName}/config.yaml`, 'skipped');
    }

    // Create _core.md rule
    const corePath = path.join(paths.rulesDir, '_core.md');
    if (options.force || !(await fileExists(corePath))) {
      const result = await writeFile(corePath, getCoreRuleTemplate(configDirName));
      if (result.ok) {
        filesCreated.push(`${configDirName}/rules/_core.md`);
        printGeneratedFile(`${configDirName}/rules/_core.md`, 'created');
      } else {
        errors.push(`Failed to create _core.md: ${result.error.message}`);
      }
    } else {
      printGeneratedFile(`${configDirName}/rules/_core.md`, 'skipped');
    }

    // Create .gitkeep files for empty directories
    const emptyDirs = [paths.personasDir, paths.commandsDir, paths.hooksDir];
    for (const dir of emptyDirs) {
      const gitkeepPath = path.join(dir, '.gitkeep');
      if (options.force || !(await fileExists(gitkeepPath))) {
        const result = await writeFile(gitkeepPath, '');
        if (result.ok) {
          const relativePath = path.relative(projectRoot, gitkeepPath);
          filesCreated.push(relativePath);
          logger.debug(`Created: ${relativePath}`);
        }
      }
    }

    // Handle .gitignore update
    let gitignoreUpdated = false;
    let shouldUpdateGitignore = options.updateGitignore;

    // If not specified, ask user (unless --yes flag is set)
    if (shouldUpdateGitignore === undefined) {
      if (options.yes) {
        // Default to true when using --yes
        shouldUpdateGitignore = true;
      } else {
        // Interactive prompt
        printNewLine();
        shouldUpdateGitignore = await promptYesNo(
          'Update .gitignore to exclude generated files?',
          true
        );
      }
    }

    if (shouldUpdateGitignore) {
      const gitignoreResult = await updateGitignore(projectRoot, null, {
        createIfMissing: true,
      });

      if (gitignoreResult.ok) {
        gitignoreUpdated = gitignoreResult.value.changed;
        if (gitignoreResult.value.created) {
          printGeneratedFile('.gitignore', 'created');
          filesCreated.push('.gitignore');
        } else if (gitignoreResult.value.changed) {
          printSuccess('.gitignore updated with generated paths');
        }
        logger.debug(`Gitignore paths: ${getDefaultGitignorePaths().join(', ')}`);
      } else {
        errors.push(`Failed to update .gitignore: ${gitignoreResult.error.message}`);
        logger.warn(`Failed to update .gitignore: ${gitignoreResult.error.message}`);
      }
    }

    const success = errors.length === 0;

    printSummary({
      success,
      message: success
        ? `Created ${filesCreated.length} files in ${configDirName}/`
        : `Initialization completed with ${errors.length} errors`,
    });

    if (success) {
      printNewLine();
      logger.info('Next steps:');
      logger.list(`Edit ${configDirName}/config.yaml to configure your project`);
      logger.list(`Edit ${configDirName}/rules/_core.md with your project context`);
      logger.list('Run ai-sync to generate tool configurations');
    }

    return {
      success,
      filesCreated,
      errors,
      gitignoreUpdated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printError(`Initialization failed: ${message}`);
    return {
      success: false,
      filesCreated,
      errors: [message],
      gitignoreUpdated: false,
    };
  }
}

