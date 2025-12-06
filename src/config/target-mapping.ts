/**
 * @file Target Mapping Loader
 * @description Load and merge target configuration files
 *
 * Target mappings define how content is transformed for each target platform.
 * This includes output directories, tool mappings, model mappings, and
 * frontmatter transformations.
 *
 * Default mappings are in ai-tool-sync/targets/
 * Project overrides are in .ai/targets/
 */

import { fileExists, joinPath, readFile } from '../utils/fs.js';
import { err, ok, type Result } from '../utils/result.js';
import { parseYaml } from '../utils/yaml.js';

import type { TargetType } from '../parsers/types.js';

/**
 * Output configuration for a target
 */
export interface TargetOutputConfig {
  /** Root directory for target configuration */
  root_dir?: string;
  /** Directory for rules */
  rules_dir: string;
  /** Format for rules (mdc, md, skill) */
  rules_format: 'mdc' | 'md' | 'skill';
  /** File extension for rules */
  rules_extension?: string;
  /** Directory for personas */
  personas_dir: string;
  /** Format for personas */
  personas_format: 'md';
  /** Directory for commands */
  commands_dir?: string;
  /** Format for commands */
  commands_format?: 'md';
  /** Settings file path */
  settings_file?: string;
  /** Entry point file */
  entry_point?: string;
  /** MCP configuration file */
  mcp_file?: string;
}

/**
 * Tool mapping options
 */
export interface ToolMappingOptions {
  /** Whether to preserve unknown tools */
  preserve_unknown: boolean;
  /** Transform for unknown tools */
  unknown_transform: 'capitalize' | 'lowercase' | 'uppercase' | 'none';
}

/**
 * Model mapping options
 */
export interface ModelMappingOptions {
  /** Behavior for "inherit" model */
  inherit_behavior: 'passthrough' | 'use-default';
  /** Behavior for unknown models */
  unknown_behavior: 'passthrough' | 'use-default';
}

/**
 * Frontmatter transformation config for a content type
 */
export interface FrontmatterConfig {
  /** Fields to include in output */
  include_fields: string[];
  /** Field name mappings (generic -> target) */
  field_mappings: Record<string, string>;
  /** Value transformations per field */
  transforms: Record<string, string>;
}

/**
 * Frontmatter configurations for all content types
 */
export interface FrontmatterConfigs {
  rules?: FrontmatterConfig;
  personas?: FrontmatterConfig;
  commands?: FrontmatterConfig;
  hooks?: FrontmatterConfig;
}

/**
 * Terminology mapping (generic -> target-specific)
 */
export interface TerminologyMapping {
  rule?: string | null;
  persona?: string | null;
  command?: string | null;
  hook?: string | null;
  skill?: string | null;
  agent?: string | null;
}

/**
 * Import syntax configuration
 */
export interface ImportSyntaxConfig {
  enabled: boolean;
  format: string;
}

/**
 * Complete target mapping configuration
 */
export interface TargetMapping {
  /** Target name */
  name: TargetType;
  /** Configuration version */
  version: string;
  /** Description */
  description: string;

  /** Output configuration */
  output: TargetOutputConfig;

  /** Tool name mappings */
  tool_mapping: Record<string, string>;
  /** Tool mapping options */
  tool_options: ToolMappingOptions;

  /** Model name mappings */
  model_mapping: Record<string, string>;
  /** Model mapping options */
  model_options: ModelMappingOptions;

  /** Frontmatter transformations */
  frontmatter: FrontmatterConfigs;

  /** Supported features */
  supported?: string[] | undefined;
  /** Unsupported features */
  unsupported: string[];
  /** Behavior for unsupported features */
  unsupported_behavior: 'warn' | 'skip' | 'error';

  /** Hook events (if supported) */
  hook_events?: string[] | undefined;

  /** Import syntax configuration */
  import_syntax?: ImportSyntaxConfig | undefined;

  /** Terminology mapping */
  terminology: TerminologyMapping;
}

