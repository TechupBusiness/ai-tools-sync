/**
 * @file Migration Command Tests
 * @description Tests for the migrate command and discovery functionality
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { discover, migrate } from '../../../src/cli/commands/migrate.js';
import { DEFAULT_CONFIG_DIR } from '../../../src/config/loader.js';

// Mock the output module to avoid console output during tests
vi.mock('../../../src/cli/output.js', () => ({
  printHeader: vi.fn(),
  printSubHeader: vi.fn(),
  printInfo: vi.fn(),
  printSuccess: vi.fn(),
  printWarning: vi.fn(),
  printError: vi.fn(),
  printSummary: vi.fn(),
  printNewLine: vi.fn(),
  printListItem: vi.fn(),
  printKeyValue: vi.fn(),
  createSpinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    update: vi.fn(),
  })),
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    list: vi.fn(),
    setVerbose: vi.fn(),
  },
}));

describe('Migration Discovery', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create temp test directory
    testDir = path.join(process.cwd(), 'tests', 'fixtures', 'migrate-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('discover', () => {
    it('should return empty results for empty directory', async () => {
      const result = await discover(testDir);

      expect(result.files).toHaveLength(0);
      expect(result.stats.totalFiles).toBe(0);
      expect(result.stats.platforms).toHaveLength(0);
    });

    it('should discover Cursor rules (.mdc files)', async () => {
      // Create Cursor rules directory structure
      const cursorRulesDir = path.join(testDir, '.cursor', 'rules');
      await fs.mkdir(cursorRulesDir, { recursive: true });

      // Create a .mdc file
      await fs.writeFile(
        path.join(cursorRulesDir, 'test-rule.mdc'),
        `---
description: Test rule
globs: ["**/*.ts"]
alwaysApply: false
---

# Test Rule

This is a test rule.
`
      );

      const result = await discover(testDir);

      expect(result.files).toHaveLength(1);
      expect(result.stats.totalFiles).toBe(1);
      expect(result.stats.platforms).toContain('cursor');
      expect(result.byPlatform.cursor).toHaveLength(1);
      expect(result.byPlatform.cursor[0]?.relativePath).toBe('.cursor/rules/test-rule.mdc');
      expect(result.byPlatform.cursor[0]?.contentType).toBe('rule');
      expect(result.byPlatform.cursor[0]?.hasFrontmatter).toBe(true);
    });

    it('should discover deprecated .cursorrules file', async () => {
      await fs.writeFile(
        path.join(testDir, '.cursorrules'),
        `# Project Rules

This is a deprecated cursorrules file.
`
      );

      const result = await discover(testDir);

      expect(result.files).toHaveLength(1);
      expect(result.byPlatform.cursor).toHaveLength(1);
      expect(result.byPlatform.cursor[0]?.relativePath).toBe('.cursorrules');
    });

    it('should discover CLAUDE.md file', async () => {
      await fs.writeFile(
        path.join(testDir, 'CLAUDE.md'),
        `# Claude Instructions

## Section 1
Content here.

## Section 2
More content.
`
      );

      const result = await discover(testDir);

      expect(result.files).toHaveLength(1);
      expect(result.byPlatform.claude).toHaveLength(1);
      expect(result.byPlatform.claude[0]?.contentType).toBe('mixed');
    });

    it('should discover Claude skills directory', async () => {
      const skillsDir = path.join(testDir, '.claude', 'skills', 'my-skill');
      await fs.mkdir(skillsDir, { recursive: true });

      await fs.writeFile(
        path.join(skillsDir, 'SKILL.md'),
        `---
name: my-skill
description: A skill
---

# My Skill
`
      );

      const result = await discover(testDir);

      expect(result.files).toHaveLength(1);
      expect(result.byPlatform.claude).toHaveLength(1);
      expect(result.byPlatform.claude[0]?.contentType).toBe('rule');
    });

    it('should discover Claude agents', async () => {
      const agentsDir = path.join(testDir, '.claude', 'agents');
      await fs.mkdir(agentsDir, { recursive: true });

      await fs.writeFile(
        path.join(agentsDir, 'architect.md'),
        `---
name: architect
tools: [read, write]
---

# Architect Persona
`
      );

      const result = await discover(testDir);

      expect(result.files).toHaveLength(1);
      expect(result.byPlatform.claude).toHaveLength(1);
      expect(result.byPlatform.claude[0]?.contentType).toBe('persona');
    });

    it('should discover Factory droids', async () => {
      const droidsDir = path.join(testDir, '.factory', 'droids');
      await fs.mkdir(droidsDir, { recursive: true });

      await fs.writeFile(
        path.join(droidsDir, 'implementer.md'),
        `---
name: implementer
---

