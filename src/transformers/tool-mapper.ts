/**
 * @file Tool Mapper
 * @description Map generic tool names to target-specific names
 *
 * The tool mapper transforms generic tool names (read, write, edit, etc.)
 * to target-specific names (e.g., Cursor's "Read" vs Claude's "Read").
 * It supports custom mappings per project and gracefully handles unknown tools.
 */

import type { TargetType } from '../parsers/types.js';

/**
 * Generic tool names used in .ai/ configuration
 */
export type GenericTool =
  | 'read'
  | 'write'
  | 'edit'
  | 'execute'
  | 'search'
  | 'glob'
  | 'fetch'
  | 'ls';

/**
 * Tool mapping configuration for a target
 */
export interface ToolMappingConfig {
  /**
   * Map of generic tool name to target-specific name
   */
  mappings: Record<string, string>;

  /**
   * Whether to preserve unknown tools (pass through) or filter them out
   * @default true
   */
  preserveUnknown?: boolean;

  /**
   * Transform to apply to unknown tools (e.g., capitalize, lowercase)
   * Only applies when preserveUnknown is true
   */
  unknownTransform?: 'capitalize' | 'lowercase' | 'uppercase' | 'none';
}

/**
 * Default tool mappings for each target
 */
export const DEFAULT_TOOL_MAPPINGS: Record<TargetType, ToolMappingConfig> = {
  cursor: {
    mappings: {
      read: 'Read',
      write: 'Create',
      edit: 'Edit',
      execute: 'Execute',
      search: 'Grep',
      glob: 'Glob',
      fetch: 'FetchUrl',
      ls: 'LS',
    },
    preserveUnknown: true,
    unknownTransform: 'capitalize',
  },
  claude: {
    mappings: {
      read: 'Read',
      write: 'Write',
      edit: 'Edit',
      execute: 'Bash',
      search: 'Search',
      glob: 'Glob',
      fetch: 'WebFetch',
      ls: 'ListDir',
    },
    preserveUnknown: true,
    unknownTransform: 'capitalize',
  },
  factory: {
    mappings: {
      read: 'read',
      write: 'write',
      edit: 'edit',
      execute: 'execute',
      search: 'search',
      glob: 'glob',
      fetch: 'fetch',
      ls: 'list',
    },
    preserveUnknown: true,
    unknownTransform: 'lowercase',
  },
};

/**
 * Options for tool mapping
 */
export interface MapToolOptions {
  /**
   * Custom mappings to merge with or override defaults
   */
  customMappings?: Record<string, string>;

  /**
   * Whether to preserve unknown tools (overrides target default)
   */
  preserveUnknown?: boolean;

  /**
   * Transform for unknown tools (overrides target default)
   */
  unknownTransform?: 'capitalize' | 'lowercase' | 'uppercase' | 'none';
}

/**
 * Capitalize the first letter of a string
 */
function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Apply transform to unknown tool name
 */
function applyUnknownTransform(
  tool: string,
  transform: 'capitalize' | 'lowercase' | 'uppercase' | 'none'
): string {
  switch (transform) {
    case 'capitalize':
      return capitalize(tool);
    case 'lowercase':
      return tool.toLowerCase();
    case 'uppercase':
      return tool.toUpperCase();
    case 'none':
    default:
      return tool;
  }
}

/**
 * Map a generic tool name to a target-specific name
 *
 * @param tool - Generic tool name
 * @param target - Target platform (cursor, claude, factory)
 * @param options - Optional custom mappings and behavior
 * @returns Target-specific tool name, or undefined if filtered out
 *
 * @example
 * mapTool('execute', 'cursor') // 'Execute'
 * mapTool('execute', 'claude') // 'Bash'
 * mapTool('custom', 'cursor')  // 'Custom' (preserved and capitalized)
 */
export function mapTool(
  tool: string,
  target: TargetType,
  options?: MapToolOptions
): string | undefined {
  const targetConfig = DEFAULT_TOOL_MAPPINGS[target];
  if (!targetConfig) {
    // Unknown target, return tool as-is
    return tool;
  }

  // Merge custom mappings with defaults (custom takes precedence)
  const effectiveMappings = options?.customMappings
    ? { ...targetConfig.mappings, ...options.customMappings }
    : targetConfig.mappings;

  // Normalize tool name for lookup
  const normalizedTool = tool.toLowerCase();
  const mappedTool = effectiveMappings[normalizedTool];

  if (mappedTool !== undefined) {
    return mappedTool;
  }

  // Handle unknown tool
  const preserveUnknown = options?.preserveUnknown ?? targetConfig.preserveUnknown ?? true;

  if (!preserveUnknown) {
    return undefined;
  }

  const transform = options?.unknownTransform ?? targetConfig.unknownTransform ?? 'none';
  return applyUnknownTransform(tool, transform);
}

/**
 * Map an array of tools to target-specific names
 *
 * @param tools - Array of generic tool names
 * @param target - Target platform
 * @param options - Optional custom mappings and behavior
 * @returns Array of target-specific tool names (unknown tools may be filtered)
 *
 * @example
 * mapTools(['read', 'write', 'execute'], 'claude')
 * // ['Read', 'Write', 'Bash']
 */
export function mapTools(tools: string[], target: TargetType, options?: MapToolOptions): string[] {
  return tools
    .map((tool) => mapTool(tool, target, options))
    .filter((tool): tool is string => tool !== undefined);
}

/**
 * Get all available tools for a target
 *
 * @param target - Target platform
 * @returns Object with generic names as keys and target-specific names as values
 */
export function getToolsForTarget(target: TargetType): Record<string, string> {
  const config = DEFAULT_TOOL_MAPPINGS[target];
  return config ? { ...config.mappings } : {};
}

/**
 * Get the generic tool name from a target-specific name
 *
 * @param targetTool - Target-specific tool name
 * @param target - Target platform
 * @returns Generic tool name, or undefined if not found
 *
 * @example
 * getGenericToolName('Bash', 'claude') // 'execute'
 * getGenericToolName('Read', 'cursor') // 'read'
 */
export function getGenericToolName(targetTool: string, target: TargetType): string | undefined {
  const config = DEFAULT_TOOL_MAPPINGS[target];
  if (!config) return undefined;

  // Find the generic name that maps to this target-specific name
  for (const [generic, mapped] of Object.entries(config.mappings)) {
    if (mapped.toLowerCase() === targetTool.toLowerCase()) {
      return generic;
    }
  }

  return undefined;
}

/**
 * Check if a tool is a known generic tool
 */
export function isKnownGenericTool(tool: string): tool is GenericTool {
  const knownTools: GenericTool[] = [
    'read',
    'write',
    'edit',
    'execute',
    'search',
    'glob',
    'fetch',
    'ls',
  ];
  return knownTools.includes(tool.toLowerCase() as GenericTool);
}

/**
 * Create a custom tool mapper with predefined options
 *
 * @param target - Target platform
 * @param options - Custom mapping options
 * @returns Mapping function bound to the target and options
 *
 * @example
 * const mapCursorTool = createToolMapper('cursor', {
 *   customMappings: { 'mycustom': 'MyCustomTool' }
 * });
 * mapCursorTool('mycustom') // 'MyCustomTool'
 */
export function createToolMapper(
  target: TargetType,
  options?: MapToolOptions
): (tool: string) => string | undefined {
  return (tool: string) => mapTool(tool, target, options);
}
