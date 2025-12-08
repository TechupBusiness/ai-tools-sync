/**
 * @file Claude Plugin Loader Tests
 * @description Tests for loading content from Claude-native plugin format
 */

import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';


import {
  ClaudePluginLoader,
  createClaudePluginLoader,
  clearClaudePluginCache,
  getClaudePluginCacheEntries,
  CLAUDE_PLUGIN_PREFIX,
} from '../../../src/loaders/claude-plugin.js';

import type { McpCommandServer, McpUrlServer } from '../../../src/parsers/mcp.js';

// Test fixtures path
const FIXTURES_PATH = path.join(__dirname, '../../fixtures/claude-plugins');

describe('ClaudePluginLoader', () => {
  let loader: ClaudePluginLoader;

  beforeEach(() => {
    loader = new ClaudePluginLoader();
    clearClaudePluginCache();
  });

  afterEach(() => {
    clearClaudePluginCache();
  });

  describe('canLoad()', () => {
    it('should return true for claude-plugin: prefixed sources', () => {
      expect(loader.canLoad('claude-plugin:./local/path')).toBe(true);
      expect(loader.canLoad('claude-plugin:/absolute/path')).toBe(true);
      expect(loader.canLoad('claude-plugin:npm:@anthropic/plugin')).toBe(true);
      expect(loader.canLoad('claude-plugin:my-plugin')).toBe(true);
    });

    it('should return false for non-claude-plugin sources', () => {
      expect(loader.canLoad('./local/path')).toBe(false);
      expect(loader.canLoad('/absolute/path')).toBe(false);
      expect(loader.canLoad('npm:some-package')).toBe(false);
      expect(loader.canLoad('pip:some-package')).toBe(false);
      expect(loader.canLoad('https://example.com')).toBe(false);
    });
  });

  describe('load() - basic plugin', () => {
    const basicPluginPath = path.join(FIXTURES_PATH, 'basic-plugin');

    it('should load skills and transform to rules', async () => {
      const result = await loader.load(`claude-plugin:${basicPluginPath}`);

      expect(result.rules.length).toBe(2);
      expect(result.errors).toBeUndefined();
      expect(result.source).toBe(`claude-plugin:${basicPluginPath}`);

      // Check typescript skill
      const tsRule = result.rules.find((r) => r.frontmatter.name === 'typescript');
      expect(tsRule).toBeDefined();
      expect(tsRule!.frontmatter.description).toBe('TypeScript coding standards and best practices');
      expect(tsRule!.frontmatter.globs).toEqual(['**/*.ts', '**/*.tsx']);
      expect(tsRule!.frontmatter.always_apply).toBe(false);
      expect(tsRule!.frontmatter.category).toBe('other'); // Claude skills map to 'other' category
    });

    it('should handle both trigger and globs in skills', async () => {
      const result = await loader.load(`claude-plugin:${basicPluginPath}`);

      // React skill has globs directly
      const reactRule = result.rules.find((r) => r.frontmatter.name === 'react');
      expect(reactRule).toBeDefined();
      expect(reactRule!.frontmatter.globs).toEqual(['**/*.tsx', '**/*.jsx']);
      expect(reactRule!.frontmatter.always_apply).toBe(true);
    });

    it('should load agents and transform to personas', async () => {
      const result = await loader.load(`claude-plugin:${basicPluginPath}`);

      expect(result.personas.length).toBe(2);

      // Check architect agent
      const architect = result.personas.find((p) => p.frontmatter.name === 'architect');
      expect(architect).toBeDefined();
      expect(architect!.frontmatter.description).toBe('System architecture and design specialist');
      expect(architect!.frontmatter.model).toBe('claude-sonnet');
      // Tools should be normalized to lowercase
      expect(architect!.frontmatter.tools).toEqual(['read', 'search', 'glob']);
    });

    it('should normalize Claude tool names to generic format', async () => {
      const result = await loader.load(`claude-plugin:${basicPluginPath}`);

      const reviewer = result.personas.find((p) => p.frontmatter.name === 'reviewer');
      expect(reviewer).toBeDefined();
      expect(reviewer!.frontmatter.tools).toEqual(['read', 'search']);
    });

    it('should load commands', async () => {
      const result = await loader.load(`claude-plugin:${basicPluginPath}`);

      expect(result.commands.length).toBe(1);

      const deployCmd = result.commands.find((c) => c.frontmatter.name === 'deploy');
      expect(deployCmd).toBeDefined();
      expect(deployCmd!.frontmatter.description).toBe('Deploy the application');
      expect(deployCmd!.frontmatter.execute).toBe('./scripts/deploy.sh');
    });

    it('should set default targets for all content types', async () => {
      const result = await loader.load(`claude-plugin:${basicPluginPath}`);

      // Rules should target all tools
      for (const rule of result.rules) {
        expect(rule.frontmatter.targets).toEqual(['cursor', 'claude', 'factory']);
      }

      // Personas should target all tools
      for (const persona of result.personas) {
        expect(persona.frontmatter.targets).toEqual(['cursor', 'claude', 'factory']);
      }
    });
  });

  describe('load() - hooks from hooks/hooks.json', () => {
    const fullHooksPluginPath = path.join(FIXTURES_PATH, 'full-hooks-plugin');

    describe('event types', () => {
      it('should parse all Claude event types', async () => {
        const result = await loader.load(`claude-plugin:${fullHooksPluginPath}`);

        const events = result.hooks.map((h) => h.frontmatter.event);
        expect(events).toEqual(
          expect.arrayContaining([
            'UserPromptSubmit',
            'PreToolUse',
            'PostToolUse',
            'Notification',
            'Stop',
            'SubagentStop',
            'SessionStart',
            'SessionEnd',
            'PreCompact',
          ])
        );
        expect(result.hooks.length).toBeGreaterThanOrEqual(9);
      });

      it('should map UserPromptSubmit event correctly', async () => {
        const result = await loader.load(`claude-plugin:${fullHooksPluginPath}`);

        const promptFilter = result.hooks.find((h) => h.frontmatter.name === 'prompt-filter');
        expect(promptFilter).toBeDefined();
        expect(promptFilter!.frontmatter.event).toBe('UserPromptSubmit');
      });

      it('should map session lifecycle events correctly', async () => {
        const result = await loader.load(`claude-plugin:${fullHooksPluginPath}`);

        const sessionStart = result.hooks.find((h) => h.frontmatter.name === 'init-workspace');
        const sessionEnd = result.hooks.find((h) => h.frontmatter.name === 'save-context');
        expect(sessionStart?.frontmatter.event).toBe('SessionStart');
        expect(sessionEnd?.frontmatter.event).toBe('SessionEnd');
      });
    });

    describe('matcher patterns', () => {
      it('should preserve complex match patterns', async () => {
        const result = await loader.load(`claude-plugin:${fullHooksPluginPath}`);

        const securityHook = result.hooks.find((h) => h.frontmatter.name === 'security-check');
        expect(securityHook).toBeDefined();
        expect(securityHook!.frontmatter.tool_match).toBe('Bash(*rm*)|Bash(*sudo*)');
      });

      it('should handle pipe-separated matchers', async () => {
        const result = await loader.load(`claude-plugin:${fullHooksPluginPath}`);

        const formatHook = result.hooks.find((h) => h.frontmatter.name === 'format-on-edit');
        expect(formatHook?.frontmatter.tool_match).toBe('Write|Edit');
      });
    });

    describe('hook types', () => {
      it('should preserve hook type (command/validation/notification)', async () => {
        const result = await loader.load(`claude-plugin:${fullHooksPluginPath}`);

        const promptFilter = result.hooks.find((h) => h.frontmatter.name === 'prompt-filter');
        const notification = result.hooks.find((h) => h.frontmatter.name === 'cleanup');
        expect(promptFilter?.frontmatter.claude?.type).toBe('validation');
        expect(notification?.frontmatter.claude?.type).toBe('notification');
      });
    });

    describe('path resolution', () => {
      it('should resolve ${CLAUDE_PLUGIN_ROOT} in command paths', async () => {
        const result = await loader.load(`claude-plugin:${fullHooksPluginPath}`);

        const promptFilter = result.hooks.find((h) => h.frontmatter.name === 'prompt-filter');
        expect(promptFilter).toBeDefined();
        expect(promptFilter!.frontmatter.execute).not.toContain('${CLAUDE_PLUGIN_ROOT}');
        expect(promptFilter!.frontmatter.execute).toContain(fullHooksPluginPath);
      });
    });

    describe('hook actions', () => {
      it('should preserve hook action types', async () => {
        const result = await loader.load(`claude-plugin:${fullHooksPluginPath}`);

        const fileGuard = result.hooks.find((h) => h.frontmatter.name === 'file-guard');
        expect(fileGuard).toBeDefined();
        expect(fileGuard!.content).toContain('Cannot modify .env files');
        expect(fileGuard!.frontmatter.claude?.action).toBe('deny');
      });
    });

  });

  describe('load() - MCP servers from .mcp.json', () => {
    const mcpPluginPath = path.join(FIXTURES_PATH, 'mcp-plugin');

    describe('server loading', () => {
      it('should load MCP servers from .mcp.json', async () => {
        const result = await loader.load(`claude-plugin:${mcpPluginPath}`);

        expect(result.mcpServers).toBeDefined();
        expect(Object.keys(result.mcpServers!).length).toBe(3);
        expect(result.mcpServers!['local-server']).toBeDefined();
        expect(result.mcpServers!['remote-api']).toBeDefined();
        expect(result.mcpServers!['sse-server']).toBeDefined();
      });

      it('should load stdio (command) servers correctly', async () => {
        process.env.MCP_API_KEY = 'test-key-12345';

        const result = await loader.load(`claude-plugin:${mcpPluginPath}`);
        const server = result.mcpServers!['local-server'] as McpCommandServer;

        expect(server.command).toBe('node');
        expect(server.args).toBeDefined();
        expect(server.args?.[0]).toContain('mcp-server/index.js');
        expect(server.env?.API_KEY).toBe('test-key-12345');
        expect(server.env?.DEBUG).toBe('true');
        expect(server.cwd).toContain(mcpPluginPath);
        expect(server.description).toBe('Local MCP server bundled with plugin');
        expect(server.targets).toEqual(['cursor', 'claude', 'factory']);
        expect(server.enabled).toBe(true);

        delete process.env.MCP_API_KEY;
      });

      it('should load HTTP servers correctly', async () => {
        process.env.API_TOKEN = 'token-123';

        const result = await loader.load(`claude-plugin:${mcpPluginPath}`);
        const server = result.mcpServers!['remote-api'] as McpUrlServer;

        expect(server.url).toBe('https://api.example.com/mcp');
        expect(server.headers).toBeDefined();
        expect(server.headers?.Authorization).toBe('Bearer token-123');
        expect(server.headers?.['X-Custom-Header']).toBe('value');
        expect(server.description).toBe('Remote HTTP MCP server');
        expect(server.targets).toEqual(['cursor', 'claude', 'factory']);
        expect(server.enabled).toBe(true);

        delete process.env.API_TOKEN;
      });

      it('should load SSE servers', async () => {
        const result = await loader.load(`claude-plugin:${mcpPluginPath}`);

        const server = result.mcpServers!['sse-server'] as McpUrlServer;
        expect(server.url).toBe('https://api.example.com/mcp/sse');
        expect(server.description).toBe('SSE-based MCP server');
        expect(server.targets).toEqual(['cursor', 'claude', 'factory']);
        expect(server.enabled).toBe(true);
      });
    });

    describe('variable substitution', () => {
      it('should resolve ${CLAUDE_PLUGIN_ROOT} in server paths', async () => {
        const result = await loader.load(`claude-plugin:${mcpPluginPath}`);

        const server = result.mcpServers!['local-server'] as McpCommandServer;
        expect(server.args?.[0]).not.toContain('${CLAUDE_PLUGIN_ROOT}');
        expect(server.args?.[0]).toContain(mcpPluginPath);
        expect(server.cwd).not.toContain('${CLAUDE_PLUGIN_ROOT}');
        expect(server.cwd).toContain(mcpPluginPath);
      });

      it('should interpolate environment variables in env values', async () => {
        process.env.MCP_API_KEY = 'interpolated-key';

        const result = await loader.load(`claude-plugin:${mcpPluginPath}`);
        const server = result.mcpServers!['local-server'] as McpCommandServer;
        expect(server.env?.API_KEY).toBe('interpolated-key');

        delete process.env.MCP_API_KEY;
      });

      it('should interpolate environment variables in headers', async () => {
        process.env.API_TOKEN = 'headers-token';

        const result = await loader.load(`claude-plugin:${mcpPluginPath}`);
        const server = result.mcpServers!['remote-api'] as McpUrlServer;
        expect(server.headers?.Authorization).toBe('Bearer headers-token');

        delete process.env.API_TOKEN;
      });
    });

    describe('error handling', () => {
      it('should handle missing .mcp.json gracefully', async () => {
        const emptyPluginPath = path.join(FIXTURES_PATH, 'empty-plugin');
        const result = await loader.load(`claude-plugin:${emptyPluginPath}`);

        expect(result.mcpServers).toBeUndefined();
      });
    });

    describe('target assignment', () => {
      it('should assign all targets to plugin MCP servers', async () => {
        const result = await loader.load(`claude-plugin:${mcpPluginPath}`);

        for (const server of Object.values(result.mcpServers!)) {
          expect(server.targets).toEqual(['cursor', 'claude', 'factory']);
          expect(server.enabled).toBe(true);
        }
      });
    });
  });

  describe('load() - flat skills', () => {
    const flatSkillsPath = path.join(FIXTURES_PATH, 'flat-skills');

    it('should load flat .md files from skills directory', async () => {
      const result = await loader.load(`claude-plugin:${flatSkillsPath}`);

      expect(result.rules.length).toBe(2);

      const pythonRule = result.rules.find((r) => r.frontmatter.name === 'python');
      expect(pythonRule).toBeDefined();
      expect(pythonRule!.frontmatter.description).toBe('Python coding standards');
    });

    it('should convert extension triggers to glob patterns', async () => {
      const result = await loader.load(`claude-plugin:${flatSkillsPath}`);

      const pythonRule = result.rules.find((r) => r.frontmatter.name === 'python');
      expect(pythonRule).toBeDefined();
      // ".py" should become "**/*.py"
      expect(pythonRule!.frontmatter.globs).toEqual(['**/*.py']);
    });
  });

  describe('load() - empty plugin', () => {
    const emptyPluginPath = path.join(FIXTURES_PATH, 'empty-plugin');

    it('should return empty results for plugin with no content', async () => {
      const result = await loader.load(`claude-plugin:${emptyPluginPath}`);

      expect(result.rules.length).toBe(0);
      expect(result.personas.length).toBe(0);
      expect(result.commands.length).toBe(0);
      expect(result.hooks.length).toBe(0);
      expect(result.errors).toBeUndefined();
    });
  });

  describe('load() - target filtering', () => {
    const basicPluginPath = path.join(FIXTURES_PATH, 'basic-plugin');

    it('should filter by target', async () => {
      const result = await loader.load(`claude-plugin:${basicPluginPath}`, {
        targets: ['cursor'],
      });

      // All content targets all tools, so all should be included
      expect(result.rules.length).toBe(2);
      expect(result.personas.length).toBe(2);
    });

    it('should exclude hooks when filtering for non-claude targets', async () => {
      const fullHooksPluginPath = path.join(FIXTURES_PATH, 'full-hooks-plugin');
      const result = await loader.load(`claude-plugin:${fullHooksPluginPath}`, {
        targets: ['cursor'],
      });

      // Hooks only target claude, so they should be filtered out
      expect(result.hooks.length).toBe(0);
    });

    it('should include hooks when filtering for claude target', async () => {
      const fullHooksPluginPath = path.join(FIXTURES_PATH, 'full-hooks-plugin');
      const result = await loader.load(`claude-plugin:${fullHooksPluginPath}`, {
        targets: ['claude'],
      });

      // full-hooks-plugin has 9+ hooks in hooks/hooks.json
      expect(result.hooks.length).toBeGreaterThanOrEqual(9);
    });
  });

  describe('load() - error handling', () => {
    it('should return error for non-existent plugin', async () => {
      const result = await loader.load('claude-plugin:/non/existent/path');

      expect(result.rules.length).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBe(1);
      expect(result.errors![0].message).toContain('does not exist');
    });
  });

  describe('load() - path resolution', () => {
    it('should resolve absolute paths', async () => {
      const absolutePath = path.join(FIXTURES_PATH, 'basic-plugin');
      const result = await loader.load(`claude-plugin:${absolutePath}`);

      expect(result.rules.length).toBe(2);
    });

    it('should resolve relative paths from basePath', async () => {
      const result = await loader.load('claude-plugin:./basic-plugin', {
        basePath: FIXTURES_PATH,
      });

      expect(result.rules.length).toBe(2);
    });
  });

  describe('caching', () => {
    const basicPluginPath = path.join(FIXTURES_PATH, 'basic-plugin');

    it('should cache resolved plugin paths', async () => {
      await loader.load(`claude-plugin:${basicPluginPath}`);

      const cache = getClaudePluginCacheEntries();
      expect(cache.has(`claude-plugin:${basicPluginPath}`)).toBe(true);
    });

    it('should reuse cached paths', async () => {
      const result1 = await loader.load(`claude-plugin:${basicPluginPath}`);
      const result2 = await loader.load(`claude-plugin:${basicPluginPath}`);

      expect(result1.rules.length).toBe(result2.rules.length);
    });

    it('should clear cache with clearClaudePluginCache()', async () => {
      await loader.load(`claude-plugin:${basicPluginPath}`);

      expect(getClaudePluginCacheEntries().size).toBeGreaterThan(0);

      clearClaudePluginCache();

      expect(getClaudePluginCacheEntries().size).toBe(0);
    });
  });

  describe('load() - plugin.json manifest', () => {
    const manifestPluginPath = path.join(FIXTURES_PATH, 'manifest-plugin');

    it('should load manifest and use custom paths', async () => {
      const result = await loader.load(`claude-plugin:${manifestPluginPath}`);

      expect(result.errors).toBeUndefined();
      expect(result.rules.length).toBe(1);
      expect(result.personas.length).toBe(1);
      expect(result.commands.length).toBe(1);
    });

    it('should populate metadata from manifest', async () => {
      const result = await loader.load(`claude-plugin:${manifestPluginPath}`);

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.pluginName).toBe('manifest-test-plugin');
      expect(result.metadata?.pluginVersion).toBe('1.2.3');
      expect(result.metadata?.pluginDescription).toBe('A plugin for testing manifest support');
    });

    it('should load content from custom paths specified in manifest', async () => {
      const result = await loader.load(`claude-plugin:${manifestPluginPath}`);

      // Should find rule in custom-skills/
      const rule = result.rules.find((r) => r.frontmatter.name === 'python-advanced');
      expect(rule).toBeDefined();
      expect(rule!.frontmatter.description).toBe('Advanced Python techniques');

      // Should find persona in custom-agents/
      const persona = result.personas.find((p) => p.frontmatter.name === 'debugger');
      expect(persona).toBeDefined();
      expect(persona!.frontmatter.description).toBe('Expert debugging agent');

      // Should find command in custom-commands/
      const command = result.commands.find((c) => c.frontmatter.name === 'analyze');
      expect(command).toBeDefined();
      expect(command!.frontmatter.description).toBe('Analyze code quality');
    });

    it('should resolve ${CLAUDE_PLUGIN_ROOT} in manifest paths', async () => {
      const pluginRootVarPath = path.join(FIXTURES_PATH, 'plugin-root-var');
      const result = await loader.load(`claude-plugin:${pluginRootVarPath}`);

      expect(result.errors).toBeUndefined();
      expect(result.rules.length).toBe(1);
      expect(result.rules[0].frontmatter.name).toBe('typescript');
    });

    it('should fall back to convention paths when manifest paths missing', async () => {
      // Create a test case where manifest only specifies some paths
      // The basic-plugin doesn't have a manifest, so it should use conventions
      const basicPluginPath = path.join(FIXTURES_PATH, 'basic-plugin');
      const result = await loader.load(`claude-plugin:${basicPluginPath}`);

      // Should still work even without manifest
      expect(result.errors).toBeUndefined();
      expect(result.rules.length).toBe(2);
    });

    it('should work without manifest using conventions', async () => {
      // Plugin without manifest should use convention paths
      const basicPluginPath = path.join(FIXTURES_PATH, 'basic-plugin');
      const result = await loader.load(`claude-plugin:${basicPluginPath}`);

      // Should still load via convention
      expect(result.rules.length).toBe(2);
      expect(result.metadata).toBeUndefined(); // No manifest = no metadata
    });
  });
});

describe('createClaudePluginLoader()', () => {
  it('should create a new ClaudePluginLoader instance', () => {
    const loader = createClaudePluginLoader();
    expect(loader).toBeInstanceOf(ClaudePluginLoader);
    expect(loader.name).toBe('claude-plugin');
  });
});

describe('CLAUDE_PLUGIN_PREFIX constant', () => {
  it('should be "claude-plugin:"', () => {
    expect(CLAUDE_PLUGIN_PREFIX).toBe('claude-plugin:');
  });
});

