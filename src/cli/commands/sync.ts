/**
 * @file Sync Command
 * @description Main sync command - loads config, runs loaders, runs generators
 *
 * This is the primary command that:
 * 1. Loads configuration from .ai/config.yaml
 * 2. Loads content from various sources (local, npm, etc.)
 * 3. Runs generators for each configured target (cursor, claude, factory)
 * 4. Generates subfolder contexts if configured
 */

import * as path from 'node:path';

import { loadConfig } from '../../config/loader.js';
import {
  type GenerateResult,
  type ResolvedContent,
  createResolvedContent,
  mergeGenerateResults,
  getGenerateResultStats,
} from '../../generators/base.js';
import {
  createCursorGenerator,
  createClaudeGenerator,
  createFactoryGenerator,
  createSubfolderContextGenerator,
} from '../../generators/index.js';
import {
  type LoadResult,
  mergeLoadResults,
  isLoadResultEmpty,
  getLoadResultStats,
} from '../../loaders/base.js';
import { createLocalLoader } from '../../loaders/local.js';
import { updateGitignore } from '../../utils/gitignore.js';
import { logger } from '../../utils/logger.js';
import {
  collectGeneratedPaths,
  createManifest,
  MANIFEST_FILENAME,
  writeManifest,
} from '../../utils/manifest.js';
import {
  printHeader,
  printSuccess,
  printWarning,
  printError,
  printStats,
  printSummary,
  printNewLine,
  printGeneratedFile,
  printSubHeader,
} from '../output.js';

import type { ResolvedConfig } from '../../config/types.js';

/**
 * Current version for manifest
 */
const MANIFEST_VERSION = '1.0.0';

/**
 * Options for the sync command
 */
export interface SyncOptions {
  /** Enable verbose output */
  verbose?: boolean | undefined;
  /** Dry run mode - don't write files */
  dryRun?: boolean | undefined;
  /** Clean output directories before generating */
  clean?: boolean | undefined;
  /** Project root directory */
  projectRoot?: string | undefined;
  /** Configuration directory name (relative to project root) */
  configDir?: string | undefined;
  /** Update .gitignore with generated paths (overrides config) */
  updateGitignore?: boolean | undefined;
}

/**
 * Result of the sync command
 */
export interface SyncResult {
  success: boolean;
  filesGenerated: number;
  filesDeleted: number;
  warnings: string[];
  errors: string[];
  duration: number;
}

/**
 * Execute the sync command
 */
export async function sync(options: SyncOptions = {}): Promise<SyncResult> {
  const startTime = Date.now();
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());

  printHeader('AI Tool Sync');

  if (options.dryRun) {
    printWarning('Dry run mode - no files will be written');
    printNewLine();
  }

  // Step 1: Load configuration
  logger.debug('Loading configuration...');
  const configResult = await loadConfig({ projectRoot, configDir: options.configDir });

  if (!configResult.ok) {
    printError(configResult.error.message);
    return {
      success: false,
      filesGenerated: 0,
      filesDeleted: 0,
      warnings: [],
      errors: [configResult.error.message],
      duration: Date.now() - startTime,
    };
  }

  const config = configResult.value;
  logger.debug(`Loaded config from ${config.configPath}`);

  if (config.project_name) {
    printSuccess(`Project: ${config.project_name}`);
  }

  // Step 2: Load content from sources
  printSubHeader('Loading content');
  const loadResult = await loadContent(config, options);

  if (isLoadResultEmpty(loadResult)) {
    printWarning('No content found to sync');
    printSummary({
      success: true,
      message: 'No content to sync',
      duration: Date.now() - startTime,
    });
    return {
      success: true,
      filesGenerated: 0,
      filesDeleted: 0,
      warnings: ['No content found'],
      errors: [],
      duration: Date.now() - startTime,
    };
  }

  const loadStats = getLoadResultStats(loadResult);
  printStats('Loaded', {
    rules: loadStats.rules,
    personas: loadStats.personas,
    commands: loadStats.commands,
    hooks: loadStats.hooks,
  });

  // Report load errors if any
  if (loadResult.errors && loadResult.errors.length > 0) {
    printNewLine();
    printWarning(`${loadResult.errors.length} load error(s):`);
    for (const err of loadResult.errors) {
      logger.warn(`  ${err.path}: ${err.message}`);
    }
  }

  // Step 3: Create resolved content
  const resolvedContent = createResolvedContent(
    loadResult,
    config.projectRoot,
    config.project_name
  );

  // Step 4: Run generators for each target
  printSubHeader('Generating outputs');
  const generateResult = await runGenerators(config, resolvedContent, options);

  // Step 5: Generate subfolder contexts if configured
  if (config.subfolder_contexts && Object.keys(config.subfolder_contexts).length > 0) {
    printSubHeader('Generating subfolder contexts');
    const subfolderResult = await generateSubfolderContexts(config, resolvedContent, options);
    Object.assign(generateResult, mergeGenerateResults(generateResult, subfolderResult));
  }

  // Step 6: Generate manifest and update gitignore
  if (!options.dryRun && generateResult.files.length > 0) {
    const manifestResult = await generateManifestAndGitignore(
      config,
      generateResult.files,
      options
    );
    if (manifestResult.manifestWritten) {
      generateResult.files.push(MANIFEST_FILENAME);
    }
    if (manifestResult.gitignoreUpdated) {
      generateResult.warnings.push(...manifestResult.warnings);
    }
  }

  // Report results
  const stats = getGenerateResultStats(generateResult);
  const totalWarnings = [...generateResult.warnings];

  // Print generated files in verbose mode
  if (options.verbose && generateResult.files.length > 0) {
    printNewLine();
    for (const file of generateResult.files) {
      printGeneratedFile(file, 'created');
    }
  }

  // Print summary
  const success = generateResult.warnings.filter((w) => w.includes('error')).length === 0;

  printSummary({
    success,
    message: success
      ? `Synced ${stats.files} file${stats.files !== 1 ? 's' : ''}`
      : 'Sync completed with errors',
    duration: Date.now() - startTime,
    dryRun: options.dryRun,
  });

  if (generateResult.warnings.length > 0) {
    for (const warning of generateResult.warnings) {
      printWarning(warning);
    }
  }

  return {
    success,
    filesGenerated: stats.files,
    filesDeleted: stats.deleted,
    warnings: totalWarnings,
    errors: [],
    duration: Date.now() - startTime,
  };
}

