/**
 * @file Parser Types
 * @description Shared types for all content parsers
 */

/**
 * Supported target types
 */
export type TargetType = 'cursor' | 'claude' | 'factory';

/**
 * Platform-specific extension for Cursor
 */
export interface CursorExtension {
  /** Override alwaysApply for Cursor */
  alwaysApply?: boolean;
  /** Override globs for Cursor */
  globs?: string[];
  /** Override description for Cursor */
  description?: string;
  /** Tool restrictions for commands */
  allowedTools?: string[];
}

/**
 * Platform-specific extension for Claude Code
 */
export interface ClaudeExtension {
  /** Import as skill in CLAUDE.md */
  import_as_skill?: boolean;
  /** Tool restrictions for agents */
  tools?: string[];
  /** Model override for agents */
  model?: string;
}

/**
 * Platform-specific extension for Factory
 */
export interface FactoryExtension {
  /** Tool restrictions for droids/skills */
  'allowed-tools'?: string[];
  /** Tool restrictions (alias) */
  tools?: string[];
  /** Model override for droids */
  model?: string;
  /** Reasoning effort for droids */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

/**
 * Platform-specific extensions map
 */
export interface PlatformExtensions {
  cursor?: CursorExtension;
  claude?: ClaudeExtension;
  factory?: FactoryExtension;
}

/**
 * Base frontmatter fields shared by all content types
 */
export interface BaseFrontmatter {
  /** Unique identifier for the content */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Content version */
  version?: string;
  /** Target tools this content applies to */
  targets?: TargetType[];
  /** Platform-specific extensions */
  cursor?: CursorExtension;
  claude?: ClaudeExtension;
  factory?: FactoryExtension;
}

/**
 * Default targets if none specified
 */
export const DEFAULT_TARGETS: TargetType[] = ['cursor', 'claude', 'factory'];

/**
 * Validation error for content parsing
 */
export interface ContentValidationError {
  /** Path to the field with error (e.g., "globs[0]") */
  path: string;
  /** Error message */
  message: string;
  /** The invalid value */
  value?: unknown;
}

/**
 * Result of parsing a content file
 */
export interface ParsedContent<T extends BaseFrontmatter> {
  /** Parsed and validated frontmatter */
  frontmatter: T;
  /** Markdown content body */
  content: string;
  /** Source file path (if known) */
  filePath?: string;
}

/**
 * Parse error with detailed information
 */
export interface ParseError {
  /** Error message */
  message: string;
  /** File path if known */
  filePath?: string;
  /** Line number of error (1-indexed) */
  line?: number;
  /** Column number of error (1-indexed) */
  column?: number;
  /** Validation errors if applicable */
  validationErrors?: ContentValidationError[];
}

/**
 * Options for creating a parse error (allows undefined values)
 */
export interface CreateParseErrorOptions {
  filePath?: string | undefined;
  line?: number | undefined;
  column?: number | undefined;
  validationErrors?: ContentValidationError[] | undefined;
}

/**
 * Create a parse error (filters out undefined values for strict optional properties)
 */
export function createParseError(
  message: string,
  options?: CreateParseErrorOptions
): ParseError {
  const error: ParseError = { message };

  if (options?.filePath !== undefined) {
    error.filePath = options.filePath;
  }
  if (options?.line !== undefined) {
    error.line = options.line;
  }
  if (options?.column !== undefined) {
    error.column = options.column;
  }
  if (options?.validationErrors !== undefined) {
    error.validationErrors = options.validationErrors;
  }

  return error;
}

/**
 * Format a parse error for display
 */
export function formatParseError(error: ParseError): string {
  const parts: string[] = [];

  if (error.filePath) {
    let location = error.filePath;
    if (error.line !== undefined) {
      location += `:${error.line}`;
      if (error.column !== undefined) {
        location += `:${error.column}`;
      }
    }
    parts.push(location);
  } else if (error.line !== undefined) {
    parts.push(`Line ${error.line}`);
  }

  parts.push(error.message);

  if (error.validationErrors && error.validationErrors.length > 0) {
    const validationMessages = error.validationErrors
      .map((e) => `  - ${e.path}: ${e.message}`)
      .join('\n');
    parts.push(`\nValidation errors:\n${validationMessages}`);
  }

  return parts.join(': ');
}

/**
 * Check if a value is a valid target type
 */
export function isValidTarget(value: unknown): value is TargetType {
  return typeof value === 'string' && ['cursor', 'claude', 'factory'].includes(value);
}

/**
 * Validate targets array
 */
export function validateTargets(targets: unknown): ContentValidationError[] {
  const errors: ContentValidationError[] = [];

  if (targets === undefined) {
    return errors;
  }

  if (!Array.isArray(targets)) {
    errors.push({
      path: 'targets',
      message: 'Targets must be an array',
      value: targets,
    });
    return errors;
  }

  for (const [i, target] of targets.entries()) {
    if (!isValidTarget(target)) {
      errors.push({
        path: `targets[${i}]`,
        message: `Invalid target: ${target}. Must be one of: cursor, claude, factory`,
        value: target,
      });
    }
  }

  return errors;
}

/**
 * Validate version format (semver)
 */
export function validateVersion(version: unknown): ContentValidationError[] {
  const errors: ContentValidationError[] = [];

  if (version === undefined) {
    return errors;
  }

  if (typeof version !== 'string') {
    errors.push({
      path: 'version',
      message: 'Version must be a string',
      value: version,
    });
    return errors;
  }

  const semverPattern = /^\d+\.\d+\.\d+$/;
  if (!semverPattern.test(version)) {
    errors.push({
      path: 'version',
      message: 'Version must be in semver format (e.g., 1.0.0)',
      value: version,
    });
  }

  return errors;
}

