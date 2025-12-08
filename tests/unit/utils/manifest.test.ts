/**
 * @file Manifest Utilities Tests
 * @description Tests for the manifest file generation and management
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { fileExists } from '../../../src/utils/fs.js';
import {
  MANIFEST_FILENAME,
  parseManifest,
  formatManifest,
  createManifest,
  createManifestV2,
  readManifest,
  writeManifest,
  collectGeneratedPaths,
  getGitignorePaths,
  collectFileEntriesWithHashes,
  isManifestV2,
  type ManifestFileEntry,
  type ManifestV2,
  type Manifest,
} from '../../../src/utils/manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESTS_TMP_DIR = path.resolve(__dirname, '..', '..', '.tmp');

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

  describe('parseManifest', () => {
    it('should parse a valid manifest file', () => {
      const content = `# AI Tool Sync Generated Files
# This file is auto-generated. Do not edit manually.
#
# version: 1.0.0
# timestamp: 2024-01-15T10:30:00.000Z
#
# Directories:
.cursor/rules/
.claude/
#
# Files:
CLAUDE.md
AGENTS.md
.cursor/rules/core.mdc
`;

      const manifest = parseManifest(content);

      expect(manifest.version).toBe('1.0.0');
      expect(manifest.timestamp).toBe('2024-01-15T10:30:00.000Z');
      expect(manifest.directories).toEqual(['.cursor/rules/', '.claude/']);
      expect(manifest.files).toEqual(['CLAUDE.md', 'AGENTS.md', '.cursor/rules/core.mdc']);
    });

    it('should handle empty manifest', () => {
      const content = '# Empty manifest\n';
      const manifest = parseManifest(content);

      expect(manifest.version).toBe('');
      expect(manifest.timestamp).toBe('');
      expect(manifest.files).toEqual([]);
      expect(manifest.directories).toEqual([]);
    });

    it('should skip comments and empty lines', () => {
      const content = `# Comment 1
# Comment 2

.cursor/rules/
# Another comment
CLAUDE.md

`;
      const manifest = parseManifest(content);

      expect(manifest.directories).toEqual(['.cursor/rules/']);
      expect(manifest.files).toEqual(['CLAUDE.md']);
    });
  });

  describe('formatManifest', () => {
    it('should format a manifest correctly', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        timestamp: '2024-01-15T10:30:00.000Z',
        files: ['CLAUDE.md', 'AGENTS.md'],
        directories: ['.cursor/rules/', '.claude/'],
      };

      const content = formatManifest(manifest);

      expect(content).toContain('# version: 1.0.0');
      expect(content).toContain('# timestamp: 2024-01-15T10:30:00.000Z');
      expect(content).toContain('.cursor/rules/');
      expect(content).toContain('.claude/');
      expect(content).toContain('CLAUDE.md');
      expect(content).toContain('AGENTS.md');
    });

    it('should sort directories and files', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        timestamp: '2024-01-15T10:30:00.000Z',
        files: ['AGENTS.md', 'CLAUDE.md'],
        directories: ['.factory/', '.claude/', '.cursor/rules/'],
      };

      const content = formatManifest(manifest);
      const lines = content.split('\n');
      
      // Find directory lines
      const dirLines = lines.filter(l => l.endsWith('/') && !l.startsWith('#'));
      expect(dirLines[0]).toBe('.claude/');
      expect(dirLines[1]).toBe('.cursor/rules/');
      expect(dirLines[2]).toBe('.factory/');
      
      // Find file lines
      const fileLines = lines.filter(l => !l.endsWith('/') && !l.startsWith('#') && l.trim());
      expect(fileLines[0]).toBe('AGENTS.md');
      expect(fileLines[1]).toBe('CLAUDE.md');
    });
  });

  describe('createManifest', () => {
    it('should create a manifest with current timestamp', () => {
      const beforeTime = Date.now();
      const manifest = createManifest(['CLAUDE.md'], ['.cursor/'], '1.0.0');
      const afterTime = Date.now();

      expect(manifest.version).toBe('1.0.0');
      expect(manifest.files).toEqual(['CLAUDE.md']);
      expect(manifest.directories).toEqual(['.cursor/']);

      // Check timestamp is recent
      const timestamp = new Date(manifest.timestamp).getTime();
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should deduplicate files and directories', () => {
      const manifest = createManifest(
        ['CLAUDE.md', 'CLAUDE.md', 'AGENTS.md'],
        ['.cursor/', '.cursor/', '.claude/'],
        '1.0.0'
      );

      expect(manifest.files).toEqual(['AGENTS.md', 'CLAUDE.md']);
      expect(manifest.directories).toEqual(['.claude/', '.cursor/']);
    });
  });

  describe('readManifest / writeManifest', () => {
    it('should return null when manifest does not exist', async () => {
      const result = await readManifest(testDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('should read and write manifest correctly', async () => {
      const manifest: Manifest = {
        version: '1.0.0',
        timestamp: '2024-01-15T10:30:00.000Z',
        files: ['CLAUDE.md', 'AGENTS.md'],
        directories: ['.cursor/rules/'],
      };

      // Write manifest
      const writeResult = await writeManifest(testDir, manifest);
      expect(writeResult.ok).toBe(true);

      // Check file exists
      expect(await fileExists(path.join(testDir, MANIFEST_FILENAME))).toBe(true);

      // Read manifest back
      const readResult = await readManifest(testDir);
      expect(readResult.ok).toBe(true);
      if (readResult.ok && readResult.value) {
        expect(readResult.value.version).toBe('1.0.0');
        expect(readResult.value.timestamp).toBe('2024-01-15T10:30:00.000Z');
        expect(readResult.value.files).toContain('CLAUDE.md');
        expect(readResult.value.files).toContain('AGENTS.md');
        expect(readResult.value.directories).toContain('.cursor/rules/');
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
    it('should return only top-level generated directories and root files', () => {
      const manifest: Manifest = {
        version: '1.0.0',
        timestamp: '2024-01-15T10:30:00.000Z',
        files: [
          'CLAUDE.md',
          'AGENTS.md',
          '.cursor/rules/core.mdc',
          '.claude/skills/core/SKILL.md',
        ],
        directories: [
          '.cursor/rules/',
          '.cursor/commands/',
          '.claude/',
          '.factory/',
        ],
      };

      const paths = getGitignorePaths(manifest);

      // Should include top-level directories
      expect(paths).toContain('.cursor/rules/');
      expect(paths).toContain('.cursor/commands/');
      expect(paths).toContain('.claude/');
      expect(paths).toContain('.factory/');

      // Should include root files
      expect(paths).toContain('CLAUDE.md');
      expect(paths).toContain('AGENTS.md');

      // Should include manifest file itself
      expect(paths).toContain(MANIFEST_FILENAME);

      // Should not include nested paths
      expect(paths).not.toContain('.cursor/rules/core.mdc');
      expect(paths).not.toContain('.claude/skills/core/SKILL.md');
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
        { path: 'file.txt', hash: 'sha256:abc' },
      ];

      const manifest: ManifestV2 = createManifestV2(entries, [], '2.0.0');
      const writeResult = await writeManifest(testDir, manifest);
      expect(writeResult.ok).toBe(true);

      const readResult = await readManifest(testDir);
      expect(readResult.ok).toBe(true);
      if (readResult.ok && readResult.value) {
        expect(isManifestV2(readResult.value)).toBe(true);
        const readManifestData = readResult.value as ManifestV2;
        expect(readManifestData.files[0]?.hash).toBe('sha256:abc');
      }
    });
  });
});

