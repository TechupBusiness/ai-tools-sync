/**
 * @file Pipeline Integration Tests
 * @description Tests for the complete loader → transformer → generator pipeline
 *
 * These tests verify that the full sync pipeline works correctly when
 * components are wired together, testing real-world scenarios rather than
 * individual components in isolation.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { DEFAULT_CONFIG_DIR } from '../../src/config/loader.js';
import { createResolvedContent, filterContentByTarget } from '../../src/generators/base.js';
import {
  createCursorGenerator,
  createClaudeGenerator,
  createFactoryGenerator,
} from '../../src/generators/index.js';
import { mergeLoadResults, getLoadResultStats } from '../../src/loaders/base.js';
import { createLocalLoader } from '../../src/loaders/local.js';
import { fileExists, dirExists, readFile } from '../../src/utils/fs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');
const TESTS_TMP_DIR = path.resolve(__dirname, '..', '.tmp');

// Mock logger to suppress output
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    list: vi.fn(),
    setVerbose: vi.fn(),
  },
}));

describe('Pipeline Integration', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(
      TESTS_TMP_DIR,
      `pipeline-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loader → generator pipeline', () => {
    it('should load content and generate cursor output', async () => {
      // Load from valid-source fixture
      const loader = createLocalLoader();
      const loadResult = await loader.load(path.join(FIXTURES_DIR, 'loaders', 'valid-source'), {
        basePath: testDir,
        targets: ['cursor'],
      });

      expect(loadResult.rules.length).toBeGreaterThan(0);
      expect(loadResult.personas.length).toBeGreaterThan(0);

      // Create resolved content
      const content = createResolvedContent(loadResult, testDir, 'test-project');

      // Generate cursor output
      const generator = createCursorGenerator();
      const result = await generator.generate(content, {
        outputDir: testDir,
        clean: true,
        addHeaders: true,
      });

      expect(result.files.length).toBeGreaterThan(0);

      // Verify generated files exist
      expect(await dirExists(path.join(testDir, '.cursor', 'rules'))).toBe(true);

      // Check that database rule was generated (it targets cursor)
      expect(await fileExists(path.join(testDir, '.cursor', 'rules', 'database.mdc'))).toBe(true);
    });

    it('should load content and generate claude output', async () => {
      const loader = createLocalLoader();
      const loadResult = await loader.load(path.join(FIXTURES_DIR, 'loaders', 'valid-source'), {
        basePath: testDir,
        targets: ['claude'],
      });

      const content = createResolvedContent(loadResult, testDir, 'test-project');

      const generator = createClaudeGenerator();
      const result = await generator.generate(content, {
        outputDir: testDir,
        clean: true,
        addHeaders: true,
      });

      expect(result.files.length).toBeGreaterThan(0);

      // Verify claude structure
      expect(await dirExists(path.join(testDir, '.claude', 'skills'))).toBe(true);
      expect(await fileExists(path.join(testDir, 'CLAUDE.md'))).toBe(true);
    });

    it('should load content and generate factory output', async () => {
      const loader = createLocalLoader();
      const loadResult = await loader.load(path.join(FIXTURES_DIR, 'loaders', 'valid-source'), {
        basePath: testDir,
        targets: ['factory'],
      });

      const content = createResolvedContent(loadResult, testDir, 'test-project');

      const generator = createFactoryGenerator();
      const result = await generator.generate(content, {
        outputDir: testDir,
        clean: true,
        addHeaders: true,
      });

      expect(result.files.length).toBeGreaterThan(0);

      // Verify factory structure
      expect(await dirExists(path.join(testDir, '.factory', 'skills'))).toBe(true);
      expect(await fileExists(path.join(testDir, 'AGENTS.md'))).toBe(true);
    });

    it('should generate for all targets from single load', async () => {
      const loader = createLocalLoader();
      const loadResult = await loader.load(path.join(FIXTURES_DIR, 'loaders', 'valid-source'), {
        basePath: testDir,
      });

      const content = createResolvedContent(loadResult, testDir, 'test-project');

      // Generate all targets
      const cursorResult = await createCursorGenerator().generate(content, {
        outputDir: testDir,
        addHeaders: false,
      });
      const claudeResult = await createClaudeGenerator().generate(content, {
        outputDir: testDir,
        addHeaders: false,
      });
      const factoryResult = await createFactoryGenerator().generate(content, {
        outputDir: testDir,
        addHeaders: false,
      });

      // All should have generated files
      expect(cursorResult.files.length).toBeGreaterThan(0);
      expect(claudeResult.files.length).toBeGreaterThan(0);
      expect(factoryResult.files.length).toBeGreaterThan(0);

      // All directories should exist
      expect(await dirExists(path.join(testDir, '.cursor'))).toBe(true);
      expect(await dirExists(path.join(testDir, '.claude'))).toBe(true);
      expect(await dirExists(path.join(testDir, '.factory'))).toBe(true);
    });
  });

  describe('content filtering by target', () => {
    it('should filter rules by target before generation', async () => {
      const loader = createLocalLoader();
      const loadResult = await loader.load(path.join(FIXTURES_DIR, 'loaders', 'valid-source'), {
        basePath: testDir,
      });

      // There should be a cursor-only rule in fixtures
      const cursorOnlyRule = loadResult.rules.find((r) => r.frontmatter.name === 'cursor-only');
      expect(cursorOnlyRule).toBeDefined();

      // Filter for cursor - should include cursor-only
      const cursorContent = filterContentByTarget(
        createResolvedContent(loadResult, testDir),
        'cursor'
      );
      expect(cursorContent.rules.some((r) => r.frontmatter.name === 'cursor-only')).toBe(true);

      // Filter for claude - should NOT include cursor-only
      const claudeContent = filterContentByTarget(
        createResolvedContent(loadResult, testDir),
        'claude'
      );
      expect(claudeContent.rules.some((r) => r.frontmatter.name === 'cursor-only')).toBe(false);
    });
  });

  describe('merging multiple load sources', () => {
    it('should merge content from multiple loaders', async () => {
      const loader = createLocalLoader();

      // Load from fixtures
      const fixtureResult = await loader.load(path.join(FIXTURES_DIR, 'loaders', 'valid-source'), {
        basePath: testDir,
      });

      // Create inline content
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules'), { recursive: true });
      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'project-specific.md'),
        `---
name: project-specific
description: Project-specific rule
version: 1.0.0
always_apply: true
---

# Project Specific Rule

This rule is specific to the project.
`
      );

      const projectResult = await loader.load(path.join(testDir, DEFAULT_CONFIG_DIR), {
        basePath: testDir,
      });

      // Merge results
      const merged = mergeLoadResults(fixtureResult, projectResult);

      // Should have rules from both sources
      expect(merged.rules.some((r) => r.frontmatter.name === 'database')).toBe(true);
      expect(merged.rules.some((r) => r.frontmatter.name === 'project-specific')).toBe(true);

      const stats = getLoadResultStats(merged);
      expect(stats.rules).toBe(fixtureResult.rules.length + projectResult.rules.length);
    });

    it('should maintain order when merging (first source takes priority for duplicates)', async () => {
      const loader = createLocalLoader();

      // Create two sources with same-named rule
      await fs.mkdir(path.join(testDir, 'source1', 'rules'), { recursive: true });
      await fs.mkdir(path.join(testDir, 'source2', 'rules'), { recursive: true });

      await fs.writeFile(
        path.join(testDir, 'source1', 'rules', 'shared.md'),
        `---
name: shared
description: From source 1
version: 1.0.0
---
# From Source 1
`
      );

      await fs.writeFile(
        path.join(testDir, 'source2', 'rules', 'shared.md'),
        `---
name: shared
description: From source 2
version: 2.0.0
---
# From Source 2
`
      );

      const result1 = await loader.load(path.join(testDir, 'source1'), { basePath: testDir });
      const result2 = await loader.load(path.join(testDir, 'source2'), { basePath: testDir });

      const merged = mergeLoadResults(result1, result2);

      // Both rules should be present (merging doesn't dedupe)
      const sharedRules = merged.rules.filter((r) => r.frontmatter.name === 'shared');
      expect(sharedRules.length).toBe(2);

      // First one should be from source1
      expect(sharedRules[0].frontmatter.description).toBe('From source 1');
    });
  });

  describe('dry run mode', () => {
    it('should not write files in dry run mode but report them', async () => {
      const loader = createLocalLoader();
      const loadResult = await loader.load(path.join(FIXTURES_DIR, 'loaders', 'valid-source'), {
        basePath: testDir,
      });

      const content = createResolvedContent(loadResult, testDir, 'test-project');

      const generator = createCursorGenerator();
      const result = await generator.generate(content, {
        outputDir: testDir,
        dryRun: true,
      });

      // Should report files
      expect(result.files.length).toBeGreaterThan(0);

      // Files should NOT exist
      expect(await dirExists(path.join(testDir, '.cursor'))).toBe(false);
    });

    it('should include generated content in dry run result', async () => {
      const loader = createLocalLoader();
      const loadResult = await loader.load(path.join(FIXTURES_DIR, 'loaders', 'valid-source'), {
        basePath: testDir,
      });

      const content = createResolvedContent(loadResult, testDir, 'test-project');

      const generator = createCursorGenerator();
      const result = await generator.generate(content, {
        outputDir: testDir,
        dryRun: true,
      });

      // Should have generated array with content
      expect(result.generated).toBeDefined();
      expect(result.generated!.length).toBeGreaterThan(0);

      // Each generated file should have content
      for (const file of result.generated!) {
        expect(file.path).toBeDefined();
        expect(file.content).toBeDefined();
        expect(file.content.length).toBeGreaterThan(0);
      }
    });
  });

  describe('hooks handling', () => {
    it('should handle hooks in claude generator', async () => {
      const loader = createLocalLoader();
      const loadResult = await loader.load(path.join(FIXTURES_DIR, 'loaders', 'valid-source'), {
        basePath: testDir,
      });

      expect(loadResult.hooks.length).toBeGreaterThan(0);

      const content = createResolvedContent(loadResult, testDir);

      const generator = createClaudeGenerator();
      const _result = await generator.generate(content, {
        outputDir: testDir,
      });

      // Should generate settings.json with hooks
      expect(await fileExists(path.join(testDir, '.claude', 'settings.json'))).toBe(true);

      const settingsContent = await readFile(path.join(testDir, '.claude', 'settings.json'));
      expect(settingsContent.ok).toBe(true);

      const settings = JSON.parse(settingsContent.value as string);
      expect(settings.hooks).toBeDefined();
    });

    it('should generate hooks.json for cursor (v1.7+)', async () => {
      // Create a hook that targets cursor
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'hooks'), { recursive: true });
      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'hooks', 'cursor-hook.md'),
        `---
name: cursor-hook
description: Hook that targets cursor
version: 1.0.0
event: PreToolUse
tool_match: "Bash(*)"
targets: [cursor]
---

# Cursor Hook
`
      );

      const loader = createLocalLoader();
      const loadResult = await loader.load(path.join(testDir, DEFAULT_CONFIG_DIR), {
        basePath: testDir,
      });

      // Verify we have hooks that target cursor
      expect(loadResult.hooks.length).toBeGreaterThan(0);
      expect(loadResult.hooks.some((h) => h.frontmatter.targets?.includes('cursor'))).toBe(true);

      const content = createResolvedContent(loadResult, testDir);

      const generator = createCursorGenerator();
      const _result = await generator.generate(content, {
        outputDir: testDir,
      });

      // Should generate .cursor/hooks.json (Cursor v1.7+)
      expect(await fileExists(path.join(testDir, '.cursor', 'hooks.json'))).toBe(true);

      const hooksContent = await readFile(path.join(testDir, '.cursor', 'hooks.json'));
      expect(hooksContent.ok).toBe(true);

      const hooksJson = JSON.parse(hooksContent.value as string);
      expect(hooksJson.version).toBe(1);
      expect(hooksJson.hooks).toBeDefined();
      // PreToolUse maps to beforeShellExecution in Cursor
      expect(hooksJson.hooks.beforeShellExecution).toBeDefined();
    });
  });

  describe('commands handling', () => {
    it('should generate commands for all targets', async () => {
      const loader = createLocalLoader();
      const loadResult = await loader.load(path.join(FIXTURES_DIR, 'loaders', 'valid-source'), {
        basePath: testDir,
      });

      expect(loadResult.commands.length).toBeGreaterThan(0);

      const content = createResolvedContent(loadResult, testDir);

      // Generate for cursor
      await createCursorGenerator().generate(content, { outputDir: testDir });
      expect(await dirExists(path.join(testDir, '.cursor', 'commands'))).toBe(true);

      // Generate for factory
      await createFactoryGenerator().generate(content, { outputDir: testDir });
      expect(await dirExists(path.join(testDir, '.factory', 'commands'))).toBe(true);
    });
  });

  describe('persona transformation', () => {
    it('should transform personas to target-specific format', async () => {
      const loader = createLocalLoader();
      const loadResult = await loader.load(path.join(FIXTURES_DIR, 'loaders', 'valid-source'), {
        basePath: testDir,
      });

      const content = createResolvedContent(loadResult, testDir);

      // Cursor: commands/roles/
      await createCursorGenerator().generate(content, { outputDir: testDir });
      expect(await dirExists(path.join(testDir, '.cursor', 'commands', 'roles'))).toBe(true);

      // Claude: agents/
      await createClaudeGenerator().generate(content, { outputDir: testDir });
      expect(await dirExists(path.join(testDir, '.claude', 'agents'))).toBe(true);

      // Factory: droids/
      await createFactoryGenerator().generate(content, { outputDir: testDir });
      expect(await dirExists(path.join(testDir, '.factory', 'droids'))).toBe(true);
    });
  });
});
