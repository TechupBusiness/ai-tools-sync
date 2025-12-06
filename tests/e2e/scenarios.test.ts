/**
 * @file E2E Scenario Tests
 * @description End-to-end tests for realistic project scenarios
 *
 * These tests verify that ai-tool-sync works correctly in real-world project
 * structures: Node.js projects, Python projects, monorepos, and various
 * configuration scenarios.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { sync } from '../../src/cli/commands/sync.js';
import { fileExists, dirExists, readFile } from '../../src/utils/fs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESTS_TMP_DIR = path.resolve(__dirname, '..', '.tmp');
const DEFAULTS_DIR = path.resolve(__dirname, '..', '..', 'defaults');

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

// Mock output functions to suppress console output
vi.mock('../../src/cli/output.js', async () => {
  const actual = await vi.importActual('../../src/cli/output.js');
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

describe('E2E Scenarios', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(
      TESTS_TMP_DIR,
      `e2e-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  describe('Node.js Project Scenario', () => {
    beforeEach(async () => {
      // Create typical Node.js project structure
      await fs.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify(
          {
            name: 'my-nodejs-project',
            version: '1.0.0',
            type: 'module',
          },
          null,
          2
        )
      );

      // Create src directory
      await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(testDir, 'src', 'index.ts'), 'export const app = {};');

      // Create tests directory
      await fs.mkdir(path.join(testDir, 'tests'), { recursive: true });

      // Create .ai configuration
      await fs.mkdir(path.join(testDir, '.ai', 'rules'), { recursive: true });
      await fs.mkdir(path.join(testDir, '.ai', 'personas'), { recursive: true });

      await fs.writeFile(
        path.join(testDir, '.ai', 'config.yaml'),
        `
version: "1.0.0"
project_name: my-nodejs-project
targets:
  - cursor
  - claude
  - factory
output:
  clean_before_sync: true
  add_do_not_edit_headers: true
`
      );

      // Create project-specific rules
      await fs.writeFile(
        path.join(testDir, '.ai', 'rules', '_core.md'),
        `---
name: _core
description: Core project context
version: 1.0.0
always_apply: true
---

# My Node.js Project

This is a TypeScript Node.js application.

## Technology Stack

- Node.js 20+
- TypeScript 5+
- ESM modules
`
      );

      await fs.writeFile(
        path.join(testDir, '.ai', 'rules', 'testing.md'),
        `---
name: testing
description: Testing guidelines
version: 1.0.0
always_apply: false
globs:
  - "**/*.test.ts"
  - "tests/**"
---

# Testing Guidelines

Use Vitest for unit tests.
`
      );
    });

    it('should generate all target outputs for Node.js project', async () => {
      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);
      expect(result.filesGenerated).toBeGreaterThan(0);

      // Cursor output
      // Note: _core becomes 'core' after toSafeFilename strips the underscore
      expect(await dirExists(path.join(testDir, '.cursor', 'rules'))).toBe(true);
      expect(await fileExists(path.join(testDir, '.cursor', 'rules', 'core.mdc'))).toBe(true);
      expect(await fileExists(path.join(testDir, '.cursor', 'rules', 'testing.mdc'))).toBe(true);

      // Claude output
      expect(await dirExists(path.join(testDir, '.claude', 'skills'))).toBe(true);
      expect(await fileExists(path.join(testDir, 'CLAUDE.md'))).toBe(true);

      // Factory output
      expect(await dirExists(path.join(testDir, '.factory', 'skills'))).toBe(true);
      expect(await fileExists(path.join(testDir, 'AGENTS.md'))).toBe(true);
    });

    it('should include project name in entry points', async () => {
      await sync({ projectRoot: testDir });

      const claudeMd = await readFile(path.join(testDir, 'CLAUDE.md'));
      expect(claudeMd.ok).toBe(true);
      expect(claudeMd.value).toContain('my-nodejs-project');

      const agentsMd = await readFile(path.join(testDir, 'AGENTS.md'));
      expect(agentsMd.ok).toBe(true);
      expect(agentsMd.value).toContain('my-nodejs-project');
    });

    it('should generate cursor rules with correct frontmatter', async () => {
      await sync({ projectRoot: testDir });

      // Note: _core becomes 'core' after toSafeFilename strips the underscore
      const coreRule = await readFile(path.join(testDir, '.cursor', 'rules', 'core.mdc'));
      expect(coreRule.ok).toBe(true);
      expect(coreRule.value).toContain('alwaysApply: true');

      const testingRule = await readFile(path.join(testDir, '.cursor', 'rules', 'testing.mdc'));
      expect(testingRule.ok).toBe(true);
      expect(testingRule.value).toContain('alwaysApply: false');
      expect(testingRule.value).toContain('globs:');
    });
  });

  describe('Minimal Config Scenario', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(testDir, '.ai', 'rules'), { recursive: true });

      // Minimal config with just version
      await fs.writeFile(
        path.join(testDir, '.ai', 'config.yaml'),
        `version: "1.0.0"`
      );

      await fs.writeFile(
        path.join(testDir, '.ai', 'rules', 'core.md'),
        `---
