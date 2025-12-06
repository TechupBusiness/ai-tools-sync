/**
 * @file Command Parser
 * @description Parse command files with frontmatter, validation, and defaults
 */

import { type Result, err, ok } from '../utils/result.js';

import { parseFrontmatter } from './frontmatter.js';
import {
  type BaseFrontmatter,
  type ClaudeExtension,
  type ContentValidationError,
  type CursorExtension,
  type FactoryExtension,
  type ParseError,
  type ParsedContent,
  type TargetType,
  DEFAULT_TARGETS,
  createParseError,
  validateTargets,
  validateVersion,
} from './types.js';

/**
 * Command argument type
 */
export type CommandArgType = 'string' | 'number' | 'boolean';

/**
 * Command argument definition
 */
export interface CommandArg {
  /** Argument name */
  name: string;
  /** Argument type */
  type: CommandArgType;
  /** Argument description */
  description?: string;
  /** Default value for the argument */
  default?: string | number | boolean;
  /** Allowed values for the argument */
  choices?: (string | number)[];
  /** Whether the argument is required */
  required?: boolean;
}

/**
 * Command frontmatter structure
 */
export interface Command extends BaseFrontmatter {
  /** Unique identifier for the command */
  name: string;
  /** Script or command to execute */
  execute?: string;
  /** Command arguments */
  args?: CommandArg[];
  /** Glob patterns where command is relevant */
  globs?: string[];
  /** Tool restrictions (used by Cursor) */
  allowedTools?: string[];
  /** Platform-specific extensions */
  cursor?: CursorExtension;
  claude?: ClaudeExtension;
  factory?: FactoryExtension;
}

/**
 * Parsed command with content
 */
export type ParsedCommand = ParsedContent<Command>;

/**
 * Valid argument types
 */
const VALID_ARG_TYPES: CommandArgType[] = ['string', 'number', 'boolean'];

/**
 * Default values for optional command fields
 */
export const COMMAND_DEFAULTS: Partial<Command> = {
  targets: DEFAULT_TARGETS,
  args: [],
};

/**
 * Validate a single command argument
 */
function validateCommandArg(arg: unknown, index: number): ContentValidationError[] {
  const errors: ContentValidationError[] = [];
  const prefix = `args[${index}]`;

  if (typeof arg !== 'object' || arg === null) {
    errors.push({
      path: prefix,
      message: 'Argument must be an object',
      value: arg,
    });
    return errors;
  }

  const argObj = arg as Record<string, unknown>;

  // Validate name (required)
  if (argObj.name === undefined || argObj.name === null) {
    errors.push({
      path: `${prefix}.name`,
      message: 'Argument name is required',
    });
  } else if (typeof argObj.name !== 'string') {
    errors.push({
      path: `${prefix}.name`,
      message: 'Argument name must be a string',
      value: argObj.name,
    });
  } else if (argObj.name.trim() === '') {
    errors.push({
      path: `${prefix}.name`,
      message: 'Argument name cannot be empty',
      value: argObj.name,
    });
  }

  // Validate type (required)
  if (argObj.type === undefined || argObj.type === null) {
    errors.push({
      path: `${prefix}.type`,
      message: 'Argument type is required',
    });
  } else if (typeof argObj.type !== 'string') {
    errors.push({
      path: `${prefix}.type`,
      message: 'Argument type must be a string',
      value: argObj.type,
    });
  } else if (!VALID_ARG_TYPES.includes(argObj.type as CommandArgType)) {
    errors.push({
      path: `${prefix}.type`,
      message: `Invalid argument type: ${argObj.type}. Must be one of: ${VALID_ARG_TYPES.join(', ')}`,
      value: argObj.type,
    });
  }

  // Validate description
  if (argObj.description !== undefined && typeof argObj.description !== 'string') {
    errors.push({
      path: `${prefix}.description`,
      message: 'Argument description must be a string',
      value: argObj.description,
    });
  }

  // Validate default value type matches declared type
  if (argObj.default !== undefined && argObj.type !== undefined) {
    const expectedType = argObj.type as string;
    const actualType = typeof argObj.default;

    if (expectedType === 'string' && actualType !== 'string') {
      errors.push({
        path: `${prefix}.default`,
        message: `Default value must be a string, got ${actualType}`,
        value: argObj.default,
      });
    } else if (expectedType === 'number' && actualType !== 'number') {
      errors.push({
        path: `${prefix}.default`,
        message: `Default value must be a number, got ${actualType}`,
        value: argObj.default,
      });
    } else if (expectedType === 'boolean' && actualType !== 'boolean') {
      errors.push({
        path: `${prefix}.default`,
        message: `Default value must be a boolean, got ${actualType}`,
        value: argObj.default,
      });
    }
  }

  // Validate choices
  if (argObj.choices !== undefined) {
    if (!Array.isArray(argObj.choices)) {
      errors.push({
        path: `${prefix}.choices`,
        message: 'Choices must be an array',
        value: argObj.choices,
      });
    } else {
      for (const [i, choice] of argObj.choices.entries()) {
        if (typeof choice !== 'string' && typeof choice !== 'number') {
          errors.push({
            path: `${prefix}.choices[${i}]`,
            message: 'Choice must be a string or number',
            value: choice,
          });
        }
      }

      // Validate default is in choices
      if (argObj.default !== undefined && !argObj.choices.includes(argObj.default)) {
        errors.push({
          path: `${prefix}.default`,
          message: `Default value must be one of the choices: ${argObj.choices.join(', ')}`,
          value: argObj.default,
        });
      }
    }
  }

  // Validate required
  if (argObj.required !== undefined && typeof argObj.required !== 'boolean') {
    errors.push({
      path: `${prefix}.required`,
      message: 'Required must be a boolean',
      value: argObj.required,
    });
  }

  return errors;
}