/**
 * Load content from all configured sources
 */
async function loadContent(config: ResolvedConfig, _options: SyncOptions): Promise<LoadResult> {
  const results: LoadResult[] = [];
  const localLoader = createLocalLoader();

  // Use the aiDir from resolved config (already has proper directory)
  const aiDir = config.aiDir;

  // Load from config directory (project-specific content)
  logger.debug(`Loading from project: ${aiDir}`);
  const projectResult = await localLoader.load(aiDir, {
    basePath: config.projectRoot,
    targets: config.targets as Array<'cursor' | 'claude' | 'factory'>,
  });
  results.push(projectResult);

  // Load from ai-tool-sync defaults if configured
  if (config.loaders) {
    for (const loaderConfig of config.loaders) {
      if (loaderConfig.type === 'ai-tool-sync') {
        // Load from defaults directory in the package
        const defaultsPath = path.resolve(
          path.dirname(new URL(import.meta.url).pathname),
          '../../../defaults'
        );
        logger.debug(`Loading defaults from: ${defaultsPath}`);
        const defaultsResult = await localLoader.load(defaultsPath, {
          basePath: config.projectRoot,
          targets: config.targets as Array<'cursor' | 'claude' | 'factory'>,
        });
        results.push(defaultsResult);
      } else if (loaderConfig.type === 'local' && loaderConfig.source) {
        logger.debug(`Loading from local: ${loaderConfig.source}`);
        const localResult = await localLoader.load(loaderConfig.source, {
          basePath: config.projectRoot,
          targets: config.targets as Array<'cursor' | 'claude' | 'factory'>,
        });
        results.push(localResult);
      }
      // TODO: Add npm, pip, url loaders when ready
    }
  }

  // Filter content based on config.use settings
  const merged = mergeLoadResults(...results);
  return filterByUseConfig(merged, config);
}

/**
 * Filter loaded content by the use config
 */
function filterByUseConfig(result: LoadResult, config: ResolvedConfig): LoadResult {
  // If no use config, return all content
  if (!config.use) {
    return result;
  }

  // Filter personas if specified
  if (config.use.personas && config.use.personas.length > 0) {
    const allowedPersonas = new Set(config.use.personas);
    result.personas = result.personas.filter((p) => allowedPersonas.has(p.frontmatter.name));
  }

  // Filter commands if specified
  if (config.use.commands && config.use.commands.length > 0) {
    const allowedCommands = new Set(config.use.commands);
    result.commands = result.commands.filter((c) => allowedCommands.has(c.frontmatter.name));
  }

  return result;
}

/**
 * Run generators for all configured targets
 */