name: core
description: Core rules
version: 1.0.0
---

# Core

Basic rules.
`
      );
    });

    it('should work with minimal configuration', async () => {
      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);
      expect(result.filesGenerated).toBeGreaterThan(0);

      // Should generate for all default targets
      expect(await dirExists(path.join(testDir, '.cursor'))).toBe(true);
      expect(await dirExists(path.join(testDir, '.claude'))).toBe(true);
      expect(await dirExists(path.join(testDir, '.factory'))).toBe(true);
    });
  });

  describe('Full Config Scenario', () => {
    beforeEach(async () => {
      // Create comprehensive .ai structure
      await fs.mkdir(path.join(testDir, '.ai', 'rules', 'domain'), { recursive: true });
      await fs.mkdir(path.join(testDir, '.ai', 'personas'), { recursive: true });
      await fs.mkdir(path.join(testDir, '.ai', 'commands'), { recursive: true });
      await fs.mkdir(path.join(testDir, '.ai', 'hooks'), { recursive: true });

      // Full config with all options
      await fs.writeFile(
        path.join(testDir, '.ai', 'config.yaml'),
        `
version: "1.0.0"
project_name: full-config-project

targets:
  - cursor
  - claude
  - factory

use:
  personas:
    - architect
    - implementer

loaders:
  - type: ai-tool-sync

subfolder_contexts:
  packages/core:
    rules: [_core, domain-core]
    personas: [implementer]
    description: Core package context

output:
  clean_before_sync: true
  add_do_not_edit_headers: true
`
      );

      // Create rules
      await fs.writeFile(
        path.join(testDir, '.ai', 'rules', '_core.md'),
        `---
name: _core
description: Core context
version: 1.0.0
always_apply: true
---

# Core Context
`
      );

      await fs.writeFile(
        path.join(testDir, '.ai', 'rules', 'domain', 'core.md'),
        `---
name: domain-core
description: Domain core rules
version: 1.0.0
always_apply: false
globs:
  - "packages/core/**"
---

# Domain Core
`
      );

      // Create personas
      await fs.writeFile(
        path.join(testDir, '.ai', 'personas', 'architect.md'),
        `---
name: architect
description: System architect
version: 1.0.0
tools:
  - read
  - search
---

# The Architect
`
      );

      await fs.writeFile(
        path.join(testDir, '.ai', 'personas', 'implementer.md'),
        `---
name: implementer
description: Code implementer
version: 1.0.0
tools:
  - read
  - write
  - edit
---

# The Implementer
`
      );

      // Create commands
      await fs.writeFile(
        path.join(testDir, '.ai', 'commands', 'deploy.md'),
        `---
name: deploy
description: Deploy application
version: 1.0.0
execute: scripts/deploy.sh
---

# Deploy Command
`
      );

      // Create hooks
      await fs.writeFile(
        path.join(testDir, '.ai', 'hooks', 'pre-commit.md'),
        `---
name: pre-commit
description: Pre-commit checks
version: 1.0.0
event: PreToolUse
tool_match: "Bash(git commit*)"
targets: [claude]
---

