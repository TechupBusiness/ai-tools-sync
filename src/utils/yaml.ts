/**
 * @file YAML Utilities
 * @description YAML parsing and serialization with error handling
 */

import { dump, load, YAMLException } from 'js-yaml';

import { type Result, err, ok } from './result.js';

/**
 * Parse error with line information
 */
export class YamlParseError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
    public readonly column?: number
  ) {
    super(message);
    this.name = 'YamlParseError';
  }
}

/**
 * Parse a YAML string into an object
 */
export function parseYaml<T = unknown>(content: string): Result<T, YamlParseError> {
  try {
    const result = load(content) as T;
    return ok(result);
  } catch (e) {
    if (e instanceof YAMLException) {
      return err(
        new YamlParseError(
          e.message,
          e.mark?.line !== undefined ? e.mark.line + 1 : undefined,
          e.mark?.column !== undefined ? e.mark.column + 1 : undefined
        )
      );
    }
    return err(new YamlParseError(e instanceof Error ? e.message : String(e)));
  }
}

/**
 * Serialize an object to YAML string
 */
export function serializeYaml(
  data: unknown,
  options?: {
    indent?: number;
    lineWidth?: number;
    noRefs?: boolean;
    sortKeys?: boolean;
    quotingType?: "'" | '"';
    forceQuotes?: boolean;
  }
): Result<string, Error> {
  try {
    const result = dump(data, {
      indent: options?.indent ?? 2,
      lineWidth: options?.lineWidth ?? 120,
      noRefs: options?.noRefs ?? true,
      sortKeys: options?.sortKeys ?? false,
      quotingType: options?.quotingType ?? "'",
      forceQuotes: options?.forceQuotes ?? false,
    });
    return ok(result);
  } catch (e) {
    return err(new Error(e instanceof Error ? e.message : String(e)));
  }
}

/**
 * Safe YAML load that returns null for empty content
 */
export function safeParseYaml<T = unknown>(content: string): Result<T | null, YamlParseError> {
  const trimmed = content.trim();
  if (!trimmed) {
    return ok(null);
  }
  return parseYaml<T>(trimmed);
}

/**
 * Check if a string is valid YAML
 */
export function isValidYaml(content: string): boolean {
  const result = parseYaml(content);
  return result.ok;
}

/**
 * Merge multiple YAML objects (shallow merge)
 */
export function mergeYamlObjects<T extends object>(...objects: (T | null | undefined)[]): T {
  const result = {} as T;
  for (const obj of objects) {
    if (obj !== null && obj !== undefined) {
      Object.assign(result, obj);
    }
  }
  return result;
}

/**
 * Deep merge YAML objects
 */
export function deepMergeYamlObjects<T extends object>(...objects: (T | null | undefined)[]): T {
  const result = {} as T;

  for (const obj of objects) {
    if (obj === null || obj === undefined) {
      continue;
    }

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        const existingValue = result[key];

        if (
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          existingValue !== null &&
          typeof existingValue === 'object' &&
          !Array.isArray(existingValue)
        ) {
          // Recursively merge objects
          (result as Record<string, unknown>)[key] = deepMergeYamlObjects(
            existingValue as object,
            value as object
          );
        } else {
          // Overwrite with new value
          (result as Record<string, unknown>)[key] = value;
        }
      }
    }
  }

  return result;
}
