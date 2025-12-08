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
    factorySettings: undefined,
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
function createMockHook(
  name: string,
  targets: ('cursor' | 'claude' | 'factory')[] = ['cursor', 'claude', 'factory'],
  overrides: Partial<ParsedHook['frontmatter']> = {}
): ParsedHook {
  return {
    frontmatter: {
      name,
      event: 'PreToolUse',
      targets: overrides.targets ?? targets,
      ...overrides,
    },
    content: `# ${name}\n\nThis is the ${name} hook.`,
  };
}

async function readSettings(tempDir: string): Promise<Record<string, unknown>> {
  const settingsContent = await fs.readFile(path.join(tempDir, '.factory/settings.json'), 'utf-8');
  return JSON.parse(settingsContent);
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

      await generator.generate(content);

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

    describe('frontmatter', () => {
      it('should include YAML frontmatter with name', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          rules: [createMockRule('test-skill')],
        });

        await generator.generate(content);

        const fileContent = await fs.readFile(
          path.join(tempDir, '.factory/skills/test-skill/SKILL.md'),
          'utf-8'
        );

        expect(fileContent).toContain('---');
        expect(fileContent).toContain('name: test-skill');
      });

      it('should include description in frontmatter when present', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          rules: [createMockRule('described-skill', { description: 'A skill with description' })],
        });

        await generator.generate(content);

        const fileContent = await fs.readFile(
          path.join(tempDir, '.factory/skills/described-skill/SKILL.md'),
          'utf-8'
        );

        expect(fileContent).toContain('name: described-skill');
        expect(fileContent).toContain('description: A skill with description');
      });

      it('should include allowed-tools when factory extension specifies', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          rules: [
            createMockRule('tool-restricted', {
              factory: {
                'allowed-tools': ['read', 'edit', 'search'],
              },
            }),
          ],
        });

        await generator.generate(content);

        const fileContent = await fs.readFile(
          path.join(tempDir, '.factory/skills/tool-restricted/SKILL.md'),
          'utf-8'
        );

        expect(fileContent).toContain('allowed-tools:');
        expect(fileContent).toContain('read');
        expect(fileContent).toContain('edit');
        expect(fileContent).toContain('search');
      });

      it('should include allowed-tools when factory.tools is specified', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          rules: [
            createMockRule('tools-alias', {
              factory: {
                tools: ['read', 'write'],
              },
            }),
          ],
        });

        await generator.generate(content);

        const fileContent = await fs.readFile(
          path.join(tempDir, '.factory/skills/tools-alias/SKILL.md'),
          'utf-8'
        );

        expect(fileContent).toContain('allowed-tools:');
        expect(fileContent).toContain('read');
        expect(fileContent).toContain('write');
      });

      it('should omit allowed-tools when not specified', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          rules: [createMockRule('no-tools')],
        });

        await generator.generate(content);

        const fileContent = await fs.readFile(
          path.join(tempDir, '.factory/skills/no-tools/SKILL.md'),
          'utf-8'
        );

        expect(fileContent).not.toContain('allowed-tools');
      });

      it('should omit allowed-tools when empty array', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          rules: [
            createMockRule('empty-tools', {
              factory: {
                'allowed-tools': [],
              },
            }),
          ],
        });

        await generator.generate(content);

        const fileContent = await fs.readFile(
          path.join(tempDir, '.factory/skills/empty-tools/SKILL.md'),
          'utf-8'
        );

        expect(fileContent).not.toContain('allowed-tools');
      });

      it('should map tool names using factory tool mapping', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          rules: [
            createMockRule('mapped-tools', {
              factory: {
                'allowed-tools': ['ls', 'execute'],
              },
            }),
          ],
        });

        await generator.generate(content);

        const fileContent = await fs.readFile(
          path.join(tempDir, '.factory/skills/mapped-tools/SKILL.md'),
          'utf-8'
        );

        // 'ls' maps to 'list' in Factory
        expect(fileContent).toContain('list');
        expect(fileContent).toContain('execute');
      });

      it('should have correct file structure with frontmatter', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          rules: [
            createMockRule('full-skill', {
              description: 'Full skill description',
              factory: {
                'allowed-tools': ['read'],
              },
            }),
          ],
        });

        await generator.generate(content);

        const fileContent = await fs.readFile(
          path.join(tempDir, '.factory/skills/full-skill/SKILL.md'),
          'utf-8'
        );

        // Check structure: frontmatter block, then title, then description
        const lines = fileContent.split('\n');
        const firstDash = lines.indexOf('---');
        const secondDash = lines.indexOf('---', firstDash + 1);

        expect(firstDash).toBeGreaterThanOrEqual(0);
        expect(secondDash).toBeGreaterThan(firstDash);

        // Title should come after frontmatter
        const titleIndex = lines.findIndex((l) => l.startsWith('# full-skill'));
        expect(titleIndex).toBeGreaterThan(secondDash);
      });

      it('should prefer allowed-tools over tools when both are specified', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          rules: [
            createMockRule('both-specified', {
              factory: {
                'allowed-tools': ['read', 'edit'],
                tools: ['write', 'search'],
              },
            }),
          ],
        });

        await generator.generate(content);

        const fileContent = await fs.readFile(
          path.join(tempDir, '.factory/skills/both-specified/SKILL.md'),
          'utf-8'
        );

        // Should use allowed-tools (read, edit) not tools (write, search)
        expect(fileContent).toContain('read');
        expect(fileContent).toContain('edit');
      });
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

      await generator.generate(content);

      const fileContent = await fs.readFile(
        path.join(tempDir, '.factory/droids/dev.md'),
        'utf-8'
      );
      expect(fileContent).toContain('read');
      expect(fileContent).toContain('write');
      expect(fileContent).toContain('execute');
      expect(fileContent).toContain('list'); // 'ls' maps to 'list' in Factory
    });

    describe('factory-specific overrides', () => {
      it('should prefer factory.tools over generic tools', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          personas: [
            createMockPersona('dev', {
              tools: ['read', 'write'],
              factory: {
                tools: ['execute', 'search'],
              },
            }),
          ],
        });

        await generator.generate(content);

        const fileContent = await fs.readFile(
          path.join(tempDir, '.factory/droids/dev.md'),
          'utf-8'
        );

        expect(fileContent).toContain('execute');
        expect(fileContent).toContain('search');
        expect(fileContent).not.toContain('- **Tools:** read');
      });

      it('should prefer factory.model over generic model', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          personas: [
            createMockPersona('dev', {
              model: 'fast',
              factory: {
                model: 'powerful',
              },
            }),
          ],
        });

        await generator.generate(content);

        const fileContent = await fs.readFile(
          path.join(tempDir, '.factory/droids/dev.md'),
          'utf-8'
        );

        expect(fileContent).toContain('**Model:** powerful');
        expect(fileContent).not.toContain('fast');
      });

      it('should include reasoningEffort when specified', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          personas: [
            createMockPersona('deep-thinker', {
              factory: {
                reasoningEffort: 'high',
              },
            }),
          ],
        });

        await generator.generate(content);

        const fileContent = await fs.readFile(
          path.join(tempDir, '.factory/droids/deep-thinker.md'),
          'utf-8'
        );

        expect(fileContent).toContain('**Reasoning Effort:** high');
      });

      it('should not include reasoningEffort when not specified', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          personas: [createMockPersona('basic-dev')],
        });

        await generator.generate(content);

        const fileContent = await fs.readFile(
          path.join(tempDir, '.factory/droids/basic-dev.md'),
          'utf-8'
        );

        expect(fileContent).not.toContain('Reasoning Effort');
      });

      it('should handle empty factory.tools as explicit restriction', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          personas: [
            createMockPersona('restricted', {
              tools: ['read', 'write', 'execute'],
              factory: {
                tools: [],
              },
            }),
          ],
        });

        await generator.generate(content);

        const fileContent = await fs.readFile(
          path.join(tempDir, '.factory/droids/restricted.md'),
          'utf-8'
        );

        expect(fileContent).not.toContain('**Tools:**');
      });

      it('should apply all factory-specific overrides together', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          personas: [
            createMockPersona('factory-agent', {
              tools: ['read'],
              model: 'fast',
              factory: {
                tools: ['execute', 'search', 'edit'],
                model: 'powerful',
                reasoningEffort: 'medium',
              },
            }),
          ],
        });

        await generator.generate(content);

        const fileContent = await fs.readFile(
          path.join(tempDir, '.factory/droids/factory-agent.md'),
          'utf-8'
        );

        expect(fileContent).toContain('**Model:** powerful');
        expect(fileContent).toContain('execute');
        expect(fileContent).toContain('search');
        expect(fileContent).toContain('edit');
        expect(fileContent).toContain('**Reasoning Effort:** medium');
      });
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

      await generator.generate(content);

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

  describe('generate() - hooks (settings.json)', () => {
    describe('basic hook generation', () => {
      it('should generate settings.json with hooks', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          hooks: [createMockHook('pre-commit', ['factory'])],
        });

        const result = await generator.generate(content);

        expect(result.files).toContain('.factory/settings.json');

        const settings = await readSettings(tempDir);
        const hooks = (settings as { hooks?: Record<string, unknown[]> }).hooks;
        expect(hooks?.PreToolUse).toBeDefined();
      });

      it('should not generate settings.json when no hooks or settings', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          rules: [createMockRule('some-rule')],
        });

        const result = await generator.generate(content);

        expect(result.files).not.toContain('.factory/settings.json');
      });
    });

    describe('event mapping', () => {
      it('should map PreToolUse event correctly', async () => {
        const hook = createMockHook('safety-check', ['factory'], {
          event: 'PreToolUse',
          execute: 'echo "checking..."',
          tool_match: 'Bash(*rm*)',
        });

        const content = createMockContent({
          projectRoot: tempDir,
          hooks: [hook],
        });

        await generator.generate(content);

        const settings = await readSettings(tempDir);
        const hooks = (settings as { hooks?: Record<string, unknown[]> }).hooks;

        expect(hooks?.PreToolUse).toHaveLength(1);
        expect(hooks?.PreToolUse?.[0].command).toBe('echo "checking..."');
        expect(hooks?.PreToolUse?.[0].matcher).toBe('Bash(*rm*)');
      });

      it('should map PostToolUse event correctly', async () => {
        const hook = createMockHook('post-check', ['factory'], {
          event: 'PostToolUse',
          execute: 'echo "done"',
        });

        const content = createMockContent({
          projectRoot: tempDir,
          hooks: [hook],
        });

        await generator.generate(content);

        const settings = await readSettings(tempDir);
        const hooks = (settings as { hooks?: Record<string, unknown[]> }).hooks;

        expect(hooks?.PostToolUse).toHaveLength(1);
        expect(hooks?.PostToolUse?.[0].command).toBe('echo "done"');
      });

      it('should skip unsupported events', async () => {
        const hook = createMockHook('unsupported', ['factory'], {
          // @ts-expect-error - intentionally using unsupported event for testing
          event: 'UnsupportedEvent',
        });

        const content = createMockContent({
          projectRoot: tempDir,
          hooks: [hook],
        });

        await generator.generate(content);

        const settings = await readSettings(tempDir);
        expect((settings as { hooks?: unknown }).hooks).toBeUndefined();
      });
    });

    describe('hook output format', () => {
      it('should include type, command, and matcher when present', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          factorySettings: {
            hooks: {
              PreToolUse: [
                {
                  command: 'npm test',
                  matcher: 'Bash(*rm*)',
                  type: 'validation',
                },
              ],
            },
          },
        });

        await generator.generate(content);

        const settings = await readSettings(tempDir);
        const hooks = (settings as { hooks?: Record<string, unknown[]> }).hooks;

        expect(hooks?.PreToolUse?.[0].type).toBe('validation');
        expect(hooks?.PreToolUse?.[0].command).toBe('npm test');
        expect(hooks?.PreToolUse?.[0].matcher).toBe('Bash(*rm*)');
      });

      it('should omit matcher when not specified', async () => {
        const hook = createMockHook('no-matcher', ['factory'], {
          event: 'PreToolUse',
          execute: 'echo "no matcher"',
          tool_match: '*',
        });

        const content = createMockContent({
          projectRoot: tempDir,
          hooks: [hook],
        });

        await generator.generate(content);

        const settings = await readSettings(tempDir);
        const hooks = (settings as { hooks?: Record<string, unknown[]> }).hooks;

        expect(hooks?.PreToolUse?.[0].matcher).toBeUndefined();
      });

      it('should include action and message for blocking hooks', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          factorySettings: {
            hooks: {
              PreToolUse: [
                {
                  command: 'echo "block"',
                  action: 'block',
                  message: 'Blocking action',
                },
              ],
            },
          },
        });

        await generator.generate(content);

        const settings = await readSettings(tempDir);
        const hooks = (settings as { hooks?: Record<string, unknown[]> }).hooks;

        expect(hooks?.PreToolUse?.[0].action).toBe('block');
        expect(hooks?.PreToolUse?.[0].message).toBe('Blocking action');
      });
    });

    describe('combined sources', () => {
      it('should merge hook files with config.yaml hooks', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          hooks: [
            createMockHook('file-hook', ['factory'], {
              event: 'PreToolUse',
              execute: 'echo "from file"',
            }),
          ],
          factorySettings: {
            hooks: {
              PreToolUse: [
                {
                  command: 'echo "from config"',
                },
              ],
            },
          },
        });

        await generator.generate(content);

        const settings = await readSettings(tempDir);
        const hooks = (settings as { hooks?: Record<string, unknown[]> }).hooks;

        expect(hooks?.PreToolUse).toHaveLength(2);
        expect(hooks?.PreToolUse?.[0].command).toBe('echo "from file"');
        expect(hooks?.PreToolUse?.[1].command).toBe('echo "from config"');
      });

      it('should include env vars in settings.json', async () => {
        const content = createMockContent({
          projectRoot: tempDir,
          factorySettings: {
            env: {
              NODE_ENV: 'test',
              FACTORY_CUSTOM: 'value',
            },
          },
        });

        await generator.generate(content);

        const settings = (await readSettings(tempDir)) as { env?: Record<string, string> };

        expect(settings.env?.NODE_ENV).toBe('test');
        expect(settings.env?.FACTORY_CUSTOM).toBe('value');
      });
    });

    it('should NOT warn about hooks anymore (hooks now supported)', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        hooks: [createMockHook('test-hook', ['factory'])],
      });

      const result = await generator.generate(content);

      expect(result.warnings).not.toContain(expect.stringContaining('does not support hooks'));
      expect(result.files).toContain('.factory/settings.json');
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

      await generator.generate(content);

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

      await generator.generate(content, { addHeaders: true });

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