# Pre-commit Hook
`
      );
    });

    it('should generate all content types', async () => {
      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);
      expect(result.filesGenerated).toBeGreaterThan(5);

      // Rules (note: _core becomes 'core' after toSafeFilename)
      expect(await fileExists(path.join(testDir, '.cursor', 'rules', 'core.mdc'))).toBe(true);

      // Personas -> roles (Cursor), agents (Claude), droids (Factory)
      expect(
        await fileExists(path.join(testDir, '.cursor', 'commands', 'roles', 'architect.md'))
      ).toBe(true);
      expect(await fileExists(path.join(testDir, '.claude', 'agents', 'architect.md'))).toBe(true);
      expect(await fileExists(path.join(testDir, '.factory', 'droids', 'architect.md'))).toBe(true);

      // Commands
      expect(await fileExists(path.join(testDir, '.cursor', 'commands', 'deploy.md'))).toBe(true);
      expect(await fileExists(path.join(testDir, '.factory', 'commands', 'deploy.md'))).toBe(true);

      // Hooks (Claude only)
      expect(await fileExists(path.join(testDir, '.claude', 'settings.json'))).toBe(true);
    });

    it('should generate subfolder contexts', async () => {
      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);

      // Check subfolder CLAUDE.md
      expect(await fileExists(path.join(testDir, 'packages', 'core', 'CLAUDE.md'))).toBe(true);

      // Check subfolder AGENTS.md
      expect(await fileExists(path.join(testDir, 'packages', 'core', 'AGENTS.md'))).toBe(true);

      // Verify subfolder content includes description
      const claudeMd = await readFile(path.join(testDir, 'packages', 'core', 'CLAUDE.md'));
      expect(claudeMd.ok).toBe(true);
      expect(claudeMd.value).toContain('Core package context');
    });

    it('should filter personas by use config', async () => {
      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);

      // Only architect and implementer should be generated (from use.personas)
      expect(
        await fileExists(path.join(testDir, '.cursor', 'commands', 'roles', 'architect.md'))
      ).toBe(true);
      expect(
        await fileExists(path.join(testDir, '.cursor', 'commands', 'roles', 'implementer.md'))
      ).toBe(true);
    });
  });

  describe('Monorepo Structure Scenario', () => {
    beforeEach(async () => {
      // Create monorepo structure
      await fs.mkdir(path.join(testDir, 'packages', 'backend', 'src'), { recursive: true });
      await fs.mkdir(path.join(testDir, 'packages', 'frontend', 'src'), { recursive: true });
      await fs.mkdir(path.join(testDir, 'apps', 'web', 'src'), { recursive: true });

      // Root .ai configuration
      await fs.mkdir(path.join(testDir, '.ai', 'rules'), { recursive: true });

      await fs.writeFile(
        path.join(testDir, '.ai', 'config.yaml'),
        `
version: "1.0.0"
project_name: my-monorepo
targets:
  - cursor
  - claude

subfolder_contexts:
  packages/backend:
    rules: [core, backend]
    description: Backend package
  packages/frontend:
    rules: [core, frontend]
    description: Frontend package
  apps/web:
    rules: [core, frontend]
    description: Web application
`
      );

      await fs.writeFile(
        path.join(testDir, '.ai', 'rules', 'core.md'),
        `---
name: core
description: Core shared rules
version: 1.0.0
always_apply: true
---

# Core Rules

Shared across all packages.
`
      );

      await fs.writeFile(
        path.join(testDir, '.ai', 'rules', 'backend.md'),
        `---
name: backend
description: Backend rules
version: 1.0.0
globs:
  - "packages/backend/**"
---

# Backend Rules

Node.js backend guidelines.
`
      );

      await fs.writeFile(
        path.join(testDir, '.ai', 'rules', 'frontend.md'),
        `---
name: frontend
description: Frontend rules
version: 1.0.0
globs:
  - "packages/frontend/**"
  - "apps/web/**"
---

# Frontend Rules

