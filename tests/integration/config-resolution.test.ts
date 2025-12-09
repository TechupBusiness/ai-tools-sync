/**
 * @file Config Resolution Integration Tests
 * @description Tests for config loading, rule resolution, and content filtering
 *
 * These tests verify that configuration is properly loaded, rules are correctly
 * resolved and filtered, and the sync pipeline respects configuration settings.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { loadConfig, getAiPaths, DEFAULT_CONFIG_DIR } from '../../src/config/loader.js';
import { createResolvedContent, filterContentByTarget } from '../../src/generators/base.js';
import { createCursorGenerator } from '../../src/generators/cursor.js';
import { createLocalLoader } from '../../src/loaders/local.js';
import { fileExists, readFile } from '../../src/utils/fs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

describe('Config Resolution Integration', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(
      TESTS_TMP_DIR,
      `config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  describe('config loading', () => {
    it('should load config and provide resolved paths', async () => {
      // Setup
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR), { recursive: true });
      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'),
        `
version: "1.0.0"
project_name: test-project
targets:
  - cursor
  - claude
`
      );

      const result = await loadConfig({ projectRoot: testDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.project_name).toBe('test-project');
        expect(result.value.targets).toEqual(['cursor', 'claude']);
        expect(result.value.projectRoot).toBe(testDir);
      }
    });

    it('should apply default values for missing config options', async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR), { recursive: true });
      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'),
        `
version: "1.0.0"
`
      );

      const result = await loadConfig({ projectRoot: testDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should have default targets
        expect(result.value.targets).toEqual(['cursor', 'claude', 'factory']);
        // Should have default output settings
        expect(result.value.output?.clean_before_sync).toBe(true);
        expect(result.value.output?.add_do_not_edit_headers).toBe(true);
      }
    });

    it('should resolve project root correctly', async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR), { recursive: true });
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'), `version: "1.0.0"`);

      const result = await loadConfig({ projectRoot: testDir });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const paths = getAiPaths(result.value.projectRoot);
        expect(paths.aiDir).toBe(path.join(testDir, DEFAULT_CONFIG_DIR));
        // configPath is in the resolved config, not getAiPaths
        expect(result.value.configPath).toBe(path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'));
      }
    });
  });

  describe('rules resolution', () => {
    it('should load rules from .ai/rules directory', async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules'), { recursive: true });
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'), `version: "1.0.0"`);

      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'core.md'),
        `---
name: core
description: Core rules
version: 1.0.0
always_apply: true
---

# Core Rules

Important core rules.
`
      );

      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'testing.md'),
        `---
name: testing
description: Testing rules
version: 1.0.0
always_apply: false
globs:
  - "**/*.test.ts"
---

# Testing Rules

Rules for tests.
`
      );

      const loader = createLocalLoader();
      const loadResult = await loader.load(path.join(testDir, DEFAULT_CONFIG_DIR), {
        basePath: testDir,
      });

      expect(loadResult.rules.length).toBe(2);
      expect(loadResult.rules.some((r) => r.frontmatter.name === 'core')).toBe(true);
      expect(loadResult.rules.some((r) => r.frontmatter.name === 'testing')).toBe(true);
    });

    it('should load nested rules from subdirectories', async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'domain'), {
        recursive: true,
      });
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'), `version: "1.0.0"`);

      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'domain', 'core.md'),
        `---
name: domain-core
description: Domain core rules
version: 1.0.0
---

# Domain Core
`
      );

      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'domain', 'testing.md'),
        `---
name: domain-testing
description: Domain testing rules
version: 1.0.0
---

# Domain Testing
`
      );

      const loader = createLocalLoader();
      const loadResult = await loader.load(path.join(testDir, DEFAULT_CONFIG_DIR), {
        basePath: testDir,
      });

      expect(loadResult.rules.length).toBe(2);
      expect(loadResult.rules.some((r) => r.frontmatter.name === 'domain-core')).toBe(true);
      expect(loadResult.rules.some((r) => r.frontmatter.name === 'domain-testing')).toBe(true);
    });
  });

  describe('target filtering in config', () => {
    it('should only generate for targets specified in config', async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules'), { recursive: true });
      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'),
        `
version: "1.0.0"
targets:
  - cursor
`
      );

      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'test.md'),
        `---
name: test
description: Test rule
version: 1.0.0
always_apply: true
---

# Test
`
      );

      const result = await loadConfig({ projectRoot: testDir });
      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.value.targets).toEqual(['cursor']);
      }
    });

    it('should filter rules by their target specification', async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules'), { recursive: true });
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'), `version: "1.0.0"`);

      // Rule only for cursor
      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'cursor-specific.md'),
        `---
name: cursor-specific
description: Only for cursor
version: 1.0.0
targets: [cursor]
---

# Cursor Specific
`
      );

      // Rule only for claude
      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'claude-specific.md'),
        `---
name: claude-specific
description: Only for claude
version: 1.0.0
targets: [claude]
---

# Claude Specific
`
      );

      const loader = createLocalLoader();
      const loadResult = await loader.load(path.join(testDir, DEFAULT_CONFIG_DIR), {
        basePath: testDir,
      });

      const content = createResolvedContent(loadResult, testDir);

      // Filter for cursor
      const cursorContent = filterContentByTarget(content, 'cursor');
      expect(cursorContent.rules.some((r) => r.frontmatter.name === 'cursor-specific')).toBe(true);
      expect(cursorContent.rules.some((r) => r.frontmatter.name === 'claude-specific')).toBe(false);

      // Filter for claude
      const claudeContent = filterContentByTarget(content, 'claude');
      expect(claudeContent.rules.some((r) => r.frontmatter.name === 'cursor-specific')).toBe(false);
      expect(claudeContent.rules.some((r) => r.frontmatter.name === 'claude-specific')).toBe(true);
    });
  });

  describe('use config filtering', () => {
    it('should filter personas by use.personas config', async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'personas'), { recursive: true });
      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'),
        `
