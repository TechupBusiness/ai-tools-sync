/**
 * @file Include Resolver Tests
 * @description Tests for resolving @include directives in markdown content.
 */

import fs from 'node:fs/promises';
import * as path from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  extractBodyContent,
  findIncludes,
  resolveIncludes,
} from '../../../src/transformers/include-resolver.js';

const FIXTURES_PATH = path.join(__dirname, '../../fixtures/includes');

async function readFixture(fileName: string): Promise<string> {
  return fs.readFile(path.join(FIXTURES_PATH, fileName), 'utf-8');
}

describe('Include Resolver', () => {
  describe('resolveIncludes', () => {
    it('should return unchanged content when no includes', async () => {
      const content = '# Title\n\nNo includes here.';
      const result = await resolveIncludes(content, path.join(FIXTURES_PATH, 'no-include.md'), {
        baseDir: FIXTURES_PATH,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe(content);
        expect(result.value.hasIncludes).toBe(false);
        expect(result.value.includedFiles).toHaveLength(0);
      }
    });

    it('should resolve single include', async () => {
      const content = '# My Rule\n\n@include base.md\n\nMore content here.';
      const result = await resolveIncludes(content, path.join(FIXTURES_PATH, 'with-include.md'), {
        baseDir: FIXTURES_PATH,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('This is the base content.');
        expect(result.value.content).toContain('# My Rule');
        expect(result.value.content).toContain('More content here.');
        expect(result.value.content).not.toContain('@include');
        expect(result.value.hasIncludes).toBe(true);
        expect(result.value.includedFiles).toEqual([path.join(FIXTURES_PATH, 'base.md')]);
      }
    });

    it('should resolve multiple includes in order', async () => {
      const content = ['Intro', '@include base.md', 'Middle', '@include nested-c.md', 'Outro'].join('\n');
      const result = await resolveIncludes(content, path.join(FIXTURES_PATH, 'multi.md'), {
        baseDir: FIXTURES_PATH,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('Intro');
        expect(result.value.content).toContain('This is the base content.');
        expect(result.value.content).toContain('Content from C.');
        expect(result.value.includedFiles).toEqual([
          path.join(FIXTURES_PATH, 'base.md'),
          path.join(FIXTURES_PATH, 'nested-c.md'),
        ]);
      }
    });

    it('should resolve nested includes', async () => {
      const content = '@include nested-a.md';
      const result = await resolveIncludes(content, path.join(FIXTURES_PATH, 'nested-entry.md'), {
        baseDir: FIXTURES_PATH,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('Start of A.');
        expect(result.value.content).toContain('Start of B.');
        expect(result.value.content).toContain('Content from C.');
        expect(result.value.content).toContain('End of B.');
        expect(result.value.content).toContain('End of A.');
        expect(result.value.includedFiles).toEqual([
          path.join(FIXTURES_PATH, 'nested-a.md'),
          path.join(FIXTURES_PATH, 'nested-b.md'),
          path.join(FIXTURES_PATH, 'nested-c.md'),
        ]);
      }
    });

    it('should strip frontmatter from included files', async () => {
      const content = '@include with-frontmatter.md';
      const result = await resolveIncludes(content, path.join(FIXTURES_PATH, 'frontmatter-source.md'), {
        baseDir: FIXTURES_PATH,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('# Included Content');
        expect(result.value.content).not.toContain('name: included');
        expect(result.value.content).not.toContain('---');
      }
    });

    it('should detect direct circular include', async () => {
      const content = await readFixture('self.md');
      const result = await resolveIncludes(content, path.join(FIXTURES_PATH, 'self.md'), {
        baseDir: FIXTURES_PATH,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CIRCULAR_INCLUDE');
        expect(result.error.chain).toBeDefined();
      }
    });

    it('should detect indirect circular include', async () => {
      const content = await readFixture('circular-a.md');
      const result = await resolveIncludes(content, path.join(FIXTURES_PATH, 'circular-a.md'), {
        baseDir: FIXTURES_PATH,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CIRCULAR_INCLUDE');
        expect(result.error.chain).toBeDefined();
        expect(result.error.chain?.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should error on missing include file', async () => {
      const content = '@include missing.md';
      const result = await resolveIncludes(content, path.join(FIXTURES_PATH, 'missing.md'), {
        baseDir: FIXTURES_PATH,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('FILE_NOT_FOUND');
      }
    });

    it('should error when max depth exceeded', async () => {
      const content = '@include nested-a.md';
      const result = await resolveIncludes(content, path.join(FIXTURES_PATH, 'deep-limit.md'), {
        baseDir: FIXTURES_PATH,
        maxDepth: 0,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MAX_DEPTH_EXCEEDED');
      }
    });

    it('should handle include with leading whitespace', async () => {
      const content = '  @include base.md';
      const result = await resolveIncludes(content, path.join(FIXTURES_PATH, 'leading.md'), {
        baseDir: FIXTURES_PATH,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('This is the base content.');
      }
    });

    it('should handle sibling includes', async () => {
      const content = '@include base.md\n@include nested-c.md';
      const result = await resolveIncludes(content, path.join(FIXTURES_PATH, 'siblings.md'), {
        baseDir: FIXTURES_PATH,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.includedFiles).toEqual([
          path.join(FIXTURES_PATH, 'base.md'),
          path.join(FIXTURES_PATH, 'nested-c.md'),
        ]);
      }
    });

    it('should handle empty included file', async () => {
      const content = 'Before\n@include empty.md\nAfter';
      const result = await resolveIncludes(content, path.join(FIXTURES_PATH, 'empty-source.md'), {
        baseDir: FIXTURES_PATH,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toContain('Before');
        expect(result.value.content).toContain('After');
        expect(result.value.content).not.toContain('@include');
      }
    });

    it('should not process includes in frontmatter', async () => {
      const raw = ['---', 'title: test', '@include base.md', '---', '', 'Body only'].join('\n');
      const body = extractBodyContent(raw);
      const result = await resolveIncludes(body, path.join(FIXTURES_PATH, 'frontmatter.md'), {
        baseDir: FIXTURES_PATH,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content.trim()).toBe('Body only');
        expect(result.value.hasIncludes).toBe(false);
      }
    });

    it('should resolve relative paths correctly', async () => {
      const content = await readFixture('sub/main.md');
      const result = await resolveIncludes(content, path.join(FIXTURES_PATH, 'sub/main.md'), {
        baseDir: path.join(FIXTURES_PATH, 'sub'),
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.includedFiles[0]).toBe(path.join(FIXTURES_PATH, 'base.md'));
        expect(result.value.content).toContain('This is the base content.');
      }
    });
  });

  describe('findIncludes', () => {
    it('should find single include', () => {
      const matches = findIncludes('@include file.md');

      expect(matches).toHaveLength(1);
      expect(matches[0]?.path).toBe('file.md');
    });

    it('should find multiple includes', () => {
      const matches = findIncludes('@include first.md\ntext\n@include second.md');

      expect(matches).toHaveLength(2);
      expect(matches[0]?.path).toBe('first.md');
      expect(matches[1]?.path).toBe('second.md');
    });

    it('should return empty array when no includes', () => {
      const matches = findIncludes('No includes here.');

      expect(matches).toHaveLength(0);
    });

    it('should match only .md files', () => {
      const matches = findIncludes('@include not-a-markdown.txt');

      expect(matches).toHaveLength(0);
    });
  });

  describe('extractBodyContent', () => {
    it('should strip frontmatter', () => {
      const content = ['---', 'name: test', '---', '', 'Body content'].join('\n');
      const body = extractBodyContent(content);

      expect(body.trim()).toBe('Body content');
    });

    it('should return content as-is when no frontmatter', () => {
      const content = 'No frontmatter here.';
      const body = extractBodyContent(content);

      expect(body).toBe(content);
    });
  });
});
