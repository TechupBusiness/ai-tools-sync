/**
 * @file Frontmatter Transformer
 * @description Transform frontmatter between generic and target-specific formats
 *
 * This is a stub file - full implementation in Phase 4
 */

/**
 * Transform options
 */
export interface TransformOptions {
  /**
   * Fields to include in output
   */
  includeFields?: string[];

  /**
   * Fields to exclude from output
   */
  excludeFields?: string[];

  /**
   * Field name mappings (from -> to)
   */
  fieldMappings?: Record<string, string>;

  /**
   * Value transformations per field
   */
  valueTransforms?: Record<string, (value: unknown) => unknown>;
}

/**
 * Transform frontmatter for a specific target
 */
export function transformFrontmatter(
  frontmatter: Record<string, unknown>,
  options: TransformOptions = {}
): Record<string, unknown> {
  let result = { ...frontmatter };

  // Apply field mappings
  if (options.fieldMappings) {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result)) {
      const newKey = options.fieldMappings[key] ?? key;
      mapped[newKey] = value;
    }
    result = mapped;
  }

  // Apply value transforms
  if (options.valueTransforms) {
    for (const [field, transform] of Object.entries(options.valueTransforms)) {
      if (field in result) {
        result[field] = transform(result[field]);
      }
    }
  }

  // Filter fields
  if (options.includeFields) {
    const filtered: Record<string, unknown> = {};
    for (const field of options.includeFields) {
      if (field in result) {
        filtered[field] = result[field];
      }
    }
    result = filtered;
  }

  if (options.excludeFields) {
    for (const field of options.excludeFields) {
      delete result[field];
    }
  }

  return result;
}

/**
 * Convert an array to comma-separated string
 */
export function arrayToCommaSeparated(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value);
}

/**
 * Convert always_apply to alwaysApply (Cursor format)
 */
export function toAlwaysApply(value: unknown): boolean {
  return Boolean(value);
}

