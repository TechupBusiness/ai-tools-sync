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

  describe('load() - hooks from settings.json', () => {
    const hooksPluginPath = path.join(FIXTURES_PATH, 'hooks-plugin');

    it('should load hooks from settings.json', async () => {
      const result = await loader.load(`claude-plugin:${hooksPluginPath}`);

      expect(result.hooks.length).toBe(3);
    });

    it('should transform PreToolUse hooks correctly', async () => {
      const result = await loader.load(`claude-plugin:${hooksPluginPath}`);

      const securityHook = result.hooks.find((h) => h.frontmatter.name === 'security-check');
      expect(securityHook).toBeDefined();
      expect(securityHook!.frontmatter.event).toBe('PreToolUse');
      expect(securityHook!.frontmatter.tool_match).toBe('Bash(*rm*)|Edit(*.env*)');
      expect(securityHook!.content).toBe('Potentially dangerous operation detected');
    });

    it('should transform PostToolUse hooks correctly', async () => {
      const result = await loader.load(`claude-plugin:${hooksPluginPath}`);

      const logHook = result.hooks.find((h) => h.frontmatter.name === 'log-changes');
      expect(logHook).toBeDefined();
      expect(logHook!.frontmatter.event).toBe('PostToolUse');
      expect(logHook!.frontmatter.execute).toBe('./scripts/log-changes.sh');
    });

    it('should set hooks target to claude only', async () => {
      const result = await loader.load(`claude-plugin:${hooksPluginPath}`);

      for (const hook of result.hooks) {
        expect(hook.frontmatter.targets).toEqual(['claude']);
      }
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
      const hooksPluginPath = path.join(FIXTURES_PATH, 'hooks-plugin');
      const result = await loader.load(`claude-plugin:${hooksPluginPath}`, {
        targets: ['cursor'],
      });

      // Hooks only target claude, so they should be filtered out
      expect(result.hooks.length).toBe(0);
    });

    it('should include hooks when filtering for claude target', async () => {
      const hooksPluginPath = path.join(FIXTURES_PATH, 'hooks-plugin');
      const result = await loader.load(`claude-plugin:${hooksPluginPath}`, {
        targets: ['claude'],
      });

      expect(result.hooks.length).toBe(3);
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

