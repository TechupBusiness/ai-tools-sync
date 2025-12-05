/**
 * @file Hook Parser
 * @description Parse hook files with frontmatter, validation, and defaults
 */

import { type Result, err, ok } from '../utils/result.js';

import { parseFrontmatter } from './frontmatter.js';
import {
  type BaseFrontmatter,
  type ContentValidationError,
  type ParseError,
  type ParsedContent,
  type TargetType,
  createParseError,
  validateTargets,
  validateVersion,
} from './types.js';

/**
 * Hook event types
 */
export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PreMessage'
  | 'PostMessage'
  | 'PreCommit';

/**
 * Hook frontmatter structure
 */
export interface Hook extends BaseFrontmatter {
  /** Unique identifier for the hook */
  name: string;
  /** Event that triggers this hook */
  event: HookEvent;
  /** Pattern to match tools (e.g., 'Bash(git commit*)') */
  tool_match?: string;
  /** Script or command to execute */
  execute?: string;
}

/**
 * Parsed hook with content
 */
export type ParsedHook = ParsedContent<Hook>;

/**
 * Valid event values
 */
const VALID_EVENTS: HookEvent[] = ['PreToolUse', 'PostToolUse', 'PreMessage', 'PostMessage', 'PreCommit'];

/**
 * Default values for optional hook fields
 * Note: hooks typically only target Claude as other tools don't support hooks
 */
export const HOOK_DEFAULTS: Partial<Hook> = {
  targets: ['claude'] as TargetType[],
};

/**
 * Validate hook-specific fields
 */
function validateHookFields(data: Record<string, unknown>): ContentValidationError[] {
  const errors: ContentValidationError[] = [];

  // Validate name (required)
  if (data.name === undefined || data.name === null) {
    errors.push({
      path: 'name',
      message: 'Name is required',
    });
  } else if (typeof data.name !== 'string') {
    errors.push({
      path: 'name',
      message: 'Name must be a string',
      value: data.name,
    });
  } else if (data.name.trim() === '') {
    errors.push({
      path: 'name',
      message: 'Name cannot be empty',
      value: data.name,
    });
  }

  // Validate description
  if (data.description !== undefined && typeof data.description !== 'string') {
    errors.push({
      path: 'description',
      message: 'Description must be a string',
      value: data.description,
    });
  }

  // Validate version
  errors.push(...validateVersion(data.version));

  // Validate targets
  errors.push(...validateTargets(data.targets));

  // Validate event (required)
  if (data.event === undefined || data.event === null) {
    errors.push({
      path: 'event',
      message: 'Event is required',
    });
  } else if (typeof data.event !== 'string') {
    errors.push({
      path: 'event',
      message: 'Event must be a string',
      value: data.event,
    });
  } else if (!VALID_EVENTS.includes(data.event as HookEvent)) {
    errors.push({
      path: 'event',
      message: `Invalid event: ${data.event}. Must be one of: ${VALID_EVENTS.join(', ')}`,
      value: data.event,
    });
  }

  // Validate tool_match
  if (data.tool_match !== undefined && typeof data.tool_match !== 'string') {
    errors.push({
      path: 'tool_match',
      message: 'tool_match must be a string',
      value: data.tool_match,
    });
  }

  // Validate execute
  if (data.execute !== undefined && typeof data.execute !== 'string') {
    errors.push({
      path: 'execute',
      message: 'Execute must be a string',
      value: data.execute,
    });
  }

  // Warn if targeting tools that don't support hooks
  if (data.targets !== undefined && Array.isArray(data.targets)) {
    const unsupportedTargets = (data.targets as string[]).filter((t) => t !== 'claude');
    if (unsupportedTargets.length > 0) {
      // This is a warning, not an error - we still allow it but tools will ignore
      // We could add a warnings array in the future, but for now we just validate
    }
  }

  return errors;
}

/**
 * Apply defaults to hook frontmatter (filters out undefined for exactOptionalPropertyTypes)
 */
function applyHookDefaults(data: Record<string, unknown>): Hook {
  const hook: Hook = {
    name: data.name as string,
    event: data.event as HookEvent,
    targets: data.targets !== undefined ? (data.targets as TargetType[]) : HOOK_DEFAULTS.targets!,
  };

  if (data.description !== undefined) {
    hook.description = data.description as string;
  }
  if (data.version !== undefined) {
    hook.version = data.version as string;
  }
  if (data.tool_match !== undefined) {
    hook.tool_match = data.tool_match as string;
  }
  if (data.execute !== undefined) {
    hook.execute = data.execute as string;
  }

  return hook;
}

/**
 * Parse a hook file
 *
 * @param content - The markdown content of the hook file
 * @param filePath - Optional file path for error messages
 * @returns Result containing parsed hook or error
 */
export function parseHook(content: string, filePath?: string): Result<ParsedHook, ParseError> {
  // Parse frontmatter
  const frontmatterResult = parseFrontmatter<Record<string, unknown>>(content);

  if (!frontmatterResult.ok) {
    const fmError = frontmatterResult.error;
    return err(createParseError(fmError.message, {
      filePath,
      line: fmError.line,
      column: fmError.column,
    }));
  }

  const { data, content: bodyContent, isEmpty } = frontmatterResult.value;

  // Check for empty frontmatter
  if (isEmpty) {
    return err(createParseError('Hook file is missing frontmatter', { filePath }));
  }

  // Validate fields
  const validationErrors = validateHookFields(data);

  if (validationErrors.length > 0) {
    return err(createParseError('Hook validation failed', {
      filePath,
      validationErrors,
    }));
  }

  // Apply defaults and create hook object
  const hook = applyHookDefaults(data);

  // Build result with only defined properties (for exactOptionalPropertyTypes)
  const result: ParsedHook = {
    frontmatter: hook,
    content: bodyContent,
  };

  if (filePath !== undefined) {
    result.filePath = filePath;
  }

  return ok(result);
}

/**
 * Parse multiple hook files
 *
 * @param files - Array of { content, filePath } objects
 * @returns Result containing array of parsed hooks or array of errors
 */
export function parseHooks(
  files: Array<{ content: string; filePath?: string }>
): Result<ParsedHook[], ParseError[]> {
  const hooks: ParsedHook[] = [];
  const errors: ParseError[] = [];

  for (const file of files) {
    const result = parseHook(file.content, file.filePath);
    if (result.ok) {
      hooks.push(result.value);
    } else {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    return err(errors);
  }

  return ok(hooks);
}

/**
 * Filter hooks by target
 */
export function filterHooksByTarget(hooks: ParsedHook[], target: TargetType): ParsedHook[] {
  return hooks.filter((hook) => {
    const targets = hook.frontmatter.targets ?? HOOK_DEFAULTS.targets ?? [];
    return targets.includes(target);
  });
}

/**
 * Filter hooks by event type
 */
export function filterHooksByEvent(hooks: ParsedHook[], event: HookEvent): ParsedHook[] {
  return hooks.filter((hook) => hook.frontmatter.event === event);
}

/**
 * Group hooks by event type
 */
export function groupHooksByEvent(hooks: ParsedHook[]): Record<HookEvent, ParsedHook[]> {
  const groups: Record<HookEvent, ParsedHook[]> = {
    PreToolUse: [],
    PostToolUse: [],
    PreMessage: [],
    PostMessage: [],
    PreCommit: [],
  };

  for (const hook of hooks) {
    const event = hook.frontmatter.event;
    groups[event].push(hook);
  }

  return groups;
}
