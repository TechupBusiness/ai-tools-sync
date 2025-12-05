/**
 * @file Validate Command
 * @description Validate configuration without generating output
 *
 * Performs comprehensive validation:
 * 1. Config file syntax and schema validation
 * 2. Rule/persona/command file parsing
 * 3. Reference validation (rules that reference other rules)
 * 4. Target compatibility checks
 */

import * as path from 'node:path';

import { loadConfig, getAiPaths } from '../../config/loader.js';
import type { ResolvedConfig } from '../../config/types.js';
import { createLocalLoader } from '../../loaders/local.js';
import {
  type LoadResult,
  isLoadResultEmpty,
  getLoadResultStats,
} from '../../loaders/base.js';
import { logger } from '../../utils/logger.js';
import {
  printHeader,
  printSuccess,
  printWarning,
  printError,
  printSummary,
  printNewLine,
  printValidationErrors,
  printStats,
  printSubHeader,
  printKeyValue,
} from '../output.js';

/**
 * Options for the validate command
 */
export interface ValidateOptions {
  /** Enable verbose output */
  verbose?: boolean;
  /** Project root directory */
  projectRoot?: string;
}

/**
 * Result of the validate command
 */
export interface ValidateResult {
  success: boolean;
  configValid: boolean;
  contentValid: boolean;
  warnings: string[];
  errors: Array<{ path: string; message: string }>;
}

/**
 * Execute the validate command
 */
export async function validate(options: ValidateOptions = {}): Promise<ValidateResult> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const errors: Array<{ path: string; message: string }> = [];
  const warnings: string[] = [];

  printHeader('Validate Configuration');

  // Step 1: Validate config file
  printSubHeader('Checking configuration');

  const configResult = await loadConfig({ projectRoot });

  if (!configResult.ok) {
    printError('Configuration validation failed');
    printNewLine();

    // Parse the error message to extract validation errors
    const errorMessage = configResult.error.message;
    if (errorMessage.includes('validation failed')) {
      // Extract individual errors from the message
      const lines = errorMessage.split('\n');
      for (const line of lines.slice(1)) {
        const trimmed = line.trim();
        if (trimmed.startsWith('-')) {
          errors.push({
            path: 'config.yaml',
            message: trimmed.substring(2),
          });
        }
      }
    } else {
      errors.push({
        path: 'config.yaml',
        message: errorMessage,
      });
    }

    printValidationErrors(errors);

    return {
      success: false,
      configValid: false,
      contentValid: false,
      warnings,
      errors,
    };
  }

  const config = configResult.value;
  printSuccess('Configuration file is valid');

  if (options.verbose) {
    printNewLine();
    printKeyValue('Version', config.version);
    if (config.project_name) {
      printKeyValue('Project', config.project_name);
    }
    printKeyValue('Targets', (config.targets ?? []).join(', '));
    printKeyValue('Loaders', (config.loaders ?? []).map((l) => l.type).join(', '));
  }

  // Step 2: Validate content files
  printSubHeader('Checking content files');

  const loadResult = await loadContent(config, options);
  const loadStats = getLoadResultStats(loadResult);

  // Report what was found
  printStats('Found', {
    rules: loadStats.rules,
    personas: loadStats.personas,
    commands: loadStats.commands,
    hooks: loadStats.hooks,
  });

  // Check for load errors
  if (loadResult.errors && loadResult.errors.length > 0) {
    printNewLine();
    printError(`${loadResult.errors.length} content error(s) found`);

    for (const err of loadResult.errors) {
      errors.push({
        path: err.path,
        message: err.message,
      });
    }

    printValidationErrors(errors);
  } else {
    printSuccess('All content files are valid');
  }

  // Step 3: Validate references
  printSubHeader('Checking references');

  const refErrors = validateReferences(loadResult, config);
  if (refErrors.length > 0) {
    printError(`${refErrors.length} reference error(s) found`);
    errors.push(...refErrors);
    printValidationErrors(refErrors);
  } else {
    printSuccess('All references are valid');
  }

  // Step 4: Check for common issues
  printSubHeader('Checking for issues');

  const issues = checkForIssues(loadResult, config);
  if (issues.warnings.length > 0) {
    for (const warning of issues.warnings) {
      printWarning(warning);
      warnings.push(warning);
    }
  } else {
    printSuccess('No issues found');
  }

  // Final summary
  const success = errors.length === 0;

  printSummary({
    success,
    message: success
      ? 'Configuration is valid'
      : `Validation failed with ${errors.length} error(s)`,
  });

  return {
    success,
    configValid: configResult.ok,
    contentValid: loadResult.errors === undefined || loadResult.errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Load content from configured sources
 */
async function loadContent(config: ResolvedConfig, options: ValidateOptions): Promise<LoadResult> {
  const localLoader = createLocalLoader();
  const paths = getAiPaths(config.projectRoot);

  // Load from .ai/ directory
  logger.debug(`Loading from project: ${paths.aiDir}`);
  const result = await localLoader.load(paths.aiDir, {
    basePath: config.projectRoot,
    targets: config.targets as Array<'cursor' | 'claude' | 'factory'>,
    continueOnError: true, // Continue to find all errors
  });

  return result;
}

/**
 * Validate that all references in rules exist
 */
function validateReferences(
  loadResult: LoadResult,
  config: ResolvedConfig
): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];

  // Build set of available rule names
  const ruleNames = new Set(loadResult.rules.map((r) => r.frontmatter.name));

  // Check requires references in rules
  for (const rule of loadResult.rules) {
    const requires = rule.frontmatter.requires ?? [];
    for (const req of requires) {
      if (!ruleNames.has(req)) {
        errors.push({
          path: rule.filePath ?? rule.frontmatter.name,
          message: `Rule requires non-existent rule: '${req}'`,
        });
      }
    }
  }

  // Check subfolder_contexts references
  if (config.subfolder_contexts) {
    for (const [folder, ctx] of Object.entries(config.subfolder_contexts)) {
      for (const ruleName of ctx.rules) {
        if (!ruleNames.has(ruleName)) {
          errors.push({
            path: `subfolder_contexts.${folder}`,
            message: `References non-existent rule: '${ruleName}'`,
          });
        }
      }

      // Check persona references
      if (ctx.personas) {
        const personaNames = new Set(loadResult.personas.map((p) => p.frontmatter.name));
        for (const personaName of ctx.personas) {
          if (!personaNames.has(personaName)) {
            errors.push({
              path: `subfolder_contexts.${folder}`,
              message: `References non-existent persona: '${personaName}'`,
            });
          }
        }
      }
    }
  }

  // Check use.personas references against default personas
  // (This would need a list of default personas to validate against)

  return errors;
}