version: "1.0.0"
use:
  personas:
    - architect
`
      );

      // Create two personas
      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'personas', 'architect.md'),
        `---
name: architect
description: System architect
version: 1.0.0
---

# Architect
`
      );

      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'personas', 'implementer.md'),
        `---
name: implementer
description: Code implementer
version: 1.0.0
---

# Implementer
`
      );

      const configResult = await loadConfig({ projectRoot: testDir });
      expect(configResult.ok).toBe(true);

      if (configResult.ok) {
        expect(configResult.value.use?.personas).toEqual(['architect']);
      }
    });

    it('should filter commands by use.commands config', async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'commands'), { recursive: true });
      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'),
        `
version: "1.0.0"
use:
  commands:
    - deploy
`
      );

      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'commands', 'deploy.md'),
        `---
name: deploy
description: Deploy command
version: 1.0.0
---

# Deploy
`
      );

      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'commands', 'test.md'),
        `---
name: test
description: Test command
version: 1.0.0
---

# Test
`
      );

      const configResult = await loadConfig({ projectRoot: testDir });
      expect(configResult.ok).toBe(true);

      if (configResult.ok) {
        expect(configResult.value.use?.commands).toEqual(['deploy']);
      }
    });
  });

  describe('subfolder contexts', () => {
    it('should parse subfolder_contexts from config', async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR), { recursive: true });
      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'),
        `
version: "1.0.0"
subfolder_contexts:
  packages/backend:
    rules: [core, database]
    personas: [implementer]
    description: Backend package context
  apps/web:
    rules: [core, frontend]
    description: Web app context
`
      );

      const result = await loadConfig({ projectRoot: testDir });
      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.value.subfolder_contexts).toBeDefined();
        expect(Object.keys(result.value.subfolder_contexts!)).toHaveLength(2);
        expect(result.value.subfolder_contexts!['packages/backend']).toEqual({
          rules: ['core', 'database'],
          personas: ['implementer'],
          description: 'Backend package context',
        });
        expect(result.value.subfolder_contexts!['apps/web']).toEqual({
          rules: ['core', 'frontend'],
          description: 'Web app context',
        });
      }
    });
  });

  describe('output settings', () => {
    it('should respect clean_before_sync setting', async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules'), { recursive: true });
      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'),
        `
version: "1.0.0"
output:
  clean_before_sync: false
`
      );

      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'test.md'),
        `---
name: test
description: Test
version: 1.0.0
---
# Test
`
      );

      // Create a pre-existing file
      await fs.mkdir(path.join(testDir, '.cursor', 'rules'), { recursive: true });
      await fs.writeFile(
        path.join(testDir, '.cursor', 'rules', 'existing.mdc'),
        `---
description: Existing file
---
# Existing
`
      );

      const configResult = await loadConfig({ projectRoot: testDir });
      expect(configResult.ok).toBe(true);

      if (configResult.ok) {
        const loader = createLocalLoader();
        const loadResult = await loader.load(path.join(testDir, DEFAULT_CONFIG_DIR), {
          basePath: testDir,
        });

        const content = createResolvedContent(loadResult, testDir);
        const generator = createCursorGenerator();

        await generator.generate(content, {
          outputDir: testDir,
          clean: configResult.value.output?.clean_before_sync ?? true,
        });

        // Both files should exist when clean is false
        expect(await fileExists(path.join(testDir, '.cursor', 'rules', 'test.mdc'))).toBe(true);
        expect(await fileExists(path.join(testDir, '.cursor', 'rules', 'existing.mdc'))).toBe(true);
      }
    });

    it('should respect add_do_not_edit_headers setting', async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules'), { recursive: true });
      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'),
        `
version: "1.0.0"
output:
  add_do_not_edit_headers: false
`
      );

      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'test.md'),
        `---
name: test
description: Test
version: 1.0.0
---
# Test
`
      );

      const configResult = await loadConfig({ projectRoot: testDir });
      expect(configResult.ok).toBe(true);

      if (configResult.ok) {
        const loader = createLocalLoader();
        const loadResult = await loader.load(path.join(testDir, DEFAULT_CONFIG_DIR), {
          basePath: testDir,
        });

        const content = createResolvedContent(loadResult, testDir);
        const generator = createCursorGenerator();

        await generator.generate(content, {
          outputDir: testDir,
          addHeaders: configResult.value.output?.add_do_not_edit_headers ?? true,
        });

        const fileContent = await readFile(path.join(testDir, '.cursor', 'rules', 'test.mdc'));
        expect(fileContent.ok).toBe(true);
        expect(fileContent.value).not.toContain('DO NOT EDIT');
      }
    });
  });

  describe('loaders configuration', () => {
    it('should parse loaders from config', async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR), { recursive: true });
      await fs.writeFile(
        path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'),
        `
version: "1.0.0"
loaders:
  - type: ai-tool-sync
  - type: local
    source: ../shared-rules/
`
      );

      const result = await loadConfig({ projectRoot: testDir });
      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.value.loaders).toBeDefined();
        expect(result.value.loaders!.length).toBe(2);
        expect(result.value.loaders![0].type).toBe('ai-tool-sync');
        expect(result.value.loaders![1].type).toBe('local');
        expect(result.value.loaders![1].source).toBe('../shared-rules/');
      }
    });
  });
});
