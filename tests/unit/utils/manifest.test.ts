/**
 * @file Manifest Utilities Tests
 * @description Tests for the manifest file generation and management
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  MANIFEST_FILENAME,
  validateManifest,
  createManifestV2,
  readManifest,
  writeManifest,
  collectGeneratedPaths,
  getGitignorePaths,
  collectFileEntriesWithHashes,
  isManifestV2,
  type ManifestFileEntry,
  type ManifestV2,
} from '../../../src/utils/manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESTS_TMP_DIR = path.resolve(__dirname, '..', '..', '.tmp');
const VALID_HASH = `sha256:${'a'.repeat(64)}`;

describe('Manifest Utilities', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(TESTS_TMP_DIR, `manifest-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('validateManifest', () => {
    const baseManifest: ManifestV2 = {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      files: [{ path: 'file.txt', hash: VALID_HASH }],
      directories: ['.cursor/'],
    };

    it('should accept valid V2 manifest', () => {
      const result = validateManifest(baseManifest);
      expect(result.ok).toBe(true);
    });

    it('should reject missing version', () => {
      const invalid = { ...baseManifest } as Record<string, unknown>;
      delete invalid.version;

      const result = validateManifest(invalid);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('version');
      }
    });

    it('should reject invalid hash format', () => {
      const invalid = {
        ...baseManifest,
        files: [{ path: 'file.txt', hash: 'sha256:not-a-hash' }],
      } as unknown;

      const result = validateManifest(invalid);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('hash');
      }
    });

    it('should reject directories without trailing slash', () => {
      const invalid = {
        ...baseManifest,
        directories: ['.cursor'],
      } as unknown;

      const result = validateManifest(invalid);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('directories');
      }
    });
  });

  describe('readManifest', () => {
    it('should return null when manifest does not exist', async () => {
      const result = await readManifest(testDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('should parse valid V2 JSON', async () => {
      const manifest: ManifestV2 = {
        version: '2.0.0',
        timestamp: '2024-01-15T10:30:00.000Z',
        files: [{ path: 'CLAUDE.md', hash: VALID_HASH }],
        directories: ['.cursor/rules/'],
      };

      await fs.writeFile(
        path.join(testDir, MANIFEST_FILENAME),
        JSON.stringify(manifest, null, 2)
      );

      const result = await readManifest(testDir);

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.version).toBe('2.0.0');
        expect(result.value.files[0]?.path).toBe('CLAUDE.md');
      }
    });

    it('should reject invalid JSON', async () => {
      await fs.writeFile(path.join(testDir, MANIFEST_FILENAME), '{');

      const result = await readManifest(testDir);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Failed to parse manifest JSON');
      }
    });
  });

  describe('writeManifest', () => {
    it('should write valid JSON with formatting', async () => {
      const manifest: ManifestV2 = {
        version: '2.0.0',
        timestamp: '2024-01-15T10:30:00.000Z',
        files: [{ path: 'file.txt', hash: VALID_HASH }],
        directories: ['.cursor/'],
      };

      const writeResult = await writeManifest(testDir, manifest);
      expect(writeResult.ok).toBe(true);

      const content = await fs.readFile(path.join(testDir, MANIFEST_FILENAME), 'utf-8');
      expect(content.endsWith('\n')).toBe(true);
      expect(JSON.parse(content)).toEqual(manifest);
    });

    it('should round-trip correctly', async () => {
      const manifest: ManifestV2 = createManifestV2(
        [{ path: 'file.txt', hash: VALID_HASH }],
        ['.cursor/'],
        '2.0.0'
      );

      await writeManifest(testDir, manifest);
      const readResult = await readManifest(testDir);

      expect(readResult.ok).toBe(true);
      if (readResult.ok && readResult.value) {
        expect(readResult.value.version).toBe('2.0.0');
        expect(readResult.value.files[0]?.hash).toBe(VALID_HASH);
        expect(readResult.value.directories).toContain('.cursor/');
      }
    });
  });

  describe('collectGeneratedPaths', () => {
    it('should collect files and directories from generated paths', () => {
      const files = [
        '.cursor/rules/core.mdc',
        '.cursor/rules/api.mdc',
        '.claude/skills/core/SKILL.md',
        'CLAUDE.md',
        'AGENTS.md',
      ];

      const result = collectGeneratedPaths(files, testDir);

      expect(result.files).toContain('.cursor/rules/core.mdc');
      expect(result.files).toContain('.cursor/rules/api.mdc');
      expect(result.files).toContain('.claude/skills/core/SKILL.md');
      expect(result.files).toContain('CLAUDE.md');
      expect(result.files).toContain('AGENTS.md');

      expect(result.directories).toContain('.cursor/rules/');
      expect(result.directories).toContain('.claude/');
    });

    it('should handle absolute paths', () => {
      const files = [
        path.join(testDir, '.cursor/rules/core.mdc'),
        path.join(testDir, 'CLAUDE.md'),
      ];

      const result = collectGeneratedPaths(files, testDir);

      expect(result.files).toContain('.cursor/rules/core.mdc');
      expect(result.files).toContain('CLAUDE.md');
    });

    it('should deduplicate directories', () => {
      const files = [
        '.cursor/rules/a.mdc',
        '.cursor/rules/b.mdc',
        '.cursor/rules/c.mdc',
      ];

      const result = collectGeneratedPaths(files, testDir);

      const cursorDirs = result.directories.filter(d => d.startsWith('.cursor'));
      expect(cursorDirs.length).toBe(1);
    });
  });

  describe('getGitignorePaths', () => {
    it('should return only root-level generated files and manifest', () => {
      const manifest: ManifestV2 = {
        version: '2.0.0',
        timestamp: '2024-01-15T10:30:00.000Z',
        files: [
          { path: 'CLAUDE.md', hash: VALID_HASH },
          { path: 'AGENTS.md', hash: VALID_HASH },
          { path: '.cursor/rules/core.mdc', hash: VALID_HASH },
          { path: '.claude/skills/core/SKILL.md', hash: VALID_HASH },
        ],
        directories: [
          '.cursor/rules/',
          '.cursor/commands/',
          '.claude/',
          '.factory/',
        ],
      };

      const paths = getGitignorePaths(manifest);

      expect(paths).toContain('CLAUDE.md');
      expect(paths).toContain('AGENTS.md');
      expect(paths).toContain(MANIFEST_FILENAME);

      expect(paths).not.toContain('.cursor/rules/');
      expect(paths).not.toContain('.cursor/commands/');
      expect(paths).not.toContain('.claude/');
      expect(paths).not.toContain('.factory/');
      expect(paths).not.toContain('.cursor/rules/core.mdc');
      expect(paths).not.toContain('.claude/skills/core/SKILL.md');
    });

    it('should only include root files present in the manifest', () => {
      const manifest: ManifestV2 = {
        version: '2.0.0',
        timestamp: '2024-01-15T10:30:00.000Z',
        files: [
          { path: 'CLAUDE.md', hash: VALID_HASH },
          { path: '.cursor/rules/core.mdc', hash: VALID_HASH },
        ],
        directories: ['.cursor/rules/'],
      };

      const paths = getGitignorePaths(manifest);

      expect(paths).toContain('CLAUDE.md');
      expect(paths).toContain(MANIFEST_FILENAME);
      expect(paths).not.toContain('AGENTS.md');
      expect(paths).not.toContain('mcp.json');
      expect(paths).not.toContain('.cursor/rules/');
      expect(paths).not.toContain('.cursor/rules/core.mdc');
    });

    it('should include only manifest file when no root files exist', () => {
      const manifest: ManifestV2 = {
        version: '2.0.0',
        timestamp: '2024-01-15T10:30:00.000Z',
        files: [],
        directories: ['.cursor/rules/', '.claude/'],
      };

      const paths = getGitignorePaths(manifest);

      expect(paths).toEqual([MANIFEST_FILENAME]);
    });
  });

  describe('collectFileEntriesWithHashes', () => {
    it('should compute hashes for all files', async () => {
      const fileA = path.join(testDir, 'a.txt');
      const fileB = path.join(testDir, 'b.txt');
      await fs.writeFile(fileA, 'hello');
      await fs.writeFile(fileB, 'world');

      const result = await collectFileEntriesWithHashes(['a.txt', 'b.txt'], testDir);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].hash.startsWith('sha256:')).toBe(true);
      }
    });

    it('should skip files that do not exist', async () => {
      const fileA = path.join(testDir, 'a.txt');
      await fs.writeFile(fileA, 'hello');

      const result = await collectFileEntriesWithHashes(['a.txt', 'missing.txt'], testDir);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].path).toBe('a.txt');
      }
    });

    it('should produce stable hashes for the same content', async () => {
      const fileA = path.join(testDir, 'a.txt');
      await fs.writeFile(fileA, 'stable');

      const first = await collectFileEntriesWithHashes(['a.txt'], testDir);
      const second = await collectFileEntriesWithHashes(['a.txt'], testDir);

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (first.ok && second.ok) {
        expect(first.value[0].hash).toBe(second.value[0].hash);
      }
    });
  });

  describe('ManifestV2 integration', () => {
    it('should write and read a v2 manifest', async () => {
      const entries: ManifestFileEntry[] = [
        { path: 'file.txt', hash: VALID_HASH },
      ];

      const manifest: ManifestV2 = createManifestV2(entries, [], '2.0.0');
      const writeResult = await writeManifest(testDir, manifest);
      expect(writeResult.ok).toBe(true);

      const readResult = await readManifest(testDir);
      expect(readResult.ok).toBe(true);
      if (readResult.ok && readResult.value) {
        expect(isManifestV2(readResult.value)).toBe(true);
        const readManifestData = readResult.value as ManifestV2;
        expect(readManifestData.files[0]?.hash).toBe(VALID_HASH);
      }
    });
  });
});

