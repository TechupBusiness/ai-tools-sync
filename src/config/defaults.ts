/**
 * @file Configuration Defaults
 * @description Default configuration values for ai-tool-sync
 */

import type { Config, OutputConfig } from './types.js';

/**
 * Default output configuration
 */
export const DEFAULT_OUTPUT: Required<OutputConfig> = {
  clean_before_sync: true,
  add_do_not_edit_headers: true,
};

/**
 * Default targets to generate for
 */
export const DEFAULT_TARGETS = ['cursor', 'claude', 'factory'] as const;

/**
 * Supported target names
 */
export type SupportedTarget = (typeof DEFAULT_TARGETS)[number];

/**
 * Check if a string is a supported target
 */
export function isSupportedTarget(target: string): target is SupportedTarget {
  return DEFAULT_TARGETS.includes(target as SupportedTarget);
}

/**
 * Default configuration version
 */
export const DEFAULT_CONFIG_VERSION = '1.0.0';

/**
 * Default loader configuration - always includes ai-tool-sync
 */
export const DEFAULT_LOADERS = [{ type: 'ai-tool-sync' as const }];

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: Partial<Config> = {
  version: DEFAULT_CONFIG_VERSION,
  targets: [...DEFAULT_TARGETS],
  loaders: DEFAULT_LOADERS,
  output: DEFAULT_OUTPUT,
};

/**
 * Apply defaults to a partial config
 */
export function applyDefaults(config: Partial<Config>): Config {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    // Deep merge nested objects
    output: {
      ...DEFAULT_OUTPUT,
      ...config.output,
    },
    // Ensure targets array exists
    targets: config.targets ?? [...DEFAULT_TARGETS],
    // Ensure loaders array exists (but don't override if provided)
    loaders: config.loaders ?? DEFAULT_LOADERS,
  } as Config;
}

/**
 * Validate that a version string is in semver format
 */
export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

/**
 * Compare two semver versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const partA = partsA[i] ?? 0;
    const partB = partsB[i] ?? 0;
    if (partA < partB) return -1;
    if (partA > partB) return 1;
  }
  return 0;
}

/**
 * Check if a config version is compatible with current tool version
 */
export function isVersionCompatible(
  configVersion: string,
  toolVersion: string = DEFAULT_CONFIG_VERSION
): boolean {
  if (!isValidVersion(configVersion)) {
    return false;
  }

  // For now, major version must match
  const configMajor = configVersion.split('.')[0];
  const toolMajor = toolVersion.split('.')[0];
  return configMajor === toolMajor;
}

