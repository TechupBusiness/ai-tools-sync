/**
 * @file Sync Command Tests
 * @description Tests for the sync CLI command
 *
 * NOTE: These tests write to `.cursor` directories which are blocked by
 * Cursor IDE's sandbox. Run tests from a regular terminal or with full
 * permissions: `npm test -- --run tests/unit/cli/sync.test.ts`
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { sync } from '../../../src/cli/commands/sync.js';
import { dirExists, fileExists, readFile } from '../../../src/utils/fs.js';

// Use a temp directory within the workspace to avoid sandbox issues
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESTS_TMP_DIR = path.resolve(__dirname, '..', '..', '.tmp');

// Mock logger to suppress output during tests
vi.mock('../../../src/utils/logger.js', () => ({
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

// Mock output functions to suppress console output
vi.mock('../../../src/cli/output.js', async () => {
  const actual = await vi.importActual('../../../src/cli/output.js');
  return {
    ...actual,
    printHeader: vi.fn(),
    printSubHeader: vi.fn(),
    printSuccess: vi.fn(),
    printWarning: vi.fn(),
    printError: vi.fn(),
    printNewLine: vi.fn(),
    printSummary: vi.fn(),
    printGeneratedFile: vi.fn(),
    printStats: vi.fn(),
    printKeyValue: vi.fn(),
    printValidationErrors: vi.fn(),
  };
});

describe('Sync Command', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory within the workspace for each test
    testDir = path.join(TESTS_TMP_DIR, `ai-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('missing configuration', () => {
    it('should fail when .ai directory does not exist', async () => {
      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail when config.yaml does not exist', async () => {
      await fs.mkdir(path.join(testDir, '.ai'), { recursive: true });

      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(false);
    });
  });

  describe('basic sync', () => {
    beforeEach(async () => {
      // Create valid .ai structure
      await fs.mkdir(path.join(testDir, '.ai', 'rules'), { recursive: true });
      await fs.mkdir(path.join(testDir, '.ai', 'personas'), { recursive: true });
      await fs.mkdir(path.join(testDir, '.ai', 'commands'), { recursive: true });

      // Create valid config
      const config = `
version: "1.0.0"
project_name: test-project
targets:
  - cursor
  - claude
  - factory
output:
  clean_before_sync: true
  add_do_not_edit_headers: true
`;
      await fs.writeFile(path.join(testDir, '.ai', 'config.yaml'), config);
    });

    it('should sync with no content (empty result)', async () => {
      // Override config to disable default loaders
      const config = `
version: "1.0.0"
project_name: test-project
targets:
  - cursor
  - claude
  - factory
loaders: []
output:
  clean_before_sync: true
  add_do_not_edit_headers: true
`;
      await fs.writeFile(path.join(testDir, '.ai', 'config.yaml'), config);

      const result = await sync({ projectRoot: testDir });

      // Should succeed but generate no files (empty content)
      expect(result.warnings.some(w => w.includes('No content'))).toBe(true);
    });

    it('should sync rules to cursor format', async () => {
      // Add a rule
      const rule = `---
name: core
description: Core project context
version: 1.0.0
always_apply: true
targets: [cursor, claude, factory]
---

# Core Context

This is the core project context.
`;
      await fs.writeFile(path.join(testDir, '.ai', 'rules', 'core.md'), rule);

      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);
      expect(result.filesGenerated).toBeGreaterThan(0);

      // Check Cursor output
      expect(await fileExists(path.join(testDir, '.cursor', 'rules', 'core.mdc'))).toBe(true);
    });

    it('should sync rules to claude format', async () => {
      const rule = `---
name: core
description: Core project context
version: 1.0.0
always_apply: true
targets: [cursor, claude, factory]
---

# Core Context
`;
      await fs.writeFile(path.join(testDir, '.ai', 'rules', 'core.md'), rule);

      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);

      // Check Claude output
      expect(await dirExists(path.join(testDir, '.claude', 'skills', 'core'))).toBe(true);
      expect(await fileExists(path.join(testDir, '.claude', 'skills', 'core', 'SKILL.md'))).toBe(true);
    });

    it('should sync rules to factory format', async () => {
      const rule = `---
name: core
description: Core project context
version: 1.0.0
always_apply: true
targets: [cursor, claude, factory]
---

# Core Context
`;
      await fs.writeFile(path.join(testDir, '.ai', 'rules', 'core.md'), rule);

      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);

      // Check Factory output
      expect(await dirExists(path.join(testDir, '.factory', 'skills', 'core'))).toBe(true);
      expect(await fileExists(path.join(testDir, '.factory', 'skills', 'core', 'SKILL.md'))).toBe(true);
    });

    it('should generate entry point files', async () => {
      const rule = `---
name: core
description: Core context
version: 1.0.0
always_apply: true
---
# Core
`;
      await fs.writeFile(path.join(testDir, '.ai', 'rules', 'core.md'), rule);

      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);

      // Check entry points
      expect(await fileExists(path.join(testDir, 'CLAUDE.md'))).toBe(true);
      expect(await fileExists(path.join(testDir, 'AGENTS.md'))).toBe(true);
    });

    it('should sync personas', async () => {
      const persona = `---
name: architect
description: System architect
version: 1.0.0
tools:
  - read
  - write
---

# The Architect

A system-level thinker.
`;
      await fs.writeFile(path.join(testDir, '.ai', 'personas', 'architect.md'), persona);

      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);

      // Check outputs
      expect(await fileExists(path.join(testDir, '.cursor', 'commands', 'roles', 'architect.md'))).toBe(true);
      expect(await fileExists(path.join(testDir, '.claude', 'agents', 'architect.md'))).toBe(true);
      expect(await fileExists(path.join(testDir, '.factory', 'droids', 'architect.md'))).toBe(true);
    });
  });

  describe('dry run mode', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(testDir, '.ai', 'rules'), { recursive: true });

      const config = `
version: "1.0.0"
targets:
  - cursor
`;
      await fs.writeFile(path.join(testDir, '.ai', 'config.yaml'), config);

      const rule = `---
name: test-rule
description: Test rule
version: 1.0.0
always_apply: true
---
# Test
`;
      await fs.writeFile(path.join(testDir, '.ai', 'rules', 'test.md'), rule);
    });

    it('should not write files in dry run mode', async () => {
      const result = await sync({ projectRoot: testDir, dryRun: true });

      expect(result.success).toBe(true);
      expect(result.filesGenerated).toBeGreaterThan(0);

      // Files should not actually exist
      expect(await fileExists(path.join(testDir, '.cursor', 'rules', 'test-rule.mdc'))).toBe(false);
    });
  });

  describe('target filtering', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(testDir, '.ai', 'rules'), { recursive: true });
    });

    it('should only generate for configured targets', async () => {
      const config = `
version: "1.0.0"
targets:
  - cursor
`;
      await fs.writeFile(path.join(testDir, '.ai', 'config.yaml'), config);

      const rule = `---
name: test
description: Test
version: 1.0.0
always_apply: true
---
# Test
`;
      await fs.writeFile(path.join(testDir, '.ai', 'rules', 'test.md'), rule);

      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);

      // Cursor output should exist
      expect(await dirExists(path.join(testDir, '.cursor'))).toBe(true);

      // Claude and Factory should not exist
      expect(await dirExists(path.join(testDir, '.claude'))).toBe(false);
      expect(await dirExists(path.join(testDir, '.factory'))).toBe(false);
    });

    it('should filter rules by target', async () => {
      const config = `
version: "1.0.0"
targets:
  - cursor
  - claude
`;
      await fs.writeFile(path.join(testDir, '.ai', 'config.yaml'), config);

      // Rule only for cursor
      const cursorRule = `---
name: cursor-only
description: Only for cursor
version: 1.0.0
always_apply: true
targets: [cursor]
---
# Cursor Only
`;
      await fs.writeFile(path.join(testDir, '.ai', 'rules', 'cursor-only.md'), cursorRule);

      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);

      // Should be in cursor
      expect(await fileExists(path.join(testDir, '.cursor', 'rules', 'cursor-only.mdc'))).toBe(true);

      // Should NOT be in claude (rule targets cursor only)
      expect(await fileExists(path.join(testDir, '.claude', 'skills', 'cursor-only', 'SKILL.md'))).toBe(false);
    });
  });

  describe('headers', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(testDir, '.ai', 'rules'), { recursive: true });

      const rule = `---
name: test
description: Test
version: 1.0.0
always_apply: true
---
# Test
`;
      await fs.writeFile(path.join(testDir, '.ai', 'rules', 'test.md'), rule);
    });

    it('should add headers when configured', async () => {
      const config = `
version: "1.0.0"
targets:
  - cursor
output:
  add_do_not_edit_headers: true
`;
      await fs.writeFile(path.join(testDir, '.ai', 'config.yaml'), config);

      await sync({ projectRoot: testDir });

      const content = await readFile(path.join(testDir, '.cursor', 'rules', 'test.mdc'));
      expect(content.ok).toBe(true);
      if (content.ok) {
        expect(content.value).toContain('DO NOT EDIT');
      }
    });

    it('should not add headers when disabled', async () => {
      const config = `
version: "1.0.0"
targets:
  - cursor
output:
  add_do_not_edit_headers: false
`;
      await fs.writeFile(path.join(testDir, '.ai', 'config.yaml'), config);

      await sync({ projectRoot: testDir });

      const content = await readFile(path.join(testDir, '.cursor', 'rules', 'test.mdc'));
      expect(content.ok).toBe(true);
      if (content.ok) {
        expect(content.value).not.toContain('DO NOT EDIT');
      }
    });
  });

  describe('subfolder contexts', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(testDir, '.ai', 'rules'), { recursive: true });

      const config = `
version: "1.0.0"
targets:
  - cursor
  - claude
subfolder_contexts:
  packages/backend:
    rules: [core]
    description: Backend context
`;
      await fs.writeFile(path.join(testDir, '.ai', 'config.yaml'), config);

      const rule = `---
name: core
description: Core context
version: 1.0.0
always_apply: true
---
# Core
`;
      await fs.writeFile(path.join(testDir, '.ai', 'rules', 'core.md'), rule);
    });

    it('should generate subfolder context files', async () => {
      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);

      // Check subfolder CLAUDE.md
      expect(await fileExists(path.join(testDir, 'packages', 'backend', 'CLAUDE.md'))).toBe(true);

      // Check subfolder AGENTS.md
      expect(await fileExists(path.join(testDir, 'packages', 'backend', 'AGENTS.md'))).toBe(true);
    });

    it('should include description in subfolder context', async () => {
      await sync({ projectRoot: testDir });

      const claudeMd = await readFile(path.join(testDir, 'packages', 'backend', 'CLAUDE.md'));
      expect(claudeMd.ok).toBe(true);
      if (claudeMd.ok) {
        expect(claudeMd.value).toContain('Backend context');
      }
    });
  });

  describe('error handling', () => {
    it('should report duration on failure', async () => {
      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(false);
      // Duration may be 0 if failure happens very quickly
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should report duration on success', async () => {
      await fs.mkdir(path.join(testDir, '.ai', 'rules'), { recursive: true });

      const config = `
version: "1.0.0"
targets:
  - cursor
`;
      await fs.writeFile(path.join(testDir, '.ai', 'config.yaml'), config);

      const result = await sync({ projectRoot: testDir });

      expect(result.duration).toBeGreaterThan(0);
    });
  });

  describe('verbose mode', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(testDir, '.ai', 'rules'), { recursive: true });

      const config = `
version: "1.0.0"
targets:
  - cursor
`;
      await fs.writeFile(path.join(testDir, '.ai', 'config.yaml'), config);

      const rule = `---
name: test
description: Test
version: 1.0.0
always_apply: true
---
# Test
`;
      await fs.writeFile(path.join(testDir, '.ai', 'rules', 'test.md'), rule);
    });

    it('should work with verbose flag', async () => {
      const result = await sync({ projectRoot: testDir, verbose: true });

      expect(result.success).toBe(true);
    });
  });
});

