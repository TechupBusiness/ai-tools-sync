/**
 * @file Merge Command Tests
 * @description Tests for the merge command functionality
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { merge } from '../../../src/cli/commands/merge.js';

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

describe('Merge Command', () => {
  let testDir: string;
  let aiDir: string;
  let inputDir: string;

  beforeEach(async () => {
    // Create temp test directory
    testDir = path.join(process.cwd(), 'tests', 'fixtures', 'merge-test-' + Date.now());
    aiDir = path.join(testDir, '.ai-tool-sync');
    inputDir = path.join(aiDir, 'input');

    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(path.join(aiDir, 'rules'), { recursive: true });
    await fs.mkdir(path.join(aiDir, 'personas'), { recursive: true });
    await fs.mkdir(path.join(aiDir, 'commands'), { recursive: true });
    await fs.mkdir(path.join(aiDir, 'hooks'), { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Empty Input Folder', () => {
    it('should handle empty input folder gracefully', async () => {
      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
      });

      expect(result.success).toBe(true);
      expect(result.analyzed).toHaveLength(0);
      expect(result.merged).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Discovery', () => {
    it('should discover markdown files in input folder', async () => {
      // Create test files
      await fs.writeFile(
        path.join(inputDir, 'test-rule.md'),
        `---
name: test-rule
description: Test rule
globs: ["**/*.ts"]
always_apply: false
---

# Test Rule

