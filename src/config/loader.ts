/**
 * @file Configuration Loader
 * @description Load and parse .ai/config.yaml
 *
 * This is a stub file - full implementation in Phase 2
 */

import * as path from 'node:path';

import { type Result, err, ok } from '../utils/result.js';

import type { Config, ConfigOptions, ConfigValidationError, ResolvedConfig } from './types.js';

/**
 * Load configuration from .ai/config.yaml
 */
export async function loadConfig(options: ConfigOptions = {}): Promise<Result<ResolvedConfig>> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const aiDir = options.aiDir ?? path.join(projectRoot, '.ai');
  const configPath = options.configPath ?? path.join(aiDir, 'config.yaml');

  // Stub implementation - returns default config
  const config: ResolvedConfig = {
    version: '1.0.0',
    projectRoot,
    aiDir,
    configPath,
    targets: ['cursor', 'claude', 'factory'],
  };

  return ok(config);
}

/**
 * Validate configuration
 */
export async function validateConfig(
  config: Config
): Promise<Result<Config, ConfigValidationError[]>> {
  const errors: ConfigValidationError[] = [];

  if (!config.version) {
    errors.push({
      path: 'version',
      message: 'Version is required',
    });
  }

  if (errors.length > 0) {
    return err(errors);
  }

  return ok(config);
}

