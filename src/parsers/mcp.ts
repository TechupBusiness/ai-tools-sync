/**
 * @file MCP Parser
 * @description Parse MCP configuration files with validation and environment variable interpolation
 */

import { type Result, err, ok } from '../utils/result.js';
import { parseYaml, type YamlParseError } from '../utils/yaml.js';

import {
  type ContentValidationError,
  type ParseError,
  type TargetType,
  createParseError,
  DEFAULT_TARGETS,
  validateTargets,
} from './types.js';

/**
 * Command-based MCP server (stdio transport)
 */
export interface McpCommandServer {
  /** Command to execute (e.g., 'npx', 'node', 'python') */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables for the server process */
  env?: Record<string, string>;
  /** Working directory for the server process */
  cwd?: string;
  /** Human-readable description of the server */
  description?: string;
  /** Whether the server is enabled */
  enabled?: boolean;
  /** Target tools for this server */
  targets?: TargetType[];
}

/**
 * URL-based MCP server (SSE transport)
 */
export interface McpUrlServer {
  /** Server URL endpoint */
  url: string;
  /** HTTP headers to send with requests */
  headers?: Record<string, string>;
  /** Human-readable description of the server */
  description?: string;
  /** Whether the server is enabled */
  enabled?: boolean;
  /** Target tools for this server */
  targets?: TargetType[];
}

/**
 * MCP server definition (can be either command or URL based)
 */
export type McpServer = McpCommandServer | McpUrlServer;

/**
 * Full MCP configuration structure
 */
export interface McpConfig {
  /** Configuration version */
  version?: string;
  /** MCP server definitions keyed by server name */
  servers: Record<string, McpServer>;
}

/**
 * Parsed MCP configuration with metadata
 */
export interface ParsedMcpConfig {
  /** Parsed and validated configuration */
  config: McpConfig;
  /** Source file path (if known) */
  filePath?: string;
}

/**
 * Type guard to check if a server is command-based
 */
export function isCommandServer(server: McpServer): server is McpCommandServer {
  return 'command' in server;
}

/**
 * Type guard to check if a server is URL-based
 */
export function isUrlServer(server: McpServer): server is McpUrlServer {
  return 'url' in server;
}

/**
 * Default values for MCP servers
 */
export const MCP_SERVER_DEFAULTS = {
  enabled: true,
  targets: DEFAULT_TARGETS,
  args: [] as string[],
} as const;

/**
 * Interpolate environment variables in a string
 * Supports ${VAR_NAME} syntax
 */
export function interpolateEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, varName: string) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      // Return the original placeholder if env var is not set
      return match;
    }
    return envValue;
  });
}

/**
 * Interpolate environment variables in an object (deep)
 */
function interpolateEnvVarsInObject<T>(obj: T): T {
  if (typeof obj === 'string') {
    return interpolateEnvVars(obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(interpolateEnvVarsInObject) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = interpolateEnvVarsInObject(value);
    }
    return result as T;
  }
  return obj;
}

/**
 * Validate a command server
 */
function validateCommandServer(
  name: string,
  server: Record<string, unknown>
): ContentValidationError[] {
  const errors: ContentValidationError[] = [];
  const prefix = `servers.${name}`;

  if (typeof server.command !== 'string') {
    errors.push({
      path: `${prefix}.command`,
      message: 'Command must be a string',
      value: server.command,
    });
  } else if (server.command.trim() === '') {
    errors.push({
      path: `${prefix}.command`,
      message: 'Command cannot be empty',
      value: server.command,
    });
  }

  if (server.args !== undefined) {
    if (!Array.isArray(server.args)) {
      errors.push({
        path: `${prefix}.args`,
        message: 'Args must be an array',
        value: server.args,
      });
    } else {
      for (const [i, arg] of (server.args as unknown[]).entries()) {
        if (typeof arg !== 'string') {
          errors.push({
            path: `${prefix}.args[${i}]`,
            message: 'Arg must be a string',
            value: arg,
          });
        }
      }
    }
  }

  if (server.env !== undefined) {
    if (typeof server.env !== 'object' || server.env === null || Array.isArray(server.env)) {
      errors.push({
        path: `${prefix}.env`,
        message: 'Env must be an object',
        value: server.env,
      });
    } else {
      for (const [key, value] of Object.entries(server.env as Record<string, unknown>)) {
        if (typeof value !== 'string') {
          errors.push({
            path: `${prefix}.env.${key}`,
            message: 'Environment variable value must be a string',
            value: value,
          });
        }
      }
    }
  }

  if (server.cwd !== undefined && typeof server.cwd !== 'string') {
    errors.push({
      path: `${prefix}.cwd`,
      message: 'cwd must be a string',
      value: server.cwd,
    });
  }

  return errors;
}

/**
 * Validate a URL server
 */
