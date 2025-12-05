/**
 * @file Frontmatter Transformer
 * @description Transform frontmatter between generic and target-specific formats
 *
 * This transformer handles the conversion of frontmatter fields from the generic
 * .ai/ format to target-specific formats (Cursor, Claude, Factory). It supports
 * field renaming, value transformations, and field filtering.
 */

import type { TargetType } from '../parsers/types.js';
import { mapTools } from './tool-mapper.js';
import { mapModel } from './model-mapper.js';

/**
 * Field transformation function type
 */
export type FieldTransform = (value: unknown, context: TransformContext) => unknown;

/**
 * Context passed to transform functions
 */
export interface TransformContext {
  /**
   * Target platform being generated for
   */
  target: TargetType;

  /**
   * The full frontmatter object (for transforms that need other field values)
   */
  frontmatter: Record<string, unknown>;

  /**
   * The field name being transformed
   */
  fieldName: string;
}

/**
 * Transform options for frontmatter conversion
 */
export interface TransformOptions {
  /**
   * Fields to include in output (if specified, only these fields are included)
   */
  includeFields?: string[];

  /**
   * Fields to exclude from output
   */
  excludeFields?: string[];

  /**
   * Field name mappings (from generic name -> to target-specific name)
   */
  fieldMappings?: Record<string, string>;

  /**
   * Value transformations per field
   */
  valueTransforms?: Record<string, FieldTransform>;

  /**
   * Target platform (used for tool/model mapping)
   */
  target?: TargetType;

  /**
   * Whether to remove undefined/null values from output
   * @default true
   */
  removeEmpty?: boolean;
}

/**
 * Target-specific frontmatter configuration
 */
export interface TargetFrontmatterConfig {
  /**
   * Fields to include for this target
   */
  includeFields: string[];

  /**
   * Field name mappings
   */
  fieldMappings: Record<string, string>;

  /**
   * Value transformations
   */
  valueTransforms: Record<string, FieldTransform>;
}

/**
 * Built-in transforms
 */
export const transforms = {
  /**
   * Convert an array to comma-separated string
   */
  arrayToCommaSeparated: (value: unknown): string => {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return String(value ?? '');
  },

  /**
   * Convert an array to newline-separated string
   */
  arrayToNewlineSeparated: (value: unknown): string => {
    if (Array.isArray(value)) {
      return value.join('\n');
    }
    return String(value ?? '');
  },

  /**
   * Convert to boolean
   */
  toBoolean: (value: unknown): boolean => {
    return Boolean(value);
  },

  /**
   * Convert always_apply to alwaysApply (Cursor format)
   */
  toAlwaysApply: (value: unknown): boolean => {
    return Boolean(value);
  },

  /**
   * Ensure value is an array
   */
  toArray: (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    return [value];
  },

  /**
   * Map tools array to target-specific names
   */
  mapToolsForTarget: (value: unknown, context: TransformContext): string[] => {
    if (!Array.isArray(value)) return [];
    return mapTools(value.map(String), context.target);
  },

  /**
   * Map model to target-specific name
   */
  mapModelForTarget: (value: unknown, context: TransformContext): string => {
    return mapModel(String(value ?? 'default'), context.target);
  },

  /**
   * Identity transform (pass through unchanged)
   */
  identity: (value: unknown): unknown => value,

  /**
   * Convert to string
   */
  toString: (value: unknown): string => String(value ?? ''),

  /**
   * Convert to lowercase string
   */
  toLowercase: (value: unknown): string => String(value ?? '').toLowerCase(),

  /**
   * Convert to uppercase string
   */
  toUppercase: (value: unknown): string => String(value ?? '').toUpperCase(),
};

/**
 * Default frontmatter configurations for each target
 */
export const DEFAULT_TARGET_CONFIGS: Record<TargetType, TargetFrontmatterConfig> = {
  cursor: {
    includeFields: ['description', 'globs', 'alwaysApply'],
    fieldMappings: {
      always_apply: 'alwaysApply',
    },
    valueTransforms: {
      globs: transforms.arrayToCommaSeparated,
      alwaysApply: transforms.toBoolean,
      always_apply: transforms.toBoolean,
    },
  },
  claude: {
    includeFields: ['name', 'description', 'tools', 'model'],
    fieldMappings: {},
    valueTransforms: {
      tools: transforms.mapToolsForTarget,
      model: transforms.mapModelForTarget,
    },
  },
  factory: {
    includeFields: ['name', 'description', 'tools', 'model'],
    fieldMappings: {},
    valueTransforms: {
      tools: transforms.mapToolsForTarget,
      model: transforms.mapModelForTarget,
    },
  },
};

/**
 * Transform frontmatter for a specific target
 *
 * @param frontmatter - Source frontmatter object
 * @param options - Transform options
 * @returns Transformed frontmatter object
 *
 * @example
 * // Transform rule frontmatter for Cursor
 * transformFrontmatter(
 *   { name: 'test', always_apply: true, globs: ['*.ts', '*.tsx'] },
 *   { target: 'cursor' }
 * )
 * // { description: undefined, globs: '*.ts, *.tsx', alwaysApply: true }
 */