This is a test rule.
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        dryRun: true,
      });

      expect(result.analyzed).toHaveLength(1);
      expect(result.analyzed[0]?.relativePath).toBe('test-rule.md');
      expect(result.analyzed[0]?.contentType).toBe('rule');
    });

    it('should discover files in nested directories', async () => {
      // Create nested structure
      const nestedDir = path.join(inputDir, 'rules', 'typescript');
      await fs.mkdir(nestedDir, { recursive: true });

      await fs.writeFile(
        path.join(nestedDir, 'nested-rule.md'),
        `---
name: nested-rule
description: Nested rule
globs:
  - "**/*.ts"
---

# Nested Rule
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        dryRun: true,
      });

      expect(result.analyzed).toHaveLength(1);
      expect(result.analyzed[0]?.relativePath).toContain('rules/typescript/nested-rule.md');
    });
  });

  describe('Content Type Detection', () => {
    it('should detect rule content type from frontmatter', async () => {
      await fs.writeFile(
        path.join(inputDir, 'test-rule.md'),
        `---
name: test-rule
globs: ["**/*.ts"]
always_apply: false
---

# Test Rule
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        dryRun: true,
      });

      expect(result.analyzed[0]?.contentType).toBe('rule');
    });

    it('should detect persona content type from frontmatter', async () => {
      await fs.writeFile(
        path.join(inputDir, 'test-persona.md'),
        `---
name: test-persona
description: Test persona
tools:
  - read
  - write
model: default
targets:
  - cursor
  - claude
---

# Test Persona

You are a helpful assistant.
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        dryRun: true,
      });

      expect(result.analyzed[0]?.contentType).toBe('persona');
    });

    it('should detect command content type from frontmatter', async () => {
      await fs.writeFile(
        path.join(inputDir, 'test-command.md'),
        `---
name: test-command
description: Test command
execute: npm test
targets:
  - cursor
---

# Test Command
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        dryRun: true,
      });

      expect(result.analyzed[0]?.contentType).toBe('command');
    });

    it('should detect hook content type from frontmatter', async () => {
      await fs.writeFile(
        path.join(inputDir, 'test-hook.md'),
        `---
name: test-hook
description: Test hook
event: PreToolUse
targets:
  - claude
---

# Test Hook
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        dryRun: true,
      });

      expect(result.analyzed[0]?.contentType).toBe('hook');
    });

    it('should fall back to path-based detection', async () => {
      // Create nested directory
      await fs.mkdir(path.join(inputDir, 'rules'), { recursive: true });

      await fs.writeFile(
        path.join(inputDir, 'rules', 'no-frontmatter.md'),
        `# Rule Without Frontmatter

This should be detected as a rule based on path.
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        dryRun: true,
      });

      expect(result.analyzed[0]?.contentType).toBe('rule');
    });
  });

  describe('Comparison', () => {
    it('should mark new files correctly', async () => {
      await fs.writeFile(
        path.join(inputDir, 'new-rule.md'),
        `---
name: new-rule
description: New rule
globs:
  - "**/*.ts"
---

# New Rule
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        dryRun: true,
      });

      expect(result.analyzed[0]?.status).toBe('new');
    });

    it('should mark identical files correctly', async () => {
      const content = `---
name: existing-rule
description: Existing rule
globs:
  - "**/*.ts"
---

# Existing Rule
`;

      // Create existing file (using the name from frontmatter)
      await fs.writeFile(path.join(aiDir, 'rules', 'existing-rule.md'), content);

      // Create identical input file (will be compared against the file with name from frontmatter)
      await fs.writeFile(path.join(inputDir, 'some-input-file.md'), content);

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        dryRun: true,
      });

      expect(result.analyzed[0]?.status).toBe('identical');
    });

    it('should mark modified files correctly', async () => {
      // Create existing file
      await fs.writeFile(
        path.join(aiDir, 'rules', 'modified-rule.md'),
        `---
name: modified-rule
description: Original description
globs:
  - "**/*.ts"
---

# Original Content
`
      );

      // Create modified input file
      await fs.writeFile(
        path.join(inputDir, 'some-modified.md'),
        `---
name: modified-rule
description: Updated description
globs:
  - "**/*.ts"
---

# Modified Content
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        dryRun: true,
      });

      expect(result.analyzed[0]?.status).toBe('modified');
      expect(result.analyzed[0]?.diffDetails).toBeDefined();
      expect(result.analyzed[0]?.diffDetails?.frontmatterChanges.length).toBeGreaterThan(0);
      expect(result.analyzed[0]?.diffDetails?.contentChanged).toBe(true);
    });

    it('should detect frontmatter changes', async () => {
      // Create existing file
      await fs.writeFile(
        path.join(aiDir, 'rules', 'test-rule.md'),
        `---
name: test-rule
description: Original
priority: low
globs:
  - "**/*.ts"
---

# Same Content
`
      );

      // Create modified input file with different frontmatter
      await fs.writeFile(
        path.join(inputDir, 'some-test.md'),
        `---
name: test-rule
description: Modified
priority: high
globs:
  - "**/*.ts"
---

# Same Content
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        dryRun: true,
        verbose: true,
      });

      expect(result.analyzed[0]?.status).toBe('modified');
      expect(result.analyzed[0]?.diffDetails?.frontmatterChanges).toHaveLength(2);
      expect(result.analyzed[0]?.diffDetails?.contentChanged).toBe(false);
    });

    it('should detect content changes', async () => {
      // Create existing file
      await fs.writeFile(
        path.join(aiDir, 'rules', 'test-rule.md'),
        `---
name: test-rule
description: Same
globs:
  - "**/*.ts"
---

# Original Content
`
      );

      // Create modified input file with different content
      await fs.writeFile(
        path.join(inputDir, 'input-test.md'),
        `---
name: test-rule
description: Same
globs:
  - "**/*.ts"
---

# Modified Content
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        dryRun: true,
      });

      expect(result.analyzed[0]?.status).toBe('modified');
      expect(result.analyzed[0]?.diffDetails?.frontmatterChanges).toHaveLength(0);
      expect(result.analyzed[0]?.diffDetails?.contentChanged).toBe(true);
    });
  });

  describe('Dry Run Mode', () => {
    it('should not modify files in dry run mode', async () => {
      await fs.writeFile(
        path.join(inputDir, 'new-rule.md'),
        `---
name: new-rule
description: New rule for dry run
globs:
  - "**/*.ts"
---

# New Rule
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.analyzed).toHaveLength(1);
      expect(result.merged).toHaveLength(0);

      // Verify input file still exists
      const inputExists = await fs
        .stat(path.join(inputDir, 'new-rule.md'))
        .then(() => true)
        .catch(() => false);
      expect(inputExists).toBe(true);

      // Verify target file was not created
      const targetExists = await fs
        .stat(path.join(aiDir, 'rules', 'new-rule.md'))
        .then(() => true)
        .catch(() => false);
      expect(targetExists).toBe(false);
    });
  });

  describe('Merge Operation', () => {
    it('should merge new files', async () => {
      await fs.writeFile(
        path.join(inputDir, 'new-rule.md'),
        `---
name: new-rule
description: A new rule
globs:
  - "**/*.ts"
---

# New Rule
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        yes: true,
      });

      expect(result.success).toBe(true);
      expect(result.merged).toHaveLength(1);
      expect(result.errors).toHaveLength(0);

      // Verify file was moved
      const targetExists = await fs
        .stat(path.join(aiDir, 'rules', 'new-rule.md'))
        .then(() => true)
        .catch(() => false);
      expect(targetExists).toBe(true);

      // Verify file was removed from input
      const inputExists = await fs
        .stat(path.join(inputDir, 'new-rule.md'))
        .then(() => true)
        .catch(() => false);
      expect(inputExists).toBe(false);
    });

    it('should preserve file content during merge', async () => {
      const content = `---
name: test-rule
description: Test content
globs:
  - "**/*.ts"
---

# Test Rule

This is the content.
`;

      await fs.writeFile(path.join(inputDir, 'test-rule.md'), content);

      await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        yes: true,
      });

      // Verify content matches
      const mergedContent = await fs.readFile(path.join(aiDir, 'rules', 'test-rule.md'), 'utf-8');
      expect(mergedContent).toBe(content);
    });

    it('should handle multiple files', async () => {
      await fs.writeFile(
        path.join(inputDir, 'rule1.md'),
        `---
name: rule1
description: Rule 1
globs:
  - "**/*.ts"
---
# Rule 1
`
      );

      await fs.writeFile(
        path.join(inputDir, 'rule2.md'),
        `---
name: rule2
description: Rule 2
globs:
  - "**/*.js"
---
# Rule 2
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        yes: true,
      });

      expect(result.merged).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip identical files automatically', async () => {
      const content = `---
name: identical-rule
description: Identical
globs:
  - "**/*.ts"
---
# Identical
`;

      // Create existing file
      await fs.writeFile(path.join(aiDir, 'rules', 'identical-rule.md'), content);

      // Create identical input file
      await fs.writeFile(path.join(inputDir, 'some-identical.md'), content);

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        yes: true,
      });

      // Identical files should be analyzed but not merged
      expect(result.analyzed[0]?.status).toBe('identical');

      // Verify input file was not removed (since we don't merge identical files)
      const inputExists = await fs
        .stat(path.join(inputDir, 'some-identical.md'))
        .then(() => true)
        .catch(() => false);
      expect(inputExists).toBe(true);
    });

    it('should create target directory if it does not exist', async () => {
      // Remove personas directory
      await fs.rm(path.join(aiDir, 'personas'), { recursive: true, force: true });

      await fs.writeFile(
        path.join(inputDir, 'test-persona.md'),
        `---
name: test-persona
description: Test persona
tools:
  - read
targets:
  - cursor
---
# Persona
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        yes: true,
      });

      expect(result.success).toBe(true);
      expect(result.merged).toHaveLength(1);

      // Verify directory was created
      const dirExists = await fs
        .stat(path.join(aiDir, 'personas'))
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should mark unparseable files as invalid', async () => {
      // Write a completely empty file which will fail to parse
      await fs.writeFile(path.join(inputDir, 'empty.md'), '');

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        dryRun: true,
      });

      // Empty file should be detected as unknown content type
      expect(result.analyzed[0]?.contentType).toBe('unknown');
    });

    it('should continue processing after encountering errors', async () => {
      // Create one valid and one unknown file
      await fs.writeFile(
        path.join(inputDir, 'valid.md'),
        `---
name: valid
description: Valid rule
globs:
  - "**/*.ts"
targets:
  - cursor
---
# Valid
`
      );

      await fs.writeFile(
        path.join(inputDir, 'unknown.md'),
        `# File Without Frontmatter

This has no frontmatter at all.
`
      );

      const result = await merge({
        projectRoot: testDir,
        configDir: '.ai-tool-sync',
        dryRun: true,
      });

      expect(result.analyzed).toHaveLength(2);
      expect(result.analyzed.some((f) => f.status === 'new' && f.contentType === 'rule')).toBe(
        true
      );
      expect(result.analyzed.some((f) => f.contentType === 'unknown')).toBe(true);
    });
  });
});