function validateUrlServer(
  name: string,
  server: Record<string, unknown>
): ContentValidationError[] {
  const errors: ContentValidationError[] = [];
  const prefix = `servers.${name}`;

  if (typeof server.url !== 'string') {
    errors.push({
      path: `${prefix}.url`,
      message: 'URL must be a string',
      value: server.url,
    });
  } else if (server.url.trim() === '') {
    errors.push({
      path: `${prefix}.url`,
      message: 'URL cannot be empty',
      value: server.url,
    });
  } else {
    // Basic URL validation
    try {
      new URL(server.url);
    } catch {
      errors.push({
        path: `${prefix}.url`,
        message: 'Invalid URL format',
        value: server.url,
      });
    }
  }

  if (server.headers !== undefined) {
    if (typeof server.headers !== 'object' || server.headers === null || Array.isArray(server.headers)) {
      errors.push({
        path: `${prefix}.headers`,
        message: 'Headers must be an object',
        value: server.headers,
      });
    } else {
      for (const [key, value] of Object.entries(server.headers as Record<string, unknown>)) {
        if (typeof value !== 'string') {
          errors.push({
            path: `${prefix}.headers.${key}`,
            message: 'Header value must be a string',
            value: value,
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Validate common server fields
 */
function validateCommonServerFields(
  name: string,
  server: Record<string, unknown>
): ContentValidationError[] {
  const errors: ContentValidationError[] = [];
  const prefix = `servers.${name}`;

  if (server.description !== undefined && typeof server.description !== 'string') {
    errors.push({
      path: `${prefix}.description`,
      message: 'Description must be a string',
      value: server.description,
    });
  }

  if (server.enabled !== undefined && typeof server.enabled !== 'boolean') {
    errors.push({
      path: `${prefix}.enabled`,
      message: 'Enabled must be a boolean',
      value: server.enabled,
    });
  }

  // Validate targets with path prefix
  const targetErrors = validateTargets(server.targets);
  for (const error of targetErrors) {
    errors.push({
      ...error,
      path: `${prefix}.${error.path}`,
    });
  }

  return errors;
}

/**
 * Validate the full MCP configuration
 */
function validateMcpConfig(data: Record<string, unknown>): ContentValidationError[] {
  const errors: ContentValidationError[] = [];

  // Validate version if present
  if (data.version !== undefined) {
    if (typeof data.version !== 'string') {
      errors.push({
        path: 'version',
        message: 'Version must be a string',
        value: data.version,
      });
    } else {
      const semverPattern = /^\d+\.\d+\.\d+$/;
      if (!semverPattern.test(data.version)) {
        errors.push({
          path: 'version',
          message: 'Version must be in semver format (e.g., 1.0.0)',
          value: data.version,
        });
      }
    }
  }

  // Validate servers (required)
  if (data.servers === undefined || data.servers === null) {
    errors.push({
      path: 'servers',
      message: 'Servers is required',
    });
    return errors;
  }

  if (typeof data.servers !== 'object' || Array.isArray(data.servers)) {
    errors.push({
      path: 'servers',
      message: 'Servers must be an object',
      value: data.servers,
    });
    return errors;
  }

  const servers = data.servers as Record<string, unknown>;

  // Validate each server
  for (const [name, server] of Object.entries(servers)) {
    if (typeof server !== 'object' || server === null || Array.isArray(server)) {
      errors.push({
        path: `servers.${name}`,
        message: 'Server must be an object',
        value: server,
      });
      continue;
    }

    const serverObj = server as Record<string, unknown>;

    // Check if it's a command or URL server
    const hasCommand = 'command' in serverObj;
    const hasUrl = 'url' in serverObj;

    if (!hasCommand && !hasUrl) {
      errors.push({
        path: `servers.${name}`,
        message: 'Server must have either "command" or "url" property',
      });
      continue;
    }

    if (hasCommand && hasUrl) {
      errors.push({
        path: `servers.${name}`,
        message: 'Server cannot have both "command" and "url" properties',
      });
      continue;
    }

    // Validate specific server type
    if (hasCommand) {
      errors.push(...validateCommandServer(name, serverObj));
    } else {
      errors.push(...validateUrlServer(name, serverObj));
    }

    // Validate common fields
    errors.push(...validateCommonServerFields(name, serverObj));
  }

  return errors;
}

/**
 * Apply defaults to a server configuration (filters out undefined for exactOptionalPropertyTypes)
 */
function applyServerDefaults(serverData: Record<string, unknown>): McpServer {
  const isCommand = 'command' in serverData;

  if (isCommand) {
    const server: McpCommandServer = {
      command: serverData.command as string,
    };

    // Apply args with default
    if (serverData.args !== undefined) {
      server.args = serverData.args as string[];
    } else {
      server.args = [...MCP_SERVER_DEFAULTS.args];
    }

    // Apply optional fields only if defined
    if (serverData.env !== undefined) {
      server.env = serverData.env as Record<string, string>;
    }
    if (serverData.cwd !== undefined) {
      server.cwd = serverData.cwd as string;
    }
    if (serverData.description !== undefined) {
      server.description = serverData.description as string;
    }
    if (serverData.enabled !== undefined) {
      server.enabled = serverData.enabled as boolean;
    } else {
      server.enabled = MCP_SERVER_DEFAULTS.enabled;
    }
    if (serverData.targets !== undefined) {
      server.targets = serverData.targets as TargetType[];
    } else {
      server.targets = [...MCP_SERVER_DEFAULTS.targets];
    }

    return server;
  } else {
    const server: McpUrlServer = {
      url: serverData.url as string,
    };

    // Apply optional fields only if defined
    if (serverData.headers !== undefined) {
      server.headers = serverData.headers as Record<string, string>;
    }
    if (serverData.description !== undefined) {
      server.description = serverData.description as string;
    }
    if (serverData.enabled !== undefined) {
      server.enabled = serverData.enabled as boolean;
    } else {
      server.enabled = MCP_SERVER_DEFAULTS.enabled;
    }
    if (serverData.targets !== undefined) {
      server.targets = serverData.targets as TargetType[];
    } else {
      server.targets = [...MCP_SERVER_DEFAULTS.targets];
    }

    return server;
  }
}

/**
 * Parse an MCP configuration file
 *
 * @param content - The YAML content of the MCP config file
 * @param filePath - Optional file path for error messages
 * @param interpolateEnv - Whether to interpolate environment variables (default: true)
 * @returns Result containing parsed config or error
 */
export function parseMcpConfig(
  content: string,
  filePath?: string,
  interpolateEnv: boolean = true
): Result<ParsedMcpConfig, ParseError> {
  // Parse YAML
  const parseResult = parseYaml<Record<string, unknown>>(content);

  if (!parseResult.ok) {
    const yamlError: YamlParseError = parseResult.error;
    return err(createParseError(yamlError.message, {
      filePath,
      line: yamlError.line,
      column: yamlError.column,
    }));
  }

  const rawData = parseResult.value;

  // Handle empty or null content
  if (rawData === null || rawData === undefined) {
    return err(createParseError('MCP configuration file is empty', { filePath }));
  }

  if (typeof rawData !== 'object' || Array.isArray(rawData)) {
    return err(createParseError('MCP configuration must be an object', { filePath }));
  }

  // Interpolate environment variables if requested
  const data = interpolateEnv ? interpolateEnvVarsInObject(rawData) : rawData;

  // Validate the configuration
  const validationErrors = validateMcpConfig(data);

  if (validationErrors.length > 0) {
    return err(createParseError('MCP configuration validation failed', {
      filePath,
      validationErrors,
    }));
  }

  // Build the config object with defaults
  const servers: Record<string, McpServer> = {};
  const rawServers = data.servers as Record<string, Record<string, unknown>>;

  for (const [name, serverData] of Object.entries(rawServers)) {
    servers[name] = applyServerDefaults(serverData);
  }

  const config: McpConfig = {
    servers,
  };

  if (data.version !== undefined) {
    config.version = data.version as string;
  }

  // Build result with only defined properties
  const result: ParsedMcpConfig = {
    config,
  };

  if (filePath !== undefined) {
    result.filePath = filePath;
  }

  return ok(result);
}

/**
 * Filter MCP servers by target
 */
export function filterServersByTarget(
  config: McpConfig,
  target: TargetType
): McpConfig {
  const filteredServers: Record<string, McpServer> = {};

  for (const [name, server] of Object.entries(config.servers)) {
    const targets = server.targets ?? MCP_SERVER_DEFAULTS.targets;
    const enabled = server.enabled ?? MCP_SERVER_DEFAULTS.enabled;

    if (enabled && targets.includes(target)) {
      filteredServers[name] = server;
    }
  }

  const result: McpConfig = {
    servers: filteredServers,
  };

  if (config.version !== undefined) {
    result.version = config.version;
  }

  return result;
}

/**
 * Get enabled servers from config
 */
export function getEnabledServers(config: McpConfig): Record<string, McpServer> {
  const result: Record<string, McpServer> = {};

  for (const [name, server] of Object.entries(config.servers)) {
    const enabled = server.enabled ?? MCP_SERVER_DEFAULTS.enabled;
    if (enabled) {
      result[name] = server;
    }
  }

  return result;
}

/**
 * Count servers by type
 */
export function countServersByType(config: McpConfig): { command: number; url: number } {
  let command = 0;
  let url = 0;

  for (const server of Object.values(config.servers)) {
    if (isCommandServer(server)) {
      command++;
    } else {
      url++;
    }
  }

  return { command, url };
}