/**
 * Validate command-specific fields
 */
function validateCommandFields(data: Record<string, unknown>): ContentValidationError[] {
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

  // Validate execute
  if (data.execute !== undefined && typeof data.execute !== 'string') {
    errors.push({
      path: 'execute',
      message: 'Execute must be a string',
      value: data.execute,
    });
  }

  // Validate args
  if (data.args !== undefined) {
    if (!Array.isArray(data.args)) {
      errors.push({
        path: 'args',
        message: 'Args must be an array',
        value: data.args,
      });
    } else {
      for (const [i, arg] of data.args.entries()) {
        errors.push(...validateCommandArg(arg, i));
      }
    }
  }

  // Validate globs
  if (data.globs !== undefined) {
    if (!Array.isArray(data.globs)) {
      errors.push({
        path: 'globs',
        message: 'Globs must be an array',
        value: data.globs,
      });
    } else {
      for (const [i, glob] of data.globs.entries()) {
        if (typeof glob !== 'string') {
          errors.push({
            path: `globs[${i}]`,
            message: 'Glob pattern must be a string',
            value: glob,
          });
        }
      }
    }
  }

  // Validate allowedTools
  if (data.allowedTools !== undefined) {
    if (!Array.isArray(data.allowedTools)) {
      errors.push({
        path: 'allowedTools',
        message: 'allowedTools must be an array',
        value: data.allowedTools,
      });
    } else {
      for (const [i, tool] of data.allowedTools.entries()) {
        if (typeof tool !== 'string') {
          errors.push({
            path: `allowedTools[${i}]`,
            message: 'Tool must be a string',
            value: tool,
          });
        }
      }
    }
  }

  // Validate platform extensions (must be objects if present)
  for (const platform of ['cursor', 'claude', 'factory'] as const) {
    if (data[platform] !== undefined) {
      if (typeof data[platform] !== 'object' || data[platform] === null || Array.isArray(data[platform])) {
        errors.push({
          path: platform,
          message: `${platform} extension must be an object`,
          value: data[platform],
        });
      }
    }
  }

  return errors;
}

/**
 * Apply defaults to command frontmatter (filters out undefined for exactOptionalPropertyTypes)
 */
function applyCommandDefaults(data: Record<string, unknown>): Command {
  const command: Command = {
    name: data.name as string,
    args: data.args !== undefined ? (data.args as CommandArg[]) : COMMAND_DEFAULTS.args!,
    targets: data.targets !== undefined ? (data.targets as TargetType[]) : COMMAND_DEFAULTS.targets!,
  };

  if (data.description !== undefined) {
    command.description = data.description as string;
  }
  if (data.version !== undefined) {
    command.version = data.version as string;
  }
  if (data.execute !== undefined) {
    command.execute = data.execute as string;
  }
  if (data.globs !== undefined) {
    command.globs = data.globs as string[];
  }
  if (data.allowedTools !== undefined) {
    command.allowedTools = data.allowedTools as string[];
  }

  // Platform-specific extensions
  if (data.cursor !== undefined) {
    command.cursor = data.cursor as CursorExtension;
  }
  if (data.claude !== undefined) {
    command.claude = data.claude as ClaudeExtension;
  }
  if (data.factory !== undefined) {
    command.factory = data.factory as FactoryExtension;
  }

  return command;
}

/**
 * Parse a command file
 *
 * @param content - The markdown content of the command file
 * @param filePath - Optional file path for error messages
 * @returns Result containing parsed command or error
 */
export function parseCommand(content: string, filePath?: string): Result<ParsedCommand, ParseError> {
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
    return err(createParseError('Command file is missing frontmatter', { filePath }));
  }

  // Validate fields
  const validationErrors = validateCommandFields(data);

  if (validationErrors.length > 0) {
    return err(createParseError('Command validation failed', {
      filePath,
      validationErrors,
    }));
  }

  // Apply defaults and create command object
  const command = applyCommandDefaults(data);

  // Build result with only defined properties (for exactOptionalPropertyTypes)
  const result: ParsedCommand = {
    frontmatter: command,
    content: bodyContent,
  };

  if (filePath !== undefined) {
    result.filePath = filePath;
  }

  return ok(result);
}

/**
 * Parse multiple command files
 *
 * @param files - Array of { content, filePath } objects
 * @returns Result containing array of parsed commands or array of errors
 */
export function parseCommands(
  files: Array<{ content: string; filePath?: string }>
): Result<ParsedCommand[], ParseError[]> {
  const commands: ParsedCommand[] = [];
  const errors: ParseError[] = [];

  for (const file of files) {
    const result = parseCommand(file.content, file.filePath);
    if (result.ok) {
      commands.push(result.value);
    } else {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    return err(errors);
  }

  return ok(commands);
}

/**
 * Filter commands by target
 */
export function filterCommandsByTarget(commands: ParsedCommand[], target: TargetType): ParsedCommand[] {
  return commands.filter((command) => {
    const targets = command.frontmatter.targets ?? DEFAULT_TARGETS;
    return targets.includes(target);
  });
}
