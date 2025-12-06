/**
 * @file MCP Parser Tests
 * @description Tests for MCP configuration parsing, validation, and environment variable interpolation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  countServersByType,
  filterServersByTarget,
  getEnabledServers,
  interpolateEnvVars,
  isCommandServer,
  isUrlServer,
  MCP_SERVER_DEFAULTS,
  parseMcpConfig,
  type McpCommandServer,
  type McpConfig,
  type McpUrlServer,
} from '../../../src/parsers/mcp.js';

describe('MCP Parser', () => {
  describe('parseMcpConfig', () => {
    it('should parse valid MCP config with command server', () => {
      const yaml = `
version: "1.0.0"
servers:
  filesystem:
    command: npx
    args:
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
    description: "File system access"
`;

      const result = parseMcpConfig(yaml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.config.version).toBe('1.0.0');
        expect(result.value.config.servers.filesystem).toBeDefined();
        const server = result.value.config.servers.filesystem as McpCommandServer;
        expect(server.command).toBe('npx');
        expect(server.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem']);
        expect(server.description).toBe('File system access');
      }
    });

    it('should parse valid MCP config with URL server', () => {
      const yaml = `
servers:
  api:
    url: "https://api.example.com/mcp"
    headers:
      Authorization: "Bearer token123"
    description: "Remote API"
`;

      const result = parseMcpConfig(yaml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const server = result.value.config.servers.api as McpUrlServer;
        expect(server.url).toBe('https://api.example.com/mcp');
        expect(server.headers).toEqual({ Authorization: 'Bearer token123' });
        expect(server.description).toBe('Remote API');
      }
    });

    it('should parse multiple servers', () => {
      const yaml = `
servers:
  filesystem:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem"]
  memory:
    command: node
    args: ["memory-server.js"]
    env:
      MAX_MEMORY: "1024"
  remote:
    url: "https://mcp.example.com"
`;

      const result = parseMcpConfig(yaml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Object.keys(result.value.config.servers)).toHaveLength(3);
        expect(result.value.config.servers.filesystem).toBeDefined();
        expect(result.value.config.servers.memory).toBeDefined();
        expect(result.value.config.servers.remote).toBeDefined();
      }
    });

    it('should apply default values for optional fields', () => {
      const yaml = `
servers:
  minimal:
    command: myserver
`;

      const result = parseMcpConfig(yaml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const server = result.value.config.servers.minimal as McpCommandServer;
        expect(server.enabled).toBe(true);
        expect(server.targets).toEqual(['cursor', 'claude', 'factory']);
        expect(server.args).toEqual([]);
      }
    });

    it('should parse servers with custom targets', () => {
      const yaml = `
servers:
  cursor-only:
    command: cursor-mcp
    targets:
      - cursor
  claude-only:
    command: claude-mcp
    targets:
      - claude
`;

      const result = parseMcpConfig(yaml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const cursorServer = result.value.config.servers['cursor-only'] as McpCommandServer;
        const claudeServer = result.value.config.servers['claude-only'] as McpCommandServer;
        expect(cursorServer.targets).toEqual(['cursor']);
        expect(claudeServer.targets).toEqual(['claude']);
      }
    });

    it('should handle disabled servers', () => {
      const yaml = `
servers:
  active:
    command: active-server
    enabled: true
  disabled:
    command: disabled-server
    enabled: false
`;

      const result = parseMcpConfig(yaml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const activeServer = result.value.config.servers.active as McpCommandServer;
        const disabledServer = result.value.config.servers.disabled as McpCommandServer;
        expect(activeServer.enabled).toBe(true);
        expect(disabledServer.enabled).toBe(false);
      }
    });

    it('should set filePath when provided', () => {
      const yaml = `
servers:
  test:
    command: test
`;

      const result = parseMcpConfig(yaml, '/path/to/mcp.yaml');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.filePath).toBe('/path/to/mcp.yaml');
      }
    });

    it('should reject empty content', () => {
      const result = parseMcpConfig('');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('empty');
      }
    });

    it('should reject config without servers', () => {
      const yaml = `
version: "1.0.0"
`;

      const result = parseMcpConfig(yaml);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.validationErrors).toBeDefined();
        expect(result.error.validationErrors![0].path).toBe('servers');
      }
    });

    it('should reject server with both command and url', () => {
      const yaml = `
servers:
  invalid:
    command: test
    url: "https://example.com"
`;

      const result = parseMcpConfig(yaml);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.validationErrors).toBeDefined();
        expect(result.error.validationErrors![0].message).toContain('cannot have both');
      }
    });

    it('should reject server with neither command nor url', () => {
      const yaml = `
servers:
  invalid:
    description: "Missing command and url"
`;

      const result = parseMcpConfig(yaml);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.validationErrors).toBeDefined();
        expect(result.error.validationErrors![0].message).toContain('either "command" or "url"');
      }
    });

    it('should reject invalid targets', () => {
      const yaml = `
servers:
  test:
    command: test
    targets:
      - invalid_target
`;

      const result = parseMcpConfig(yaml);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.validationErrors).toBeDefined();
        expect(result.error.validationErrors![0].message).toContain('Invalid target');
      }
    });

    it('should reject invalid URL format', () => {
      const yaml = `
servers:
  test:
    url: "not-a-valid-url"
`;

      const result = parseMcpConfig(yaml);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.validationErrors).toBeDefined();
        expect(result.error.validationErrors![0].message).toContain('Invalid URL');
      }
    });

    it('should reject empty command', () => {
      const yaml = `
servers:
  test:
    command: ""
`;

      const result = parseMcpConfig(yaml);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.validationErrors).toBeDefined();
        expect(result.error.validationErrors![0].message).toContain('cannot be empty');
      }
    });

    it('should reject non-string args', () => {
      const yaml = `
servers:
  test:
    command: test
    args:
      - 123
`;

      const result = parseMcpConfig(yaml);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.validationErrors).toBeDefined();
        expect(result.error.validationErrors![0].message).toContain('must be a string');
      }
    });

    it('should reject non-string env values', () => {
      const yaml = `
servers:
  test:
    command: test
    env:
      PORT: 8080
`;

      const result = parseMcpConfig(yaml);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.validationErrors).toBeDefined();
        expect(result.error.validationErrors![0].message).toContain('must be a string');
      }
    });

    it('should reject invalid version format', () => {
      const yaml = `
version: "invalid"
servers:
  test:
    command: test
`;

      const result = parseMcpConfig(yaml);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.validationErrors).toBeDefined();
        expect(result.error.validationErrors![0].message).toContain('semver');
      }
    });
  });

  describe('interpolateEnvVars', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should interpolate environment variables', () => {
      process.env.MY_VAR = 'hello';
      expect(interpolateEnvVars('${MY_VAR}')).toBe('hello');
      expect(interpolateEnvVars('prefix-${MY_VAR}-suffix')).toBe('prefix-hello-suffix');
    });

    it('should keep placeholder for undefined env vars', () => {
      delete process.env.UNDEFINED_VAR;
      expect(interpolateEnvVars('${UNDEFINED_VAR}')).toBe('${UNDEFINED_VAR}');
    });

    it('should handle multiple variables', () => {
      process.env.VAR1 = 'one';
      process.env.VAR2 = 'two';
      expect(interpolateEnvVars('${VAR1} and ${VAR2}')).toBe('one and two');
    });

    it('should handle strings without variables', () => {
      expect(interpolateEnvVars('no variables here')).toBe('no variables here');
    });

    it('should interpolate env vars in MCP config', () => {
      process.env.MCP_TOKEN = 'secret123';
      process.env.MCP_HOST = 'localhost';

      const yaml = `
servers:
  api:
    url: "https://\${MCP_HOST}/api"
    headers:
      Authorization: "Bearer \${MCP_TOKEN}"
`;

      const result = parseMcpConfig(yaml, undefined, true);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const server = result.value.config.servers.api as McpUrlServer;
        expect(server.url).toBe('https://localhost/api');
        expect(server.headers?.Authorization).toBe('Bearer secret123');
      }
    });

    it('should skip env interpolation when disabled', () => {
      process.env.MY_VAR = 'replaced';

      const yaml = `
servers:
  test:
    command: "\${MY_VAR}"
`;

      const result = parseMcpConfig(yaml, undefined, false);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const server = result.value.config.servers.test as McpCommandServer;
        expect(server.command).toBe('${MY_VAR}');
      }
    });
  });

  describe('filterServersByTarget', () => {
    const config: McpConfig = {
      servers: {
        all: {
          command: 'all',
          targets: ['cursor', 'claude', 'factory'],
          enabled: true,
        },
        cursorOnly: {
          command: 'cursor',
          targets: ['cursor'],
          enabled: true,
        },
        claudeOnly: {
          command: 'claude',
          targets: ['claude'],
          enabled: true,
        },
        factoryOnly: {
          command: 'factory',
          targets: ['factory'],
          enabled: true,
        },
        disabled: {
          command: 'disabled',
          targets: ['cursor', 'claude', 'factory'],
          enabled: false,
        },
      },
    };

    it('should filter servers by cursor target', () => {
      const filtered = filterServersByTarget(config, 'cursor');
      expect(Object.keys(filtered.servers)).toHaveLength(2);
      expect(filtered.servers.all).toBeDefined();
      expect(filtered.servers.cursorOnly).toBeDefined();
      expect(filtered.servers.claudeOnly).toBeUndefined();
      expect(filtered.servers.factoryOnly).toBeUndefined();
      expect(filtered.servers.disabled).toBeUndefined();
    });

    it('should filter servers by claude target', () => {
      const filtered = filterServersByTarget(config, 'claude');
      expect(Object.keys(filtered.servers)).toHaveLength(2);
      expect(filtered.servers.all).toBeDefined();
      expect(filtered.servers.claudeOnly).toBeDefined();
    });

    it('should filter servers by factory target', () => {
      const filtered = filterServersByTarget(config, 'factory');
      expect(Object.keys(filtered.servers)).toHaveLength(2);
      expect(filtered.servers.all).toBeDefined();
      expect(filtered.servers.factoryOnly).toBeDefined();
    });

    it('should exclude disabled servers', () => {
      const filtered = filterServersByTarget(config, 'cursor');
      expect(filtered.servers.disabled).toBeUndefined();
    });

    it('should preserve version', () => {
      const configWithVersion: McpConfig = {
        version: '1.0.0',
        ...config,
      };
      const filtered = filterServersByTarget(configWithVersion, 'cursor');
      expect(filtered.version).toBe('1.0.0');
    });
  });

  describe('getEnabledServers', () => {
    it('should return only enabled servers', () => {
      const config: McpConfig = {
        servers: {
          enabled1: { command: 'cmd1', enabled: true },
          enabled2: { command: 'cmd2', enabled: true },
          disabled: { command: 'cmd3', enabled: false },
          defaultEnabled: { command: 'cmd4' }, // defaults to enabled
        },
      };

      const enabled = getEnabledServers(config);
      expect(Object.keys(enabled)).toHaveLength(3);
      expect(enabled.enabled1).toBeDefined();
      expect(enabled.enabled2).toBeDefined();
      expect(enabled.defaultEnabled).toBeDefined();
      expect(enabled.disabled).toBeUndefined();
    });
  });

  describe('countServersByType', () => {
    it('should count command and URL servers', () => {
      const config: McpConfig = {
        servers: {
          cmd1: { command: 'cmd1' },
          cmd2: { command: 'cmd2' },
          url1: { url: 'https://example.com' },
        },
      };

      const counts = countServersByType(config);
      expect(counts.command).toBe(2);
      expect(counts.url).toBe(1);
    });

    it('should handle empty servers', () => {
      const config: McpConfig = { servers: {} };
      const counts = countServersByType(config);
      expect(counts.command).toBe(0);
      expect(counts.url).toBe(0);
    });
  });

  describe('isCommandServer / isUrlServer', () => {
    it('should identify command servers', () => {
      const cmdServer: McpCommandServer = { command: 'test' };
      const urlServer: McpUrlServer = { url: 'https://example.com' };

      expect(isCommandServer(cmdServer)).toBe(true);
      expect(isCommandServer(urlServer)).toBe(false);
      expect(isUrlServer(cmdServer)).toBe(false);
      expect(isUrlServer(urlServer)).toBe(true);
    });
  });

  describe('MCP_SERVER_DEFAULTS', () => {
    it('should have correct default values', () => {
      expect(MCP_SERVER_DEFAULTS.enabled).toBe(true);
      expect(MCP_SERVER_DEFAULTS.targets).toEqual(['cursor', 'claude', 'factory']);
      expect(MCP_SERVER_DEFAULTS.args).toEqual([]);
    });
  });
});