export function transformFrontmatter(
  frontmatter: Record<string, unknown>,
  options: TransformOptions = {}
): Record<string, unknown> {
  const { target, removeEmpty = true } = options;

  // Get target-specific config if target is specified
  const targetConfig = target ? DEFAULT_TARGET_CONFIGS[target] : undefined;

  // Merge options with target config
  const effectiveFieldMappings = {
    ...targetConfig?.fieldMappings,
    ...options.fieldMappings,
  };

  const effectiveValueTransforms = {
    ...targetConfig?.valueTransforms,
    ...options.valueTransforms,
  };

  const effectiveIncludeFields = options.includeFields ?? targetConfig?.includeFields;
  const effectiveExcludeFields = options.excludeFields ?? [];

  // Build result object
  let result: Record<string, unknown> = {};

  // Start with original frontmatter
  for (const [key, value] of Object.entries(frontmatter)) {
    result[key] = value;
  }

  // Apply field mappings (rename fields)
  if (Object.keys(effectiveFieldMappings).length > 0) {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result)) {
      const newKey = effectiveFieldMappings[key] ?? key;
      mapped[newKey] = value;
    }
    result = mapped;
  }

  // Create transform context
  const context: TransformContext = {
    target: target ?? 'cursor',
    frontmatter: result,
    fieldName: '',
  };

  // Apply value transforms
  for (const [field, transform] of Object.entries(effectiveValueTransforms)) {
    // Check both original field name and mapped field name
    const mappedField = effectiveFieldMappings[field] ?? field;

    if (field in result) {
      context.fieldName = field;
      result[field] = transform(result[field], context);
    }
    if (mappedField !== field && mappedField in result) {
      context.fieldName = mappedField;
      result[mappedField] = transform(result[mappedField], context);
    }
  }

  // Filter to included fields
  if (effectiveIncludeFields && effectiveIncludeFields.length > 0) {
    const filtered: Record<string, unknown> = {};
    for (const field of effectiveIncludeFields) {
      if (field in result) {
        filtered[field] = result[field];
      }
    }
    result = filtered;
  }

  // Remove excluded fields
  for (const field of effectiveExcludeFields) {
    delete result[field];
  }

  // Remove empty values if requested
  if (removeEmpty) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result)) {
      if (value !== undefined && value !== null && value !== '') {
        cleaned[key] = value;
      }
    }
    result = cleaned;
  }

  return result;
}

/**
 * Transform frontmatter for Cursor target
 *
 * @param frontmatter - Source frontmatter
 * @param additionalOptions - Additional transform options
 * @returns Cursor-formatted frontmatter
 */
export function transformForCursor(
  frontmatter: Record<string, unknown>,
  additionalOptions?: Partial<TransformOptions>
): Record<string, unknown> {
  return transformFrontmatter(frontmatter, {
    ...additionalOptions,
    target: 'cursor',
  });
}

/**
 * Transform frontmatter for Claude target
 *
 * @param frontmatter - Source frontmatter
 * @param additionalOptions - Additional transform options
 * @returns Claude-formatted frontmatter
 */
export function transformForClaude(
  frontmatter: Record<string, unknown>,
  additionalOptions?: Partial<TransformOptions>
): Record<string, unknown> {
  return transformFrontmatter(frontmatter, {
    ...additionalOptions,
    target: 'claude',
  });
}

/**
 * Transform frontmatter for Factory target
 *
 * @param frontmatter - Source frontmatter
 * @param additionalOptions - Additional transform options
 * @returns Factory-formatted frontmatter
 */
export function transformForFactory(
  frontmatter: Record<string, unknown>,
  additionalOptions?: Partial<TransformOptions>
): Record<string, unknown> {
  return transformFrontmatter(frontmatter, {
    ...additionalOptions,
    target: 'factory',
  });
}

/**
 * Convert an array to comma-separated string (exported for convenience)
 */
export function arrayToCommaSeparated(value: unknown): string {
  return transforms.arrayToCommaSeparated(value);
}

/**
 * Convert always_apply to alwaysApply (Cursor format) (exported for convenience)
 */
export function toAlwaysApply(value: unknown): boolean {
  return transforms.toAlwaysApply(value);
}

/**
 * Serialize frontmatter to YAML format for MDC files
 *
 * @param frontmatter - Frontmatter object to serialize
 * @returns YAML string (without delimiters)
 */
export function serializeFrontmatter(frontmatter: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null) continue;

    if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === 'string') {
      // Quote strings that might need it
      if (value.includes(':') || value.includes('#') || value.includes('\n')) {
        lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else if (value.every((v) => typeof v === 'string' && !v.includes('\n'))) {
        // Inline array for simple strings
        lines.push(`${key}: [${value.map((v) => `"${v}"`).join(', ')}]`);
      } else {
        // Multi-line array
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${item}`);
        }
      }
    } else if (typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`  ${subKey}: ${subValue}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Create a frontmatter transformer with preset options
 *
 * @param target - Target platform
 * @param defaultOptions - Default transform options
 * @returns Transform function with preset options
 */
export function createFrontmatterTransformer(
  target: TargetType,
  defaultOptions?: Partial<TransformOptions>
): (frontmatter: Record<string, unknown>) => Record<string, unknown> {
  return (frontmatter: Record<string, unknown>) =>
    transformFrontmatter(frontmatter, {
      ...defaultOptions,
      target,
    });
}