/**
 * Options for loading target mappings
 */
export interface LoadTargetMappingOptions {
  /** Path to ai-tool-sync root (for default targets) */
  toolRoot?: string;
  /** Path to project root (for project overrides) */
  projectRoot?: string;
  /** Path to .ai directory */
  aiDir?: string;
}

/**
 * Default target mapping values
 */
const DEFAULT_TOOL_OPTIONS: ToolMappingOptions = {
  preserve_unknown: true,
  unknown_transform: 'none',
};

const DEFAULT_MODEL_OPTIONS: ModelMappingOptions = {
  inherit_behavior: 'passthrough',
  unknown_behavior: 'passthrough',
};

/**
 * Get the default targets directory path
 */
function getDefaultTargetsDir(): string {
  // In the built package, targets/ is at the package root
  // During development, it's relative to the source
  const url = new URL('../../targets', import.meta.url);
  return url.pathname;
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  // Cast to allow dynamic property access
  const result = { ...base } as Record<string, unknown>;
  const overrideRecord = override as Record<string, unknown>;

  for (const key of Object.keys(override)) {
    const overrideValue = overrideRecord[key];

    if (overrideValue === undefined) {
      continue;
    }

    const baseValue = result[key];

    if (
      typeof overrideValue === 'object' &&
      overrideValue !== null &&
      !Array.isArray(overrideValue) &&
      typeof baseValue === 'object' &&
      baseValue !== null &&
      !Array.isArray(baseValue)
    ) {
      // Deep merge objects
      result[key] = deepMerge(
        baseValue as Record<string, unknown>,
        overrideValue as Record<string, unknown>
      );
    } else {
      // Direct assignment for primitives and arrays
      result[key] = overrideValue;
    }
  }

  return result as T;
}

/**
 * Load a target mapping file
 */
async function loadTargetFile(
  filePath: string
): Promise<Result<Partial<TargetMapping>, Error>> {
  const exists = await fileExists(filePath);
  if (!exists) {
    return err(new Error(`Target file not found: ${filePath}`));
  }

  const readResult = await readFile(filePath);
  if (!readResult.ok) {
    return err(new Error(`Failed to read target file: ${readResult.error.message}`));
  }

  const parseResult = parseYaml<Partial<TargetMapping>>(readResult.value);
  if (!parseResult.ok) {
    return err(new Error(`Failed to parse target file: ${parseResult.error.message}`));
  }

  return ok(parseResult.value);
}

/**
 * Apply defaults to a partial target mapping
 */
function applyDefaults(partial: Partial<TargetMapping>): TargetMapping {
  return {
    name: partial.name ?? ('unknown' as TargetType),
    version: partial.version ?? '1.0.0',
    description: partial.description ?? '',
    output: partial.output ?? {
      rules_dir: '.rules',
      rules_format: 'md',
      personas_dir: '.personas',
      personas_format: 'md',
    },
    tool_mapping: partial.tool_mapping ?? {},
    tool_options: { ...DEFAULT_TOOL_OPTIONS, ...partial.tool_options },
    model_mapping: partial.model_mapping ?? {},
    model_options: { ...DEFAULT_MODEL_OPTIONS, ...partial.model_options },
    frontmatter: partial.frontmatter ?? {},
    supported: partial.supported,
    unsupported: partial.unsupported ?? [],
    unsupported_behavior: partial.unsupported_behavior ?? 'warn',
    hook_events: partial.hook_events,
    import_syntax: partial.import_syntax,
    terminology: partial.terminology ?? {},
  };
}

/**
 * Load target mapping for a specific target
 *
 * @param target - Target name (cursor, claude, factory)
 * @param options - Loading options
 * @returns Target mapping or error
 *
 * @example
 * const mapping = await loadTargetMapping('cursor', { projectRoot: '/my/project' });
 * if (mapping.ok) {
 *   console.log(mapping.value.output.rules_dir); // '.cursor/rules'
 * }
 */
