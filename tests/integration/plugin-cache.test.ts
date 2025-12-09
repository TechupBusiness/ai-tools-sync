/**
 * @file Plugin Cache Integration Tests
 * @description Integration tests for plugin cache with loaders
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { ClaudePluginLoader } from '../../src/loaders/claude-plugin.js';
import { createPluginCache, type PluginCache } from '../../src/utils/plugin-cache.js';

describe('Plugin Cache Integration', () => {
  let tempDir: string;
  let cache: PluginCache;

  beforeEach(async () => {
    tempDir = path.join(__dirname, '.integration-cache-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });

    const result = await createPluginCache(tempDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      cache = result.value;
    }
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('ClaudePluginLoader with cache', () => {
    it('should load plugin when not cached', async () => {
      const loader = new ClaudePluginLoader();
      const fixturesPath = path.resolve(__dirname, '../fixtures/claude-plugins/basic-plugin');

      const result = await loader.load(`claude-plugin:${fixturesPath}`, {
        pluginCache: cache,
        useCache: true,
      });

      expect(result.rules.length).toBeGreaterThan(0);
      expect(result.personas.length).toBeGreaterThan(0);
    });

    it('should respect useCache: false option', async () => {
      const loader = new ClaudePluginLoader();
      const fixturesPath = path.resolve(__dirname, '../fixtures/claude-plugins/basic-plugin');

      // First load
      const result1 = await loader.load(`claude-plugin:${fixturesPath}`, {
        pluginCache: cache,
        useCache: false,
      });

      expect(result1.rules.length).toBeGreaterThan(0);

      // Should still work without cache
      const result2 = await loader.load(`claude-plugin:${fixturesPath}`, {
        pluginCache: cache,
        useCache: false,
      });

      expect(result2.rules.length).toBe(result1.rules.length);
    });

    it('should work without cache instance', async () => {
      const loader = new ClaudePluginLoader();
      const fixturesPath = path.resolve(__dirname, '../fixtures/claude-plugins/basic-plugin');

      const result = await loader.load(`claude-plugin:${fixturesPath}`);

      expect(result.rules.length).toBeGreaterThan(0);
    });
  });

  describe('${CLAUDE_PLUGIN_ROOT} variable resolution', () => {
    it('should resolve variable in skill content', async () => {
      const loader = new ClaudePluginLoader();

      // Create a test plugin with ${CLAUDE_PLUGIN_ROOT} variable
      const pluginPath = path.join(tempDir, 'test-plugin');
      const skillsDir = path.join(pluginPath, 'skills', 'test-skill');
      await fs.mkdir(skillsDir, { recursive: true });

      const skillContent = `---
name: test-skill
description: Test skill with variable
---

This skill references \${CLAUDE_PLUGIN_ROOT}/path/to/file.md`;

      await fs.writeFile(path.join(skillsDir, 'SKILL.md'), skillContent, 'utf-8');

      const result = await loader.load(`claude-plugin:${pluginPath}`);

      expect(result.rules.length).toBe(1);
      expect(result.rules[0].content).toContain(pluginPath);
      expect(result.rules[0].content).not.toContain('${CLAUDE_PLUGIN_ROOT}');
    });
  });
});
