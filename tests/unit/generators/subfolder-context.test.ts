/**
 * @file Subfolder Context Generator Tests
 * @description Tests for subfolder context file generation
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  SubfolderContextGenerator,
  createSubfolderContextGenerator,
  type SubfolderContextConfig,
} from '../../../src/generators/subfolder-context.js';

import type { ResolvedContent } from '../../../src/generators/base.js';
import type { ParsedCommand } from '../../../src/parsers/command.js';
import type { ParsedPersona } from '../../../src/parsers/persona.js';
import type { ParsedRule } from '../../../src/parsers/rule.js';

// Helper to create mock resolved content
function createMockContent(overrides: Partial<ResolvedContent> = {}): ResolvedContent {
  return {
    projectRoot: '/test/project',
    rules: [],
    personas: [],
    commands: [],
    hooks: [],
    ...overrides,
  };
}

// Helper to create mock rule
function createMockRule(
  name: string,
  overrides: Partial<ParsedRule['frontmatter']> = {}
): ParsedRule {
  return {
    frontmatter: {
      name,
      always_apply: false,
      globs: [],
      targets: ['cursor', 'claude', 'factory'],
      requires: [],
      priority: 'medium',
      ...overrides,
    },
    content: `# ${name}\n\nThis is the ${name} rule content.`,
  };
}

// Helper to create mock persona
function createMockPersona(
  name: string,
  overrides: Partial<ParsedPersona['frontmatter']> = {}
): ParsedPersona {
  return {
    frontmatter: {
      name,
      tools: ['read', 'write', 'edit'],
      model: 'default',
      targets: ['cursor', 'claude', 'factory'],
      ...overrides,
    },
    content: `# ${name}\n\nThis is the ${name} persona.`,
  };
}

// Helper to create mock command
function createMockCommand(
  name: string,
  overrides: Partial<ParsedCommand['frontmatter']> = {}
): ParsedCommand {
  return {
    frontmatter: {
      name,
      args: [],
      targets: ['cursor', 'claude', 'factory'],
      ...overrides,
    },
    content: `# ${name}\n\nThis is the ${name} command.`,
  };
}

describe('SubfolderContextGenerator', () => {
  let generator: SubfolderContextGenerator;
  let tempDir: string;

  beforeEach(async () => {
    generator = createSubfolderContextGenerator();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'subfolder-gen-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('name property', () => {
    it('should have name "subfolder"', () => {
      expect(generator.name).toBe('subfolder');
    });
  });

  describe('generate() - no configurations', () => {
    it('should return warning when no subfolder configurations provided', async () => {
      const content = createMockContent({ projectRoot: tempDir });
      const result = await generator.generate(content);

      expect(result.files).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('No subfolder configurations');
    });
  });

  describe('generate() - with configurations', () => {
    it('should generate CLAUDE.md and AGENTS.md in configured subfolders', async () => {
      const subfolders: SubfolderContextConfig[] = [
        {
          path: 'packages/core',
          rules: ['core-rule'],
          personas: ['core-persona'],
        },
      ];

      generator.setSubfolders(subfolders);

      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('core-rule', { description: 'Core rule' })],
        personas: [createMockPersona('core-persona', { description: 'Core persona' })],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('packages/core/CLAUDE.md');
      expect(result.files).toContain('packages/core/AGENTS.md');

      // Verify files were created
      const claudeContent = await fs.readFile(
        path.join(tempDir, 'packages/core/CLAUDE.md'),
        'utf-8'
      );
      expect(claudeContent).toContain('# Claude Code Context');

      const agentsContent = await fs.readFile(
        path.join(tempDir, 'packages/core/AGENTS.md'),
        'utf-8'
      );
      expect(agentsContent).toContain('# AI Agents');
    });

    it('should only include specified rules in subfolder context', async () => {
      const subfolders: SubfolderContextConfig[] = [
        {
          path: 'apps/web',
          rules: ['web-rule'],
        },
      ];

      generator.setSubfolders(subfolders);

      const content = createMockContent({
        projectRoot: tempDir,
        rules: [
          createMockRule('web-rule', { description: 'Web rule' }),
          createMockRule('api-rule', { description: 'API rule' }),
          createMockRule('shared-rule', { description: 'Shared rule' }),
        ],
      });

      await generator.generate(content);

      const claudeContent = await fs.readFile(path.join(tempDir, 'apps/web/CLAUDE.md'), 'utf-8');
      expect(claudeContent).toContain('web-rule');
      expect(claudeContent).not.toContain('api-rule');
      expect(claudeContent).not.toContain('shared-rule');
    });

    it('should only include specified personas in subfolder context', async () => {
      const subfolders: SubfolderContextConfig[] = [
        {
          path: 'apps/mobile',
          personas: ['mobile-dev'],
        },
      ];

      generator.setSubfolders(subfolders);

      const content = createMockContent({
        projectRoot: tempDir,
        personas: [
          createMockPersona('mobile-dev', { description: 'Mobile developer' }),
          createMockPersona('backend-dev', { description: 'Backend developer' }),
        ],
      });

      await generator.generate(content);

      const claudeContent = await fs.readFile(path.join(tempDir, 'apps/mobile/CLAUDE.md'), 'utf-8');
      expect(claudeContent).toContain('mobile-dev');
      expect(claudeContent).not.toContain('backend-dev');
    });

    it('should include description in generated files', async () => {
      const subfolders: SubfolderContextConfig[] = [
        {
          path: 'packages/trade-engine',
          rules: ['trading'],
          description: 'Trade engine development context',
        },
      ];

      generator.setSubfolders(subfolders);

      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('trading')],
      });

      await generator.generate(content);

      const claudeContent = await fs.readFile(
        path.join(tempDir, 'packages/trade-engine/CLAUDE.md'),
        'utf-8'
      );
      expect(claudeContent).toContain('Trade engine development context');
    });

    it('should generate correct relative paths', async () => {
      const subfolders: SubfolderContextConfig[] = [
        {
          path: 'packages/deep/nested/folder',
          rules: ['nested-rule'],
        },
      ];

      generator.setSubfolders(subfolders);

      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('nested-rule')],
      });

      await generator.generate(content);

      const claudeContent = await fs.readFile(
        path.join(tempDir, 'packages/deep/nested/folder/CLAUDE.md'),
        'utf-8'
      );
      // Should have 4 levels of ../ to get back to root
      expect(claudeContent).toContain('../../../../.claude/skills');
    });
  });

  describe('generate() - target filtering', () => {
    it('should only generate CLAUDE.md when target is claude only', async () => {
      const subfolders: SubfolderContextConfig[] = [
        {
          path: 'claude-only-folder',
          rules: ['rule'],
          targets: ['claude'],
        },
      ];

      generator.setSubfolders(subfolders);

      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('rule')],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('claude-only-folder/CLAUDE.md');
      expect(result.files).not.toContain('claude-only-folder/AGENTS.md');
    });

    it('should only generate AGENTS.md when target is cursor/factory only', async () => {
      const subfolders: SubfolderContextConfig[] = [
        {
          path: 'factory-only-folder',
          rules: ['rule'],
          targets: ['factory'],
        },
      ];

      generator.setSubfolders(subfolders);

      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('rule')],
      });

      const result = await generator.generate(content);

      expect(result.files).not.toContain('factory-only-folder/CLAUDE.md');
      expect(result.files).toContain('factory-only-folder/AGENTS.md');
    });
  });

  describe('generate() - multiple subfolders', () => {
    it('should generate files for multiple subfolders', async () => {
      const subfolders: SubfolderContextConfig[] = [
        { path: 'packages/core', rules: ['core-rule'] },
        { path: 'packages/utils', rules: ['utils-rule'] },
        { path: 'apps/web', rules: ['web-rule'] },
      ];

      generator.setSubfolders(subfolders);

      const content = createMockContent({
        projectRoot: tempDir,
        rules: [
          createMockRule('core-rule'),
          createMockRule('utils-rule'),
          createMockRule('web-rule'),
        ],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('packages/core/CLAUDE.md');
      expect(result.files).toContain('packages/core/AGENTS.md');
      expect(result.files).toContain('packages/utils/CLAUDE.md');
      expect(result.files).toContain('packages/utils/AGENTS.md');
      expect(result.files).toContain('apps/web/CLAUDE.md');
      expect(result.files).toContain('apps/web/AGENTS.md');
    });
  });

  describe('generate() - options', () => {
    it('should add headers when addHeaders option is true', async () => {
      const subfolders: SubfolderContextConfig[] = [{ path: 'test-folder', rules: ['rule'] }];

      generator.setSubfolders(subfolders);

      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('rule')],
      });

      await generator.generate(content, { addHeaders: true });

      const claudeContent = await fs.readFile(path.join(tempDir, 'test-folder/CLAUDE.md'), 'utf-8');
      expect(claudeContent).toContain('DO NOT EDIT');
      expect(claudeContent).toContain('ai-tool-sync');
    });

    it('should not write files in dry run mode', async () => {
      const subfolders: SubfolderContextConfig[] = [{ path: 'dry-run-folder', rules: ['rule'] }];

      generator.setSubfolders(subfolders);

      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('rule')],
      });

      const result = await generator.generate(content, { dryRun: true });

      expect(result.files).toContain('dry-run-folder/CLAUDE.md');
      expect(result.generated).toBeDefined();

      // Verify files were not actually created
      await expect(fs.access(path.join(tempDir, 'dry-run-folder/CLAUDE.md'))).rejects.toThrow();
    });

    it('should accept subfolders via options', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('options-rule')],
      });

      const result = await generator.generate(content, {
        subfolders: [{ path: 'options-folder', rules: ['options-rule'] }],
      } as any);

      expect(result.files).toContain('options-folder/CLAUDE.md');
    });
  });

  describe('generate() - commands', () => {
    it('should include commands in subfolder context', async () => {
      const subfolders: SubfolderContextConfig[] = [
        {
          path: 'with-commands',
          commands: ['deploy'],
        },
      ];

      generator.setSubfolders(subfolders);

      const content = createMockContent({
        projectRoot: tempDir,
        commands: [
          createMockCommand('deploy', { description: 'Deploy command' }),
          createMockCommand('test', { description: 'Test command' }),
        ],
      });

      await generator.generate(content);

      const claudeContent = await fs.readFile(
        path.join(tempDir, 'with-commands/CLAUDE.md'),
        'utf-8'
      );
      expect(claudeContent).toContain('deploy');
      expect(claudeContent).not.toContain('test');
    });
  });
});

describe('createSubfolderContextGenerator', () => {
  it('should create a SubfolderContextGenerator instance', () => {
    const generator = createSubfolderContextGenerator();
    expect(generator).toBeInstanceOf(SubfolderContextGenerator);
    expect(generator.name).toBe('subfolder');
  });

  it('should accept initial subfolders configuration', () => {
    const subfolders: SubfolderContextConfig[] = [{ path: 'test', rules: ['rule'] }];
    const generator = createSubfolderContextGenerator(subfolders);
    expect(generator).toBeInstanceOf(SubfolderContextGenerator);
  });
});
