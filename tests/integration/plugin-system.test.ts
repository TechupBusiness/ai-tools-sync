/**
 * @file Plugin System Integration Tests
 * @description End-to-end tests for Claude plugin loading
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  ClaudePluginLoader,
  clearClaudePluginCache,
  getClaudePluginCacheEntries,
} from '../../src/loaders/claude-plugin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.resolve(__dirname, '../fixtures/claude-plugins');

describe('Plugin System Integration', () => {
  let loader: ClaudePluginLoader;
  let tempDir: string;

  beforeEach(() => {
    loader = new ClaudePluginLoader();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-system-'));
    clearClaudePluginCache();
  });

  afterEach(() => {
    clearClaudePluginCache();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should load plugin with manifest, hooks, commands, and mcp servers', async () => {
    const pluginPath = path.join(FIXTURES_PATH, 'full-manifest-plugin');
    const result = await loader.load(`claude-plugin:${pluginPath}`);

    expect(result.rules.length).toBeGreaterThan(0);
    expect(result.personas.length).toBeGreaterThan(0);
    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.hooks.length).toBeGreaterThan(0);
    expect(result.mcpServers).toBeDefined();
    expect(result.metadata?.pluginName).toBe('full-test-plugin');
  });

  it('should resolve ${CLAUDE_PLUGIN_ROOT} throughout loaded content', async () => {
    const pluginPath = path.join(FIXTURES_PATH, 'full-manifest-plugin');
    const result = await loader.load(`claude-plugin:${pluginPath}`);

    const skill = result.rules.find((r) => r.frontmatter.name === 'typescript-full');
    const hook = result.hooks.find((h) => h.frontmatter.name === 'security-check');
    const server = result.mcpServers?.['filesystem'];

    expect(skill?.content).toContain(pluginPath);
    expect(hook?.frontmatter.execute).toContain(pluginPath);
    expect(server?.args?.[0]).toContain(pluginPath);
    expect(server?.cwd ?? pluginPath).toContain(pluginPath);
  });

  it('should cache plugin paths for subsequent loads', async () => {
    const pluginPath = path.join(FIXTURES_PATH, 'minimal-manifest-plugin');

    await loader.load(`claude-plugin:${pluginPath}`);
    await loader.load(`claude-plugin:${pluginPath}`);

    expect(getClaudePluginCacheEntries().size).toBeGreaterThanOrEqual(1);
  });

  it('should handle missing plugin gracefully and report error', async () => {
    const result = await loader.load('claude-plugin:/definitely/missing/path');

    expect(result.rules.length).toBe(0);
    expect(result.errors).toBeDefined();
    expect(result.errors?.[0]?.message).toContain('does not exist');
  });
});