export async function loadTargetMapping(
  target: TargetType,
  options: LoadTargetMappingOptions = {}
): Promise<Result<TargetMapping, Error>> {
  const targetsDir = options.toolRoot
    ? joinPath(options.toolRoot, 'targets')
    : getDefaultTargetsDir();

  // Load default target mapping
  const defaultPath = joinPath(targetsDir, `${target}.yaml`);
  const defaultResult = await loadTargetFile(defaultPath);

  if (!defaultResult.ok) {
    return err(new Error(`Failed to load default target mapping for ${target}: ${defaultResult.error.message}`));
  }

  let mapping = applyDefaults(defaultResult.value);

  // Load project override if available
  if (options.projectRoot) {
    const aiDir = options.aiDir ?? joinPath(options.projectRoot, '.ai');
    const overridePath = joinPath(aiDir, 'targets', `${target}.yaml`);

    if (await fileExists(overridePath)) {
      const overrideResult = await loadTargetFile(overridePath);
      if (overrideResult.ok) {
        // Merge override with default
        mapping = deepMerge(mapping, overrideResult.value);
      }
      // If override fails to load, we continue with defaults (could log a warning)
    }
  }

  return ok(mapping);
}

/**
 * Load all target mappings
 *
 * @param targets - Array of target names to load
 * @param options - Loading options
 * @returns Map of target name to mapping
 */
export async function loadAllTargetMappings(
  targets: TargetType[],
  options: LoadTargetMappingOptions = {}
): Promise<Result<Map<TargetType, TargetMapping>, Error>> {
  const mappings = new Map<TargetType, TargetMapping>();
  const errors: string[] = [];

  for (const target of targets) {
    const result = await loadTargetMapping(target, options);
    if (result.ok) {
      mappings.set(target, result.value);
    } else {
      errors.push(`${target}: ${result.error.message}`);
    }
  }

  if (errors.length > 0 && mappings.size === 0) {
    return err(new Error(`Failed to load any target mappings:\n${errors.join('\n')}`));
  }

  return ok(mappings);
}

/**
 * Get the output directory for a content type
 */
export function getOutputDir(mapping: TargetMapping, contentType: 'rules' | 'personas' | 'commands'): string {
  switch (contentType) {
    case 'rules':
      return mapping.output.rules_dir;
    case 'personas':
      return mapping.output.personas_dir;
    case 'commands':
      return mapping.output.commands_dir ?? mapping.output.personas_dir;
  }
}

/**
 * Check if a feature is supported by a target
 */
export function isFeatureSupported(mapping: TargetMapping, feature: string): boolean {
  return !mapping.unsupported.includes(feature);
}

/**
 * Get the target-specific term for a generic term
 */
export function getTerminology(
  mapping: TargetMapping,
  genericTerm: keyof TerminologyMapping
): string | null {
  const term = mapping.terminology[genericTerm];
  return term === undefined ? genericTerm : term;
}

/**
 * Get tool mapping for a target
 */
export function getToolMapping(mapping: TargetMapping): Record<string, string> {
  return { ...mapping.tool_mapping };
}

/**
 * Get model mapping for a target
 */
export function getModelMapping(mapping: TargetMapping): Record<string, string> {
  return { ...mapping.model_mapping };
}

/**
 * Get frontmatter config for a content type
 */
export function getFrontmatterConfig(
  mapping: TargetMapping,
  contentType: 'rules' | 'personas' | 'commands' | 'hooks'
): FrontmatterConfig | undefined {
  return mapping.frontmatter[contentType];
}

/**
 * Check if import syntax is supported
 */
export function supportsImportSyntax(mapping: TargetMapping): boolean {
  return mapping.import_syntax?.enabled ?? false;
}

/**
 * Get the import syntax format string
 */
export function getImportFormat(mapping: TargetMapping): string {
  return mapping.import_syntax?.format ?? '@import {path}';
}