describe('generate() - command variables', () => {
  let generator: FactoryGenerator;
  let tempDir: string;

  beforeEach(async () => {
    generator = createFactoryGenerator();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-var-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should preserve $ARGUMENTS in command content', async () => {
    const command = createMockCommand('deploy', {
      description: 'Deploy application',
    });
    command.content = 'Deploy with: $ARGUMENTS\n\nExecute the deployment.';

    const content = createMockContent({
      projectRoot: tempDir,
      commands: [command],
    });

    await generator.generate(content);

    const cmdContent = await fs.readFile(
      path.join(tempDir, '.factory/commands/deploy.md'),
      'utf-8'
    );
    expect(cmdContent).toContain('$ARGUMENTS');
    expect(cmdContent).toContain('## Variables');
    expect(cmdContent).toContain('User input after command name');
  });

  it('should detect $ARGUMENTS in execute field', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      commands: [
        createMockCommand('run', {
          execute: 'npm run $ARGUMENTS',
        }),
      ],
    });

    await generator.generate(content);

    const cmdContent = await fs.readFile(
      path.join(tempDir, '.factory/commands/run.md'),
      'utf-8'
    );
    expect(cmdContent).toContain('## Variables');
    expect(cmdContent).toContain('$ARGUMENTS');
    expect(cmdContent).toContain('User input after command name');
  });

  it('should document explicitly declared variables', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      commands: [
        {
          frontmatter: {
            name: 'custom',
            args: [],
            targets: ['factory'],
            variables: [
              { name: 'ARGUMENTS', description: 'Custom description' },
            ],
          },
          content: 'Run with $ARGUMENTS',
        },
      ],
    });

    await generator.generate(content);

    const cmdContent = await fs.readFile(
      path.join(tempDir, '.factory/commands/custom.md'),
      'utf-8'
    );
    expect(cmdContent).toContain('## Variables');
    expect(cmdContent).toContain('$ARGUMENTS');
    expect(cmdContent).toContain('Custom description');
  });

  it('should handle commands without variables', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      commands: [
        createMockCommand('simple', {
          description: 'A simple command',
        }),
      ],
    });

    await generator.generate(content);

    const cmdContent = await fs.readFile(
      path.join(tempDir, '.factory/commands/simple.md'),
      'utf-8'
    );
    expect(cmdContent).not.toContain('## Variables');
  });

  it('should detect $FACTORY_PROJECT_DIR', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      commands: [
        {
          frontmatter: {
            name: 'build',
            args: [],
            targets: ['factory'],
          },
          content: 'Build from $FACTORY_PROJECT_DIR/src',
        },
      ],
    });

    await generator.generate(content);

    const cmdContent = await fs.readFile(
      path.join(tempDir, '.factory/commands/build.md'),
      'utf-8'
    );
    expect(cmdContent).toContain('## Variables');
    expect(cmdContent).toContain('$FACTORY_PROJECT_DIR');
    expect(cmdContent).toContain('Project root directory');
  });

  it('should detect both variables when present', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      commands: [
        {
          frontmatter: {
            name: 'complex',
            args: [],
            targets: ['factory'],
          },
          content: 'Run $ARGUMENTS from $FACTORY_PROJECT_DIR',
        },
      ],
    });

    await generator.generate(content);

    const cmdContent = await fs.readFile(
      path.join(tempDir, '.factory/commands/complex.md'),
      'utf-8'
    );
    expect(cmdContent).toContain('## Variables');
    expect(cmdContent).toContain('$ARGUMENTS');
    expect(cmdContent).toContain('$FACTORY_PROJECT_DIR');
    expect(cmdContent).toContain('User input after command name');
    expect(cmdContent).toContain('Project root directory');
  });

  it('should not duplicate variables if declared and detected', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      commands: [
        {
          frontmatter: {
            name: 'nodupe',
            args: [],
            targets: ['factory'],
            variables: [
              { name: 'ARGUMENTS', description: 'My custom description' },
            ],
          },
          content: 'Execute $ARGUMENTS',
        },
      ],
    });

    await generator.generate(content);

    const cmdContent = await fs.readFile(
      path.join(tempDir, '.factory/commands/nodupe.md'),
      'utf-8'
    );
    
    // Should only list the variable once in the Variables section (with custom description)
    // Note: Body content will also contain $ARGUMENTS, but we're only checking the Variables list
    const lines = cmdContent.split('\n');
    const varStartIdx = lines.findIndex(l => l.trim() === '## Variables');
    const varEndIdx = lines.findIndex((l, i) => i > varStartIdx && l.startsWith('##'));
    const variablesLines = lines.slice(varStartIdx + 1, varEndIdx === -1 ? lines.length : varEndIdx);
    const variablesSection = variablesLines.join('\n');
    
    // Count how many times the variable is listed in the Variables section
    const variableListings = variablesSection.match(/^- `/gm) || [];
    expect(variableListings.length).toBe(1);
    expect(cmdContent).toContain('My custom description');
    expect(cmdContent).toContain('Execute $ARGUMENTS'); // Body content preserved
  });

  it('should preserve variable order (declared first, then detected)', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      commands: [
        {
          frontmatter: {
            name: 'order',
            args: [],
            targets: ['factory'],
            variables: [
              { name: 'CUSTOM', description: 'Custom var' },
            ],
          },
          content: 'Run with $ARGUMENTS',
        },
      ],
    });

    await generator.generate(content);

    const cmdContent = await fs.readFile(
      path.join(tempDir, '.factory/commands/order.md'),
      'utf-8'
    );
    
    const variablesSection = cmdContent.split('## Variables')[1]?.split('##')[0] || '';
    const customIndex = variablesSection.indexOf('$CUSTOM');
    const argumentsIndex = variablesSection.indexOf('$ARGUMENTS');
    
    expect(customIndex).toBeGreaterThan(-1);
    expect(argumentsIndex).toBeGreaterThan(-1);
    expect(customIndex).toBeLessThan(argumentsIndex);
  });
});

describe('createFactoryGenerator', () => {
  it('should create a FactoryGenerator instance', () => {
    const generator = createFactoryGenerator();
    expect(generator).toBeInstanceOf(FactoryGenerator);
    expect(generator.name).toBe('factory');
  });
});

describe('MCP generation', () => {
  let generator: FactoryGenerator;
  let tempDir: string;

  beforeEach(async () => {
    generator = new FactoryGenerator();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-mcp-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should generate mcp.json when MCP config is present', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      mcpConfig: {
        servers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
            targets: ['factory'],
            enabled: true,
          },
        },
      },
    });

    const result = await generator.generate(content);

    expect(result.files).toContain('.factory/mcp.json');
    const mcpContent = await fs.readFile(path.join(tempDir, '.factory/mcp.json'), 'utf-8');
    const mcpJson = JSON.parse(mcpContent);
    expect(mcpJson.mcpServers.filesystem).toBeDefined();
    expect(mcpJson.mcpServers.filesystem.command).toBe('npx');
  });

  it('should NOT add experimental warning for Factory MCP (T208)', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      mcpConfig: {
        servers: {
          test: {
            command: 'test',
            targets: ['factory'],
            enabled: true,
          },
        },
      },
    });

    const result = await generator.generate(content);

    expect(result.warnings.some(w => w.includes('experimental'))).toBe(false);
  });

  it('should not generate mcp.json when no MCP config', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
    });

    const result = await generator.generate(content);

    expect(result.files).not.toContain('.factory/mcp.json');
  });

  it('should filter MCP servers by factory target', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      mcpConfig: {
        servers: {
          factoryOnly: {
            command: 'factory-server',
            targets: ['factory'],
            enabled: true,
          },
          cursorOnly: {
            command: 'cursor-server',
            targets: ['cursor'],
            enabled: true,
          },
        },
      },
    });

    const result = await generator.generate(content);

    expect(result.files).toContain('.factory/mcp.json');
    const mcpContent = await fs.readFile(path.join(tempDir, '.factory/mcp.json'), 'utf-8');
    const mcpJson = JSON.parse(mcpContent);
    expect(mcpJson.mcpServers.factoryOnly).toBeDefined();
    expect(mcpJson.mcpServers.cursorOnly).toBeUndefined();
  });

  it('should include type: "stdio" for command servers (T208)', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      mcpConfig: {
        servers: {
          local: {
            command: 'node',
            args: ['server.js'],
            targets: ['factory'],
            enabled: true,
          },
        },
      },
    });

    await generator.generate(content);

    const mcpContent = await fs.readFile(path.join(tempDir, '.factory/mcp.json'), 'utf-8');
    const mcpJson = JSON.parse(mcpContent);
    expect(mcpJson.mcpServers.local.type).toBe('stdio');
  });

  it('should include type: "http" for URL servers (T208)', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      mcpConfig: {
        servers: {
          remote: {
            url: 'https://api.example.com/mcp',
            targets: ['factory'],
            enabled: true,
          },
        },
      },
    });

    await generator.generate(content);

    const mcpContent = await fs.readFile(path.join(tempDir, '.factory/mcp.json'), 'utf-8');
    const mcpJson = JSON.parse(mcpContent);
    expect(mcpJson.mcpServers.remote.type).toBe('http');
  });

  it('should handle mixed stdio and http servers with correct types (T208)', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      mcpConfig: {
        servers: {
          local: {
            command: 'npx',
            args: ['mcp-server'],
            targets: ['factory'],
            enabled: true,
          },
          remote: {
            url: 'https://mcp.example.com',
            headers: { Authorization: 'Bearer token' },
            targets: ['factory'],
            enabled: true,
          },
        },
      },
    });

    await generator.generate(content);

    const mcpContent = await fs.readFile(path.join(tempDir, '.factory/mcp.json'), 'utf-8');
    const mcpJson = JSON.parse(mcpContent);
    expect(mcpJson.mcpServers.local.type).toBe('stdio');
    expect(mcpJson.mcpServers.local.command).toBe('npx');
    expect(mcpJson.mcpServers.remote.type).toBe('http');
    expect(mcpJson.mcpServers.remote.url).toBe('https://mcp.example.com');
  });
});

