/**
 * @file Gitignore Utilities Tests
 * @description Tests for .gitignore management with auto-managed sections
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { fileExists, readFile } from '../../../src/utils/fs.js';
import {
  GITIGNORE_START_MARKER,
  GITIGNORE_END_MARKER,
  hasManagedSection,
  extractManagedSection,
  createManagedSection,
  updateGitignoreContent,
  getDefaultGitignorePaths,
  updateGitignore,
  removeManagedSection,
} from '../../../src/utils/gitignore.js';

import type { Manifest } from '../../../src/utils/manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESTS_TMP_DIR = path.resolve(__dirname, '..', '..', '.tmp');

describe('Gitignore Utilities', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(TESTS_TMP_DIR, `gitignore-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('hasManagedSection', () => {
    it('should return true when section exists', () => {
      const content = `node_modules/
${GITIGNORE_START_MARKER}
.cursor/rules/
${GITIGNORE_END_MARKER}
dist/`;

      expect(hasManagedSection(content)).toBe(true);
    });

    it('should return false when section does not exist', () => {
      const content = `node_modules/
.cursor/rules/
dist/`;

      expect(hasManagedSection(content)).toBe(false);
    });

    it('should return false when only start marker exists', () => {
      const content = `node_modules/
${GITIGNORE_START_MARKER}
.cursor/rules/`;

      expect(hasManagedSection(content)).toBe(false);
    });

    it('should return false when only end marker exists', () => {
      const content = `node_modules/
.cursor/rules/
${GITIGNORE_END_MARKER}`;

      expect(hasManagedSection(content)).toBe(false);
    });
  });

  describe('extractManagedSection', () => {
    it('should extract content between markers', () => {
      const content = `node_modules/
${GITIGNORE_START_MARKER}
.cursor/rules/
.claude/
${GITIGNORE_END_MARKER}
dist/`;

      const extracted = extractManagedSection(content);
      expect(extracted).toBe('.cursor/rules/\n.claude/');
    });

    it('should return null when no section exists', () => {
      const content = 'node_modules/\ndist/';
      expect(extractManagedSection(content)).toBeNull();
    });

    it('should return null when markers are in wrong order', () => {
      const content = `${GITIGNORE_END_MARKER}
.cursor/rules/
${GITIGNORE_START_MARKER}`;

      expect(extractManagedSection(content)).toBeNull();
    });
  });

  describe('createManagedSection', () => {
    it('should create a section with markers', () => {
      const paths = ['.cursor/rules/', '.claude/', 'CLAUDE.md'];
      const section = createManagedSection(paths);

      expect(section).toContain(GITIGNORE_START_MARKER);
      expect(section).toContain(GITIGNORE_END_MARKER);
      expect(section).toContain('.cursor/rules/');
      expect(section).toContain('.claude/');
      expect(section).toContain('CLAUDE.md');
    });

    it('should handle empty paths array', () => {
      const section = createManagedSection([]);

      expect(section).toContain(GITIGNORE_START_MARKER);
      expect(section).toContain(GITIGNORE_END_MARKER);
    });
  });

  describe('updateGitignoreContent', () => {
    it('should append section to empty gitignore', () => {
      const existing = '';
      const paths = ['.cursor/rules/', 'CLAUDE.md'];

      const updated = updateGitignoreContent(existing, paths);

      expect(hasManagedSection(updated)).toBe(true);
      expect(updated).toContain('.cursor/rules/');
      expect(updated).toContain('CLAUDE.md');
    });

    it('should append section to existing content', () => {
      const existing = `node_modules/
dist/
.env`;

      const paths = ['.cursor/rules/', 'CLAUDE.md'];
      const updated = updateGitignoreContent(existing, paths);

      expect(updated).toContain('node_modules/');
      expect(updated).toContain('dist/');
      expect(updated).toContain('.env');
      expect(hasManagedSection(updated)).toBe(true);
      expect(updated).toContain('.cursor/rules/');
      expect(updated).toContain('CLAUDE.md');
    });

    it('should replace existing managed section', () => {
      const existing = `node_modules/
${GITIGNORE_START_MARKER}
.old-cursor/
.old-claude/
${GITIGNORE_END_MARKER}
dist/`;

      const paths = ['.cursor/rules/', '.claude/', 'CLAUDE.md'];
      const updated = updateGitignoreContent(existing, paths);

      // Should have new paths
      expect(updated).toContain('.cursor/rules/');
      expect(updated).toContain('.claude/');
      expect(updated).toContain('CLAUDE.md');

      // Should not have old paths
      expect(updated).not.toContain('.old-cursor/');
      expect(updated).not.toContain('.old-claude/');

      // Should preserve content outside section
      expect(updated).toContain('node_modules/');
      expect(updated).toContain('dist/');

      // Should only have one managed section
      const startCount = (updated.match(new RegExp(GITIGNORE_START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      const endCount = (updated.match(new RegExp(GITIGNORE_END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      expect(startCount).toBe(1);
      expect(endCount).toBe(1);
    });

    it('should handle section at beginning of file', () => {
      const existing = `${GITIGNORE_START_MARKER}
.old/
${GITIGNORE_END_MARKER}
node_modules/`;

      const paths = ['.cursor/rules/'];
      const updated = updateGitignoreContent(existing, paths);

      expect(updated).toContain('.cursor/rules/');
      expect(updated).toContain('node_modules/');
      expect(updated).not.toContain('.old/');
    });

    it('should handle section at end of file', () => {
      const existing = `node_modules/
${GITIGNORE_START_MARKER}
.old/
${GITIGNORE_END_MARKER}`;

      const paths = ['.cursor/rules/'];
      const updated = updateGitignoreContent(existing, paths);

      expect(updated).toContain('.cursor/rules/');
      expect(updated).toContain('node_modules/');
      expect(updated).not.toContain('.old/');
    });
  });

  describe('getDefaultGitignorePaths', () => {
    it('should return expected default paths', () => {
      const paths = getDefaultGitignorePaths();

      expect(paths).toContain('.cursor/rules/');
      expect(paths).toContain('.cursor/commands/');
      expect(paths).toContain('.claude/');
      expect(paths).toContain('.factory/');
      expect(paths).toContain('CLAUDE.md');
      expect(paths).toContain('AGENTS.md');
      expect(paths).toContain('mcp.json');
      expect(paths).toContain('.ai-tool-sync-generated');
    });
  });

  describe('updateGitignore', () => {
    it('should not create gitignore when createIfMissing is false', async () => {
      const result = await updateGitignore(testDir, null, { createIfMissing: false });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.created).toBe(false);
        expect(result.value.changed).toBe(false);
      }
      expect(await fileExists(path.join(testDir, '.gitignore'))).toBe(false);
    });

    it('should create gitignore when createIfMissing is true', async () => {
      const result = await updateGitignore(testDir, null, { createIfMissing: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.created).toBe(true);
        expect(result.value.changed).toBe(true);
        expect(result.value.paths.length).toBeGreaterThan(0);
      }

      expect(await fileExists(path.join(testDir, '.gitignore'))).toBe(true);

      const content = await readFile(path.join(testDir, '.gitignore'));
      expect(content.ok).toBe(true);
      if (content.ok) {
        expect(hasManagedSection(content.value)).toBe(true);
      }
    });

    it('should update existing gitignore', async () => {
      // Create initial gitignore
      await fs.writeFile(
        path.join(testDir, '.gitignore'),
        'node_modules/\ndist/\n'
      );

      const result = await updateGitignore(testDir, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.created).toBe(false);
        expect(result.value.changed).toBe(true);
      }

      const content = await readFile(path.join(testDir, '.gitignore'));
      expect(content.ok).toBe(true);
      if (content.ok) {
        expect(content.value).toContain('node_modules/');
        expect(content.value).toContain('dist/');
        expect(hasManagedSection(content.value)).toBe(true);
      }
    });

    it('should use paths from manifest when provided', async () => {
      const manifest: Manifest = {
        version: '1.0.0',
        timestamp: '2024-01-15T10:30:00.000Z',
        files: ['CLAUDE.md', 'AGENTS.md'],
        directories: ['.cursor/rules/', '.claude/'],
      };

      const result = await updateGitignore(testDir, manifest, { createIfMissing: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.created).toBe(true);
        expect(result.value.paths).toContain('.cursor/rules/');
        expect(result.value.paths).toContain('.claude/');
        expect(result.value.paths).toContain('CLAUDE.md');
      }
    });

    it('should not change file when content is identical', async () => {
      // Create gitignore with managed section
      await updateGitignore(testDir, null, { createIfMissing: true });

      // Update again with same content
      const result = await updateGitignore(testDir, null);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.changed).toBe(false);
      }
    });

    it('should preserve existing manual entries', async () => {
      // Create gitignore with custom entries
      await fs.writeFile(
        path.join(testDir, '.gitignore'),
        `# Custom ignores
node_modules/
dist/
.env
*.log

# More custom
coverage/`
      );

      await updateGitignore(testDir, null);

      const content = await readFile(path.join(testDir, '.gitignore'));
      expect(content.ok).toBe(true);
      if (content.ok) {
        expect(content.value).toContain('# Custom ignores');
        expect(content.value).toContain('node_modules/');
        expect(content.value).toContain('dist/');
        expect(content.value).toContain('.env');
        expect(content.value).toContain('*.log');
        expect(content.value).toContain('# More custom');
        expect(content.value).toContain('coverage/');
        expect(hasManagedSection(content.value)).toBe(true);
      }
    });
  });

  describe('removeManagedSection', () => {
    it('should return false when no gitignore exists', async () => {
      const result = await removeManagedSection(testDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it('should return false when no managed section exists', async () => {
      await fs.writeFile(
        path.join(testDir, '.gitignore'),
        'node_modules/\ndist/\n'
      );

      const result = await removeManagedSection(testDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it('should remove managed section and preserve other content', async () => {
      await fs.writeFile(
        path.join(testDir, '.gitignore'),
        `node_modules/
${GITIGNORE_START_MARKER}
.cursor/rules/
.claude/
${GITIGNORE_END_MARKER}
dist/`
      );

      const result = await removeManagedSection(testDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }

      const content = await readFile(path.join(testDir, '.gitignore'));
      expect(content.ok).toBe(true);
      if (content.ok) {
        expect(content.value).toContain('node_modules/');
        expect(content.value).toContain('dist/');
        expect(hasManagedSection(content.value)).toBe(false);
        expect(content.value).not.toContain('.cursor/rules/');
        expect(content.value).not.toContain('.claude/');
      }
    });

    it('should handle managed section at beginning', async () => {
      await fs.writeFile(
        path.join(testDir, '.gitignore'),
        `${GITIGNORE_START_MARKER}
.cursor/
${GITIGNORE_END_MARKER}
node_modules/`
      );

      const result = await removeManagedSection(testDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }

      const content = await readFile(path.join(testDir, '.gitignore'));
      expect(content.ok).toBe(true);
      if (content.ok) {
        expect(content.value.trim()).toBe('node_modules/');
      }
    });

    it('should handle managed section at end', async () => {
      await fs.writeFile(
        path.join(testDir, '.gitignore'),
        `node_modules/
${GITIGNORE_START_MARKER}
.cursor/
${GITIGNORE_END_MARKER}`
      );

      const result = await removeManagedSection(testDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }

      const content = await readFile(path.join(testDir, '.gitignore'));
      expect(content.ok).toBe(true);
      if (content.ok) {
        expect(content.value.trim()).toBe('node_modules/');
      }
    });
  });
});