async function runGenerators(
  config: ResolvedConfig,
  content: ResolvedContent,
  options: SyncOptions
): Promise<GenerateResult> {
  const results: GenerateResult[] = [];
  const targets = config.targets ?? ['cursor', 'claude', 'factory'];

  const generatorOptions = {
    outputDir: config.projectRoot,
    clean: options.clean ?? config.output?.clean_before_sync ?? true,
    addHeaders: config.output?.add_do_not_edit_headers ?? true,
    dryRun: options.dryRun,
    verbose: options.verbose,
  };

  for (const target of targets) {
    logger.debug(`Generating for target: ${target}`);

    let generator;
    switch (target) {
      case 'cursor':
        generator = createCursorGenerator();
        break;
      case 'claude':
        generator = createClaudeGenerator();
        break;
      case 'factory':
        generator = createFactoryGenerator();
        break;
      default:
        logger.warn(`Unknown target: ${target}`);
        continue;
    }

    try {
      const result = await generator.generate(content, generatorOptions);
      results.push(result);

      printSuccess(`${target}: ${result.files.length} files`);
      logger.debug(`  Generated ${result.files.length} files, ${result.warnings.length} warnings`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to generate for ${target}: ${message}`);
      results.push({
        files: [],
        deleted: [],
        warnings: [`Generator error for ${target}: ${message}`],
      });
    }
  }

  return mergeGenerateResults(...results);
}

/**
 * Generate subfolder contexts
 */
async function generateSubfolderContexts(
  config: ResolvedConfig,
  content: ResolvedContent,
  options: SyncOptions
): Promise<GenerateResult> {
  if (!config.subfolder_contexts) {
    return { files: [], deleted: [], warnings: [] };
  }

  // Convert config to generator format
  const subfolderConfigs = Object.entries(config.subfolder_contexts).map(([folderPath, cfg]) => ({
    path: folderPath,
    rules: cfg.rules,
    personas: cfg.personas,
    description: cfg.description,
    targets: config.targets as Array<'cursor' | 'claude' | 'factory'>,
  }));

  const generator = createSubfolderContextGenerator(subfolderConfigs);
  const generatorOptions = {
    outputDir: config.projectRoot,
    clean: false, // Don't clean subfolder contexts
    addHeaders: config.output?.add_do_not_edit_headers ?? true,
    dryRun: options.dryRun,
    verbose: options.verbose,
  };

  try {
    const result = await generator.generate(content, generatorOptions);
    printSuccess(`Subfolder contexts: ${result.files.length} files`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to generate subfolder contexts: ${message}`);
    return {
      files: [],
      deleted: [],
      warnings: [`Subfolder context error: ${message}`],
    };
  }
}

/**
 * Result of manifest and gitignore generation
 */
interface ManifestGitignoreResult {
  manifestWritten: boolean;
  gitignoreUpdated: boolean;
  warnings: string[];
}

/**
 * Generate manifest file and optionally update .gitignore
 */
async function generateManifestAndGitignore(
  config: ResolvedConfig,
  files: string[],
  options: SyncOptions
): Promise<ManifestGitignoreResult> {
  const result: ManifestGitignoreResult = {
    manifestWritten: false,
    gitignoreUpdated: false,
    warnings: [],
  };

  // Collect all generated paths
  const { files: generatedFiles, directories } = collectGeneratedPaths(
    files,
    config.projectRoot
  );

  // Create and write manifest
  const manifest = createManifest(generatedFiles, directories, MANIFEST_VERSION);
  const manifestResult = await writeManifest(config.projectRoot, manifest);

  if (manifestResult.ok) {
    result.manifestWritten = true;
    logger.debug(`Wrote manifest: ${MANIFEST_FILENAME}`);
  } else {
    result.warnings.push(`Failed to write manifest: ${manifestResult.error.message}`);
    logger.warn(`Failed to write manifest: ${manifestResult.error.message}`);
  }

  // Update .gitignore if enabled
  const shouldUpdateGitignore = options.updateGitignore ?? config.output?.update_gitignore ?? true;

  if (shouldUpdateGitignore) {
    const gitignoreResult = await updateGitignore(config.projectRoot, manifest, {
      createIfMissing: false, // Don't create .gitignore if it doesn't exist during sync
    });

    if (gitignoreResult.ok) {
      if (gitignoreResult.value.changed) {
        result.gitignoreUpdated = true;
        printSuccess('.gitignore updated with generated paths');
        logger.debug('Updated .gitignore with managed section');
      }
    } else {
      result.warnings.push(`Failed to update .gitignore: ${gitignoreResult.error.message}`);
      logger.warn(`Failed to update .gitignore: ${gitignoreResult.error.message}`);
    }
  }

  return result;
}

