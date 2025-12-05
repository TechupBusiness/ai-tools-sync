/**
 * @file Init Command Tests
 * @description Tests for the init CLI command
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';

import { init } from '../../../src/cli/commands/init.js';
import { dirExists, fileExists, readFile } from '../../../src/utils/fs.js';

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
  };
});

describe('Init Command', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(tmpdir(), `ai-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

  describe('fresh initialization', () => {
    it('should create .ai directory structure', async () => {
      const result = await init({ projectRoot: testDir });

      expect(result.success).toBe(true);
      expect(await dirExists(path.join(testDir, '.ai'))).toBe(true);
      expect(await dirExists(path.join(testDir, '.ai', 'rules'))).toBe(true);
      expect(await dirExists(path.join(testDir, '.ai', 'personas'))).toBe(true);
      expect(await dirExists(path.join(testDir, '.ai', 'commands'))).toBe(true);
      expect(await dirExists(path.join(testDir, '.ai', 'hooks'))).toBe(true);
    });

    it('should create config.yaml with template content', async () => {
      await init({ projectRoot: testDir });

      const configPath = path.join(testDir, '.ai', 'config.yaml');
      expect(await fileExists(configPath)).toBe(true);

      const contentResult = await readFile(configPath);
      expect(contentResult.ok).toBe(true);
      if (contentResult.ok) {
        expect(contentResult.value).toContain('version:');
        expect(contentResult.value).toContain('targets:');
        expect(contentResult.value).toContain('cursor');
        expect(contentResult.value).toContain('claude');
        expect(contentResult.value).toContain('factory');
      }
    });

    it('should create _core.md rule with template content', async () => {
      await init({ projectRoot: testDir });

      const corePath = path.join(testDir, '.ai', 'rules', '_core.md');
      expect(await fileExists(corePath)).toBe(true);

      const contentResult = await readFile(corePath);
      expect(contentResult.ok).toBe(true);
      if (contentResult.ok) {
        expect(contentResult.value).toContain('name: _core');
        expect(contentResult.value).toContain('always_apply: true');
        expect(contentResult.value).toContain('# Project Overview');
      }
    });

    it('should return list of created files', async () => {
      const result = await init({ projectRoot: testDir });

      expect(result.filesCreated).toContain('.ai/config.yaml');
      expect(result.filesCreated).toContain('.ai/rules/_core.md');
    });
  });

  describe('existing configuration', () => {
    beforeEach(async () => {
      // Pre-create .ai directory
      await fs.mkdir(path.join(testDir, '.ai'), { recursive: true });
    });

    it('should fail without --force when .ai exists', async () => {
      const result = await init({ projectRoot: testDir });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Configuration already exists. Use --force to overwrite.');
    });

    it('should succeed with --force when .ai exists', async () => {
      const result = await init({ projectRoot: testDir, force: true });

      expect(result.success).toBe(true);
      expect(result.filesCreated.length).toBeGreaterThan(0);
    });

    it('should overwrite existing config.yaml with --force', async () => {
      // Create existing config
      await fs.mkdir(path.join(testDir, '.ai'), { recursive: true });
      await fs.writeFile(path.join(testDir, '.ai', 'config.yaml'), 'old: content');

      await init({ projectRoot: testDir, force: true });

      const contentResult = await readFile(path.join(testDir, '.ai', 'config.yaml'));
      expect(contentResult.ok).toBe(true);
      if (contentResult.ok) {
        expect(contentResult.value).not.toContain('old: content');
        expect(contentResult.value).toContain('version:');
      }
    });
  });

  describe('error handling', () => {
    it('should handle non-existent project root gracefully', async () => {
      const nonExistentDir = path.join(testDir, 'does-not-exist');
      const result = await init({ projectRoot: nonExistentDir });

      // It should create the directory structure
      expect(result.success).toBe(true);
    });
  });
});