# Implementer Droid
`
      );

      const result = await discover(testDir);

      expect(result.files).toHaveLength(1);
      expect(result.byPlatform.factory).toHaveLength(1);
      expect(result.byPlatform.factory[0]?.contentType).toBe('persona');
    });

    it('should discover AGENTS.md file', async () => {
      await fs.writeFile(
        path.join(testDir, 'AGENTS.md'),
        `# Agents

## Available Agents
- Architect
- Implementer
`
      );

      const result = await discover(testDir);

      expect(result.files).toHaveLength(1);
      expect(result.byPlatform.factory).toHaveLength(1);
      expect(result.byPlatform.factory[0]?.contentType).toBe('mixed');
    });

    it('should discover files from multiple platforms', async () => {
      // Cursor
      const cursorDir = path.join(testDir, '.cursor', 'rules');
      await fs.mkdir(cursorDir, { recursive: true });
      await fs.writeFile(path.join(cursorDir, 'rule.mdc'), '# Rule');

      // Claude
      await fs.writeFile(path.join(testDir, 'CLAUDE.md'), '# Claude');

      // Factory
      const factoryDir = path.join(testDir, '.factory', 'droids');
      await fs.mkdir(factoryDir, { recursive: true });
      await fs.writeFile(path.join(factoryDir, 'droid.md'), '# Droid');

      const result = await discover(testDir);

      expect(result.files).toHaveLength(3);
      expect(result.stats.platforms).toContain('cursor');
      expect(result.stats.platforms).toContain('claude');
      expect(result.stats.platforms).toContain('factory');
    });

    it('should detect files that should be split', async () => {
      await fs.writeFile(
        path.join(testDir, 'CLAUDE.md'),
        `# Topic 1

Content for topic 1.

# Topic 2

Content for topic 2.

# Topic 3

Content for topic 3.
`
      );

      const result = await discover(testDir);

      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.shouldSplit).toBe(true);
      expect(result.files[0]?.detectedTopics).toContain('Topic 1');
      expect(result.files[0]?.detectedTopics).toContain('Topic 2');
      expect(result.files[0]?.detectedTopics).toContain('Topic 3');
      expect(result.stats.filesNeedingSplit).toBe(1);
    });

    it('should track files with frontmatter', async () => {
      const cursorDir = path.join(testDir, '.cursor', 'rules');
      await fs.mkdir(cursorDir, { recursive: true });

      // File with frontmatter
      await fs.writeFile(
        path.join(cursorDir, 'with-fm.mdc'),
        `---
description: Has frontmatter
---
# Content
`
      );

      // File without frontmatter
      await fs.writeFile(
        path.join(cursorDir, 'without-fm.mdc'),
        `# Content

No frontmatter here.
`
      );

      const result = await discover(testDir);

      expect(result.files).toHaveLength(2);
      expect(result.stats.filesWithFrontmatter).toBe(1);
    });

    it('should calculate total size correctly', async () => {
      const cursorDir = path.join(testDir, '.cursor', 'rules');
      await fs.mkdir(cursorDir, { recursive: true });

      const content1 = '# Rule 1\n'.repeat(100);
      const content2 = '# Rule 2\n'.repeat(50);

      await fs.writeFile(path.join(cursorDir, 'rule1.mdc'), content1);
      await fs.writeFile(path.join(cursorDir, 'rule2.mdc'), content2);

      const result = await discover(testDir);

      expect(result.stats.totalSize).toBe(content1.length + content2.length);
    });

    it('should add warnings for files without frontmatter', async () => {
      const cursorDir = path.join(testDir, '.cursor', 'rules');
      await fs.mkdir(cursorDir, { recursive: true });

      await fs.writeFile(
        path.join(cursorDir, 'no-fm.mdc'),
        `# Rule without frontmatter