React frontend guidelines.
`
      );
    });

    it('should generate root and subfolder contexts for monorepo', async () => {
      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);

      // Root outputs
      expect(await fileExists(path.join(testDir, 'CLAUDE.md'))).toBe(true);
      expect(await dirExists(path.join(testDir, '.cursor', 'rules'))).toBe(true);

      // Backend subfolder
      expect(await fileExists(path.join(testDir, 'packages', 'backend', 'CLAUDE.md'))).toBe(true);
      expect(await fileExists(path.join(testDir, 'packages', 'backend', 'AGENTS.md'))).toBe(true);

      // Frontend subfolder
      expect(await fileExists(path.join(testDir, 'packages', 'frontend', 'CLAUDE.md'))).toBe(true);

      // Apps/web subfolder
      expect(await fileExists(path.join(testDir, 'apps', 'web', 'CLAUDE.md'))).toBe(true);
    });

    it('should include correct rules in each subfolder context', async () => {
      await sync({ projectRoot: testDir });

      // Backend should have core and backend rules
      const backendClaude = await readFile(
        path.join(testDir, 'packages', 'backend', 'CLAUDE.md')
      );
      expect(backendClaude.ok).toBe(true);
      expect(backendClaude.value).toContain('Backend package');

      // Frontend should have core and frontend rules
      const frontendClaude = await readFile(
        path.join(testDir, 'packages', 'frontend', 'CLAUDE.md')
      );
      expect(frontendClaude.ok).toBe(true);
      expect(frontendClaude.value).toContain('Frontend package');
    });
  });

  describe('Empty Project Scenario', () => {
    it('should handle empty .ai directory gracefully', async () => {
      await fs.mkdir(path.join(testDir, '.ai'), { recursive: true });
      // Explicitly set loaders to empty to avoid loading ai-tool-sync defaults
      await fs.writeFile(
        path.join(testDir, '.ai', 'config.yaml'),
        `version: "1.0.0"
loaders: []`
      );

      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes('No content'))).toBe(true);
    });
  });

  describe('Single Target Scenario', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(testDir, '.ai', 'rules'), { recursive: true });

      await fs.writeFile(
        path.join(testDir, '.ai', 'config.yaml'),
        `
version: "1.0.0"
targets:
  - cursor
`
      );

      await fs.writeFile(
        path.join(testDir, '.ai', 'rules', 'test.md'),
        `---
name: test
description: Test rule
version: 1.0.0
always_apply: true
---

# Test
`
      );
    });

    it('should only generate for specified target', async () => {
      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(true);

      // Cursor should exist
      expect(await dirExists(path.join(testDir, '.cursor'))).toBe(true);

      // Claude and Factory should not exist
      expect(await dirExists(path.join(testDir, '.claude'))).toBe(false);
      expect(await dirExists(path.join(testDir, '.factory'))).toBe(false);
    });
  });

  describe('Error Handling Scenarios', () => {
    it('should fail gracefully when config is invalid', async () => {
      await fs.mkdir(path.join(testDir, '.ai'), { recursive: true });
      await fs.writeFile(
        path.join(testDir, '.ai', 'config.yaml'),
        `
invalid: yaml: structure
  - this is not valid
`
      );

      const result = await sync({ projectRoot: testDir });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should continue on rule parse errors and report them', async () => {
      await fs.mkdir(path.join(testDir, '.ai', 'rules'), { recursive: true });
      await fs.writeFile(
        path.join(testDir, '.ai', 'config.yaml'),
        `version: "1.0.0"`
      );

      // Valid rule
      await fs.writeFile(
        path.join(testDir, '.ai', 'rules', 'valid.md'),
        `---
name: valid
description: Valid rule
version: 1.0.0
---

# Valid
`
      );

      // Invalid rule (missing required fields)
      await fs.writeFile(
        path.join(testDir, '.ai', 'rules', 'invalid.md'),
        `---
not_a_name: invalid
---

# Invalid
`
      );

      const result = await sync({ projectRoot: testDir });

      // Should still succeed (partial success)
      expect(result.success).toBe(true);

      // Valid rule should be generated
      expect(await fileExists(path.join(testDir, '.cursor', 'rules', 'valid.mdc'))).toBe(true);
    });
  });
});