/**
 * Check for common issues and warnings
 */
function checkForIssues(
  loadResult: LoadResult,
  config: ResolvedConfig
): { warnings: string[]; suggestions: string[] } {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Check if no rules are always_apply
  const alwaysApplyRules = loadResult.rules.filter((r) => r.frontmatter.always_apply);
  if (alwaysApplyRules.length === 0 && loadResult.rules.length > 0) {
    warnings.push('No rules have always_apply: true - consider marking core rules');
  }

  // Check for rules without globs that aren't always_apply
  const noGlobRules = loadResult.rules.filter(
    (r) => !r.frontmatter.always_apply && (!r.frontmatter.globs || r.frontmatter.globs.length === 0)
  );
  if (noGlobRules.length > 0) {
    for (const rule of noGlobRules) {
      warnings.push(
        `Rule '${rule.frontmatter.name}' has no globs and always_apply is false - it may never trigger`
      );
    }
  }

  // Check for hooks when targeting cursor (not supported)
  if (loadResult.hooks.length > 0 && config.targets?.includes('cursor')) {
    const cursorHooks = loadResult.hooks.filter((h) =>
      (h.frontmatter.targets ?? ['claude']).includes('cursor')
    );
    if (cursorHooks.length > 0) {
      warnings.push(`${cursorHooks.length} hook(s) target cursor but Cursor does not support hooks`);
    }
  }

  // Check for duplicate names
  const ruleNames = loadResult.rules.map((r) => r.frontmatter.name);
  const duplicateRules = ruleNames.filter((name, index) => ruleNames.indexOf(name) !== index);
  if (duplicateRules.length > 0) {
    warnings.push(`Duplicate rule names found: ${[...new Set(duplicateRules)].join(', ')}`);
  }

  const personaNames = loadResult.personas.map((p) => p.frontmatter.name);
  const duplicatePersonas = personaNames.filter((name, index) => personaNames.indexOf(name) !== index);
  if (duplicatePersonas.length > 0) {
    warnings.push(`Duplicate persona names found: ${[...new Set(duplicatePersonas)].join(', ')}`);
  }

  // Check for very large rules (might indicate context issues)
  const largeRules = loadResult.rules.filter((r) => r.content.length > 10000);
  if (largeRules.length > 0) {
    warnings.push(
      `${largeRules.length} rule(s) exceed 10KB - consider splitting into smaller rules`
    );
  }

  return { warnings, suggestions };
}

