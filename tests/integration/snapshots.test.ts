/**
 * @file Snapshot Tests for Generated Outputs
 * @description Tests that verify generated outputs match expected formats
 *
 * These tests use snapshots to verify that the generated output format
 * is correct and consistent across different generators.
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createLocalLoader } from '../../src/loaders/local.js';
import {
  createCursorGenerator,
  createClaudeGenerator,
  createFactoryGenerator,
} from '../../src/generators/index.js';
import { createResolvedContent } from '../../src/generators/base.js';
import { readFile } from '../../src/utils/fs.js';

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

describe('Output Snapshots', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(
      TESTS_TMP_DIR,
      `snapshot-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  /**
   * Helper to create test content
   */
  async function createTestContent() {
    await fs.mkdir(path.join(testDir, '.ai', 'rules'), { recursive: true });
    await fs.mkdir(path.join(testDir, '.ai', 'personas'), { recursive: true });
    await fs.mkdir(path.join(testDir, '.ai', 'commands'), { recursive: true });
    await fs.mkdir(path.join(testDir, '.ai', 'hooks'), { recursive: true });

    // Create a comprehensive rule
    await fs.writeFile(
      path.join(testDir, '.ai', 'rules', 'database.md'),
      `---
name: database
description: Database rules for SQL and migrations
version: 1.0.0
always_apply: false
globs:
  - "**/*.sql"
  - "db/**/*"
targets:
  - cursor
  - claude
  - factory
category: infrastructure
priority: high
---

# Database Rules

Always validate SQL migrations before applying.

## Guidelines

1. Use transactions for all schema changes
2. Include rollback migrations
3. Test on staging before production

## Examples

\`\`\`sql
BEGIN;
ALTER TABLE users ADD COLUMN email VARCHAR(255);
COMMIT;
\`\`\`
`
    );

    // Create always-apply rule
    await fs.writeFile(
      path.join(testDir, '.ai', 'rules', 'core.md'),
      `---
name: core
description: Core project context that applies to all files
version: 1.0.0
always_apply: true
---

# Core Context

This is the core project context.
`
    );

    // Create persona
    await fs.writeFile(
      path.join(testDir, '.ai', 'personas', 'architect.md'),
      `---
name: architect
description: System architect for high-level design
version: 1.0.0
tools:
  - read
  - search
  - glob
model: default
targets:
  - cursor
  - claude
  - factory
---

# The Architect

You are a system architect focused on high-level design decisions.

## Responsibilities

- Design system architecture
- Review technical decisions
- Ensure scalability and maintainability
`
    );

    // Create command
    await fs.writeFile(
      path.join(testDir, '.ai', 'commands', 'deploy.md'),
      `---
name: deploy
description: Deploy application to production
version: 1.0.0
execute: scripts/deploy.sh
args:
  - name: environment
    type: string
    default: staging
    choices: [staging, production]
targets:
  - cursor
  - claude
  - factory
---

# Deploy Command

Deploys the application to the specified environment.

## Usage

Run this command to deploy the application.
`
    );

    // Create hook (Claude only)
    await fs.writeFile(
      path.join(testDir, '.ai', 'hooks', 'pre-commit.md'),
      `---
name: pre-commit
description: Run checks before committing
version: 1.0.0
event: PreToolUse
tool_match: "Bash(git commit*)"
targets: [claude]
---

# Pre-commit Hook

Runs linting and type checking before commits.
`
    );

    const loader = createLocalLoader();
    const loadResult = await loader.load(path.join(testDir, '.ai'), { basePath: testDir });
    return createResolvedContent(loadResult, testDir, 'snapshot-test-project');
  }

  describe('Cursor .mdc snapshots', () => {
    it('should match cursor rule with globs snapshot', async () => {
      const content = await createTestContent();
      const generator = createCursorGenerator();

      await generator.generate(content, {
        outputDir: testDir,
        addHeaders: true,
      });

      const result = await readFile(path.join(testDir, '.cursor', 'rules', 'database.mdc'));
      expect(result.ok).toBe(true);

      // Verify structure matches expected Cursor format
      expect(result.value).toMatchSnapshot('cursor-rule-with-globs');
    });

    it('should match cursor always-apply rule snapshot', async () => {
      const content = await createTestContent();
      const generator = createCursorGenerator();

      await generator.generate(content, {
        outputDir: testDir,
        addHeaders: true,
      });

      const result = await readFile(path.join(testDir, '.cursor', 'rules', 'core.mdc'));
      expect(result.ok).toBe(true);

      // Verify always_apply is converted to alwaysApply
      expect(result.value).toContain('alwaysApply: true');
      expect(result.value).toMatchSnapshot('cursor-always-apply-rule');
    });

    it('should match cursor persona (role) snapshot', async () => {
      const content = await createTestContent();
      const generator = createCursorGenerator();

      await generator.generate(content, {
        outputDir: testDir,
        addHeaders: true,
      });

      const result = await readFile(
        path.join(testDir, '.cursor', 'commands', 'roles', 'architect.md')
      );
      expect(result.ok).toBe(true);
      expect(result.value).toMatchSnapshot('cursor-persona-role');
    });

    it('should match cursor command snapshot', async () => {
      const content = await createTestContent();
      const generator = createCursorGenerator();

      await generator.generate(content, {
        outputDir: testDir,
        addHeaders: true,
      });

      const result = await readFile(path.join(testDir, '.cursor', 'commands', 'deploy.md'));
      expect(result.ok).toBe(true);
      expect(result.value).toMatchSnapshot('cursor-command');
    });
  });

  describe('Claude SKILL.md snapshots', () => {
    it('should match claude skill snapshot', async () => {
      const content = await createTestContent();
      const generator = createClaudeGenerator();

      await generator.generate(content, {
        outputDir: testDir,
        addHeaders: true,
      });

      const result = await readFile(
        path.join(testDir, '.claude', 'skills', 'database', 'SKILL.md')
      );
      expect(result.ok).toBe(true);
      expect(result.value).toMatchSnapshot('claude-skill');
    });

    it('should match claude agent snapshot', async () => {
      const content = await createTestContent();
      const generator = createClaudeGenerator();

      await generator.generate(content, {
        outputDir: testDir,
        addHeaders: true,
      });

      const result = await readFile(path.join(testDir, '.claude', 'agents', 'architect.md'));
      expect(result.ok).toBe(true);
      expect(result.value).toMatchSnapshot('claude-agent');
    });

    it('should match claude settings.json snapshot', async () => {
      const content = await createTestContent();
      const generator = createClaudeGenerator();

      await generator.generate(content, {
        outputDir: testDir,
        addHeaders: true,
      });

      const result = await readFile(path.join(testDir, '.claude', 'settings.json'));
      expect(result.ok).toBe(true);

      // Parse and re-stringify for consistent formatting
      const settings = JSON.parse(result.value as string);
      expect(settings).toMatchSnapshot('claude-settings-json');
    });
  });

  describe('Factory snapshots', () => {
    it('should match factory skill snapshot', async () => {
      const content = await createTestContent();
      const generator = createFactoryGenerator();

      await generator.generate(content, {
        outputDir: testDir,
        addHeaders: true,
      });

      const result = await readFile(
        path.join(testDir, '.factory', 'skills', 'database', 'SKILL.md')
      );
      expect(result.ok).toBe(true);
      expect(result.value).toMatchSnapshot('factory-skill');
    });

    it('should match factory droid snapshot', async () => {
      const content = await createTestContent();
      const generator = createFactoryGenerator();

      await generator.generate(content, {
        outputDir: testDir,
        addHeaders: true,
      });

      const result = await readFile(path.join(testDir, '.factory', 'droids', 'architect.md'));
      expect(result.ok).toBe(true);
      expect(result.value).toMatchSnapshot('factory-droid');
    });

    it('should match factory command snapshot', async () => {
      const content = await createTestContent();
      const generator = createFactoryGenerator();

      await generator.generate(content, {
        outputDir: testDir,
        addHeaders: true,
      });

      const result = await readFile(path.join(testDir, '.factory', 'commands', 'deploy.md'));
      expect(result.ok).toBe(true);
      expect(result.value).toMatchSnapshot('factory-command');
    });
  });

  describe('Entry point snapshots', () => {
    it('should match CLAUDE.md snapshot', async () => {
      const content = await createTestContent();
      const generator = createClaudeGenerator();

      await generator.generate(content, {
        outputDir: testDir,
        addHeaders: true,
      });

      const result = await readFile(path.join(testDir, 'CLAUDE.md'));
      expect(result.ok).toBe(true);
      expect(result.value).toMatchSnapshot('claude-md-entrypoint');
    });

    it('should match AGENTS.md snapshot (from Factory)', async () => {
      const content = await createTestContent();
      const generator = createFactoryGenerator();

      await generator.generate(content, {
        outputDir: testDir,
        addHeaders: true,
      });

      const result = await readFile(path.join(testDir, 'AGENTS.md'));
      expect(result.ok).toBe(true);
      expect(result.value).toMatchSnapshot('agents-md-entrypoint');
    });

    it('should match AGENTS.md snapshot (from Cursor)', async () => {
      const content = await createTestContent();
      const generator = createCursorGenerator();

      await generator.generate(content, {
        outputDir: testDir,
        addHeaders: true,
      });

      const result = await readFile(path.join(testDir, 'AGENTS.md'));
      expect(result.ok).toBe(true);
      expect(result.value).toMatchSnapshot('agents-md-entrypoint-cursor');
    });
  });

  describe('Content without headers', () => {
    it('should generate clean output without headers', async () => {
      const content = await createTestContent();
      const generator = createCursorGenerator();

      await generator.generate(content, {
        outputDir: testDir,
        addHeaders: false,
      });

      const result = await readFile(path.join(testDir, '.cursor', 'rules', 'database.mdc'));
      expect(result.ok).toBe(true);

      // Should NOT contain DO NOT EDIT header
      expect(result.value).not.toContain('DO NOT EDIT');
      expect(result.value).toMatchSnapshot('cursor-rule-no-header');
    });
  });

  describe('Dry run generated content', () => {
    it('should include complete generated content in dry run', async () => {
      const content = await createTestContent();
      const generator = createCursorGenerator();

      const result = await generator.generate(content, {
        outputDir: testDir,
        addHeaders: true,
        dryRun: true,
      });

      expect(result.generated).toBeDefined();
      expect(result.generated!.length).toBeGreaterThan(0);

      // Find the database rule in generated content
      const dbRule = result.generated!.find((g) => g.path.includes('database'));
      expect(dbRule).toBeDefined();
      expect(dbRule!.content).toMatchSnapshot('dry-run-cursor-rule');
    });
  });
});

