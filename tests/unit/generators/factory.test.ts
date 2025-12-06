/**
 * @file Factory Generator Tests
 * @description Tests for Factory output generation
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { FactoryGenerator, createFactoryGenerator } from '../../../src/generators/factory.js';

import type { ResolvedContent } from '../../../src/generators/base.js';
import type { ParsedCommand } from '../../../src/parsers/command.js';
import type { ParsedHook } from '../../../src/parsers/hook.js';
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
function createMockRule(name: string, overrides: Partial<ParsedRule['frontmatter']> = {}): ParsedRule {
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
function createMockPersona(name: string, overrides: Partial<ParsedPersona['frontmatter']> = {}): ParsedPersona {
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
function createMockCommand(name: string, overrides: Partial<ParsedCommand['frontmatter']> = {}): ParsedCommand {
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

// Helper to create mock hook
function createMockHook(name: string, targets: ('cursor' | 'claude' | 'factory')[] = ['cursor', 'claude', 'factory']): ParsedHook {
  return {
    frontmatter: {
      name,
      event: 'PreToolUse',
      targets,
    },
    content: `# ${name}\n\nThis is the ${name} hook.`,
  };
}

describe('FactoryGenerator', () => {
  let generator: FactoryGenerator;
  let tempDir: string;

  beforeEach(async () => {
    generator = createFactoryGenerator();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-gen-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('name property', () => {
    it('should have name "factory"', () => {
      expect(generator.name).toBe('factory');
    });
  });

  describe('generate() - empty content', () => {
    it('should generate AGENTS.md even for empty content', async () => {
      const content = createMockContent({ projectRoot: tempDir });
      const result = await generator.generate(content);

      expect(result.files).toContain('AGENTS.md');
    });
  });

  describe('generate() - skills (rules)', () => {
    it('should generate SKILL.md files in skill directories', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [
          createMockRule('database', { description: 'Database rules' }),
          createMockRule('testing', { description: 'Testing rules' }),
        ],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.factory/skills/database/SKILL.md');
      expect(result.files).toContain('.factory/skills/testing/SKILL.md');

      // Verify file content
      const dbContent = await fs.readFile(
        path.join(tempDir, '.factory/skills/database/SKILL.md'),
        'utf-8'
      );
      expect(dbContent).toContain('# database');
      expect(dbContent).toContain('> Database rules');
    });

    it('should include metadata for always_apply rules', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('core', { always_apply: true })],
      });

      const result = await generator.generate(content);

      const fileContent = await fs.readFile(
        path.join(tempDir, '.factory/skills/core/SKILL.md'),
        'utf-8'
      );
      expect(fileContent).toContain('**Always Active**');
    });

    it('should filter rules that do not target factory', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [
          createMockRule('factory-only', { targets: ['factory'] }),
          createMockRule('cursor-only', { targets: ['cursor'] }),
        ],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.factory/skills/factory-only/SKILL.md');
      expect(result.files).not.toContain('.factory/skills/cursor-only/SKILL.md');
    });
  });

  describe('generate() - droids (personas)', () => {
    it('should generate droid files in droids directory', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        personas: [
          createMockPersona('architect', { description: 'System architect' }),
          createMockPersona('implementer', { description: 'Code implementer' }),
        ],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.factory/droids/architect.md');
      expect(result.files).toContain('.factory/droids/implementer.md');

      const architectContent = await fs.readFile(
        path.join(tempDir, '.factory/droids/architect.md'),
        'utf-8'
      );
      expect(architectContent).toContain('# architect');
      expect(architectContent).toContain('> System architect');
    });

    it('should map tools to Factory-specific names (lowercase)', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        personas: [createMockPersona('dev', { tools: ['read', 'write', 'execute', 'ls'] })],
      });

      const result = await generator.generate(content);

      const fileContent = await fs.readFile(
        path.join(tempDir, '.factory/droids/dev.md'),
        'utf-8'
      );
      expect(fileContent).toContain('read');
      expect(fileContent).toContain('write');
      expect(fileContent).toContain('execute');
      expect(fileContent).toContain('list'); // 'ls' maps to 'list' in Factory
    });
  });

  describe('generate() - commands', () => {
    it('should generate command files in commands directory', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        commands: [
          createMockCommand('deploy', { description: 'Deploy command', execute: 'npm run deploy' }),
          createMockCommand('test', { description: 'Run tests', execute: 'npm test' }),
        ],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.factory/commands/deploy.md');
      expect(result.files).toContain('.factory/commands/test.md');

      const deployContent = await fs.readFile(
        path.join(tempDir, '.factory/commands/deploy.md'),
        'utf-8'
      );
      expect(deployContent).toContain('# deploy');
      expect(deployContent).toContain('> Deploy command');
      expect(deployContent).toContain('npm run deploy');
    });

    it('should include arguments section when args are defined', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        commands: [
          createMockCommand('build', {
            args: [
              { name: 'env', type: 'string', default: 'development', choices: ['development', 'production'] },
              { name: 'watch', type: 'boolean', required: true },
            ],
          }),
        ],
      });

      const result = await generator.generate(content);

      const cmdContent = await fs.readFile(
        path.join(tempDir, '.factory/commands/build.md'),
        'utf-8'
      );
      expect(cmdContent).toContain('## Arguments');
      expect(cmdContent).toContain('**env**');
      expect(cmdContent).toContain('string');
      expect(cmdContent).toContain('[default: development]');
      expect(cmdContent).toContain('**watch**');
      expect(cmdContent).toContain('(required)');
    });
  });

  describe('generate() - hooks', () => {
    it('should warn and skip hooks (not supported)', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        hooks: [createMockHook('pre-commit')],
      });

      const result = await generator.generate(content);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('does not support hooks');
      expect(result.warnings[0]).toContain('1 hook(s) will be skipped');
    });
  });

  describe('generate() - AGENTS.md', () => {
    it('should generate AGENTS.md entry point', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        projectName: 'test-project',
        rules: [
          createMockRule('core', { always_apply: true, description: 'Core rules' }),
          createMockRule('database', { globs: ['**/*.sql'], description: 'DB rules' }),
        ],
        personas: [createMockPersona('architect', { description: 'System architect' })],
        commands: [createMockCommand('deploy', { description: 'Deploy command' })],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('AGENTS.md');

      const agentsContent = await fs.readFile(path.join(tempDir, 'AGENTS.md'), 'utf-8');
      expect(agentsContent).toContain('# AI Agents');
      expect(agentsContent).toContain('test-project');
      expect(agentsContent).toContain('## Required Skills');
      expect(agentsContent).toContain('core');
      expect(agentsContent).toContain('## Available Skills');
      expect(agentsContent).toContain('database');
      expect(agentsContent).toContain('## Available Droids');
      expect(agentsContent).toContain('architect');
      expect(agentsContent).toContain('## Available Commands');
      expect(agentsContent).toContain('deploy');
    });

    it('should link to skills, droids, and commands', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('my-rule')],
        personas: [createMockPersona('my-persona')],
        commands: [createMockCommand('my-command')],
      });

      const result = await generator.generate(content);

      const agentsContent = await fs.readFile(path.join(tempDir, 'AGENTS.md'), 'utf-8');
      expect(agentsContent).toContain('.factory/skills/my-rule/SKILL.md');
      expect(agentsContent).toContain('.factory/droids/my-persona.md');
      expect(agentsContent).toContain('.factory/commands/my-command.md');
    });
  });

  describe('generate() - options', () => {
    it('should add headers when addHeaders option is true', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('test-rule')],
      });

      const result = await generator.generate(content, { addHeaders: true });

      const fileContent = await fs.readFile(
        path.join(tempDir, '.factory/skills/test-rule/SKILL.md'),
        'utf-8'
      );
      expect(fileContent).toContain('DO NOT EDIT');
      expect(fileContent).toContain('ai-tool-sync');
    });

    it('should not write files in dry run mode', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('test-rule')],
      });

      const result = await generator.generate(content, { dryRun: true });

      expect(result.files).toContain('.factory/skills/test-rule/SKILL.md');
      expect(result.generated).toBeDefined();

      // Verify files were not actually created
      await expect(
        fs.access(path.join(tempDir, '.factory/skills/test-rule/SKILL.md'))
      ).rejects.toThrow();
    });

    it('should clean existing files when clean option is true', async () => {
      // Create existing files
      const skillsDir = path.join(tempDir, '.factory/skills/old-skill');
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.writeFile(path.join(skillsDir, 'SKILL.md'), 'old content');

      const droidsDir = path.join(tempDir, '.factory/droids');
      await fs.mkdir(droidsDir, { recursive: true });
      await fs.writeFile(path.join(droidsDir, 'old-droid.md'), 'old content');

      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('new-rule')],
      });

      const result = await generator.generate(content, { clean: true });

      expect(result.files).toContain('.factory/skills/new-rule/SKILL.md');
      expect(result.deleted.length).toBeGreaterThan(0);
    });
  });

  describe('file naming', () => {
    it('should convert names with spaces to hyphens', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('My Test Rule')],
        personas: [createMockPersona('My Test Persona')],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.factory/skills/my-test-rule/SKILL.md');
      expect(result.files).toContain('.factory/droids/my-test-persona.md');
    });

    it('should convert names with special characters to safe filenames', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('rule/with:special@chars')],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.factory/skills/rule-with-special-chars/SKILL.md');
    });
  });
});

describe('createFactoryGenerator', () => {
  it('should create a FactoryGenerator instance', () => {
    const generator = createFactoryGenerator();
    expect(generator).toBeInstanceOf(FactoryGenerator);
    expect(generator.name).toBe('factory');
  });
});

