/**
 * @file Init Command
 * @description Initialize .ai/ directory with template configuration
 *
 * Creates the following structure:
 * .ai/
 * ├── config.yaml       # Main configuration
 * ├── rules/            # Project-specific rules
 * │   └── _core.md      # Example core rule
 * ├── personas/         # Project-specific personas (empty)
 * ├── commands/         # Project-specific commands (empty)
 * └── hooks/            # Project-specific hooks (empty)
 */

import * as path from 'node:path';

import { getAiPaths, hasConfigDir } from '../../config/loader.js';
import { ensureDir, writeFile, fileExists } from '../../utils/fs.js';
import { logger } from '../../utils/logger.js';
import {
  printHeader,
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
}

/**
 * Result of the init command
 */
export interface InitResult {
  success: boolean;
  filesCreated: string[];
  errors: string[];
}

/**
 * Template for config.yaml
 */
const CONFIG_TEMPLATE = `# =============================================================================
# AI Tool Sync - Project Configuration
# =============================================================================
# This file configures how ai-sync generates tool-specific outputs.
# For full documentation, see: https://github.com/anthropic/ai-tool-sync

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
 * Template for _core.md rule
 */
const CORE_RULE_TEMPLATE = `---
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
2. Add more rules in \`.ai/rules/\` for specific topics
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

/**
 * Execute the init command
 */
export async function init(options: InitOptions = {}): Promise<InitResult> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const paths = getAiPaths(projectRoot);
  const filesCreated: string[] = [];
  const errors: string[] = [];

  printHeader('Initialize AI Configuration');

  // Check if .ai/ already exists
  if (await hasConfigDir(projectRoot)) {
    if (!options.force) {
      printWarning('Configuration directory already exists: .ai/');
      printNewLine();
      printError('Use --force to overwrite existing configuration');
      return {
        success: false,
        filesCreated: [],
        errors: ['Configuration already exists. Use --force to overwrite.'],
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
        filesCreated.push('.ai/config.yaml');
        printGeneratedFile('.ai/config.yaml', 'created');
      } else {
        errors.push(`Failed to create config.yaml: ${result.error.message}`);
      }
    } else {
      printGeneratedFile('.ai/config.yaml', 'skipped');
    }

    // Create _core.md rule
    const corePath = path.join(paths.rulesDir, '_core.md');
    if (options.force || !(await fileExists(corePath))) {
      const result = await writeFile(corePath, CORE_RULE_TEMPLATE);
      if (result.ok) {
        filesCreated.push('.ai/rules/_core.md');
        printGeneratedFile('.ai/rules/_core.md', 'created');
      } else {
        errors.push(`Failed to create _core.md: ${result.error.message}`);
      }
    } else {
      printGeneratedFile('.ai/rules/_core.md', 'skipped');
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

    const success = errors.length === 0;

    printSummary({
      success,
      message: success
        ? `Created ${filesCreated.length} files in .ai/`
        : `Initialization completed with ${errors.length} errors`,
    });

    if (success) {
      printNewLine();
      logger.info('Next steps:');
      logger.list('Edit .ai/config.yaml to configure your project');
      logger.list('Edit .ai/rules/_core.md with your project context');
      logger.list('Run ai-sync to generate tool configurations');
    }

    return {
      success,
      filesCreated,
      errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printError(`Initialization failed: ${message}`);
    return {
      success: false,
      filesCreated,
      errors: [message],
    };
  }
}