No metadata here.
`
      );

      const result = await discover(testDir);

      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.warnings).toContainEqual(
        expect.stringContaining('No frontmatter detected')
      );
    });
  });
});

describe('Migration Command', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'tests', 'fixtures', 'migrate-cmd-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('migrate', () => {
    it('should succeed with no files to migrate', async () => {
      const result = await migrate({
        projectRoot: testDir,
        discoveryOnly: true,
      });

      expect(result.success).toBe(true);
      expect(result.discovery.files).toHaveLength(0);
    });

    it('should discover files in discovery-only mode', async () => {
      const cursorDir = path.join(testDir, '.cursor', 'rules');
      await fs.mkdir(cursorDir, { recursive: true });
      await fs.writeFile(path.join(cursorDir, 'test.mdc'), '# Test');

      const result = await migrate({
        projectRoot: testDir,
        discoveryOnly: true,
      });

      expect(result.success).toBe(true);
      expect(result.discovery.files).toHaveLength(1);
      expect(result.migratedFiles).toHaveLength(0); // No migration in discovery-only
    });

    it('should create backup when backup option is enabled', async () => {
      const cursorDir = path.join(testDir, '.cursor', 'rules');
      await fs.mkdir(cursorDir, { recursive: true });
      await fs.writeFile(path.join(cursorDir, 'test.mdc'), '# Test');

      const result = await migrate({
        projectRoot: testDir,
        backup: true,
        yes: true,
      });

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(result.backupPath).toContain('backups');

      // Verify backup was created
      const backupExists = await fs.stat(result.backupPath!).then(() => true).catch(() => false);
      expect(backupExists).toBe(true);
    });

    it('should not make changes in dry-run mode', async () => {
      const cursorDir = path.join(testDir, '.cursor', 'rules');
      await fs.mkdir(cursorDir, { recursive: true });
      await fs.writeFile(path.join(cursorDir, 'test.mdc'), '# Test');

      const result = await migrate({
        projectRoot: testDir,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      // Config dir should not be created in dry run
      const configDirExists = await fs.stat(path.join(testDir, DEFAULT_CONFIG_DIR)).then(() => true).catch(() => false);
      expect(configDirExists).toBe(false);
    });

    it('should migrate simple files with frontmatter', async () => {
      const cursorDir = path.join(testDir, '.cursor', 'rules');
      await fs.mkdir(cursorDir, { recursive: true });

      await fs.writeFile(
        path.join(cursorDir, 'simple-rule.mdc'),
        `---
description: Simple rule
globs: ["**/*.ts"]
---

# Simple Rule

Content here.
`
      );

      const result = await migrate({
        projectRoot: testDir,
        yes: true,
      });

      expect(result.success).toBe(true);
      expect(result.migratedFiles.length).toBeGreaterThan(0);
    });

    it('should copy complex files to input folder', async () => {
      await fs.writeFile(
        path.join(testDir, 'CLAUDE.md'),
        `# Topic 1

Content 1.

# Topic 2

Content 2.

# Topic 3

Content 3.
`
      );

      const result = await migrate({
        projectRoot: testDir,
        yes: true,
      });

      expect(result.success).toBe(true);

      // Complex file should be copied to input folder
      const inputPath = path.join(testDir, DEFAULT_CONFIG_DIR, 'input', 'CLAUDE.md');
      const inputExists = await fs.stat(inputPath).then(() => true).catch(() => false);
      expect(inputExists).toBe(true);
    });

    it('should use custom config directory', async () => {
      const cursorDir = path.join(testDir, '.cursor', 'rules');
      await fs.mkdir(cursorDir, { recursive: true });
      await fs.writeFile(path.join(cursorDir, 'test.mdc'), '# Test');

      const customDir = '.my-ai-config';
      const result = await migrate({
        projectRoot: testDir,
        configDir: customDir,
        yes: true,
      });

      expect(result.success).toBe(true);

      // Custom config dir should be created
      const configDirExists = await fs.stat(path.join(testDir, customDir)).then(() => true).catch(() => false);
      expect(configDirExists).toBe(true);
    });
  });
});

describe('Content Type Detection', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'tests', 'fixtures', 'content-type-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should detect persona from frontmatter tools field', async () => {
    const agentsDir = path.join(testDir, '.claude', 'agents');
    await fs.mkdir(agentsDir, { recursive: true });

    await fs.writeFile(
      path.join(agentsDir, 'test.md'),
      `---
tools: [read, write, edit]
model: claude-3-opus
---

# Persona content
`
    );

    const result = await discover(testDir);
    expect(result.files[0]?.contentType).toBe('persona');
  });

  it('should detect command from execute field', async () => {
    const commandsDir = path.join(testDir, '.cursor', 'commands');
    await fs.mkdir(commandsDir, { recursive: true });

    await fs.writeFile(
      path.join(commandsDir, 'test.md'),
      `---
execute: npm run lint
args:
  - name: fix
    type: boolean
---

# Command content
`
    );

    const result = await discover(testDir);
    expect(result.files[0]?.contentType).toBe('command');
  });

  it('should detect hook from event field', async () => {
    const hooksDir = path.join(testDir, '.claude', 'skills', 'hook-skill');
    await fs.mkdir(hooksDir, { recursive: true });

    await fs.writeFile(
      path.join(hooksDir, 'SKILL.md'),
      `---
event: PreToolUse
tool_match: "Bash(*)"
---

# Hook content
`
    );

    const result = await discover(testDir);
    expect(result.files[0]?.contentType).toBe('hook');
  });

  it('should detect rule from globs field', async () => {
    const rulesDir = path.join(testDir, '.cursor', 'rules');
    await fs.mkdir(rulesDir, { recursive: true });

    await fs.writeFile(
      path.join(rulesDir, 'test.mdc'),
      `---
globs: ["**/*.ts", "**/*.tsx"]
always_apply: false
---

# Rule content
`
    );

    const result = await discover(testDir);
    expect(result.files[0]?.contentType).toBe('rule');
  });
});

