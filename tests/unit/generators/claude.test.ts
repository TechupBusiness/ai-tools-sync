/**
 * @file Claude Generator Tests
 * @description Tests for Claude Code output generation
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { ClaudeGenerator, createClaudeGenerator } from '../../../src/generators/claude.js';

import type { ResolvedContent } from '../../../src/generators/base.js';
import type { ParsedCommand } from '../../../src/parsers/command.js';
import type { ParsedHook , HookEvent } from '../../../src/parsers/hook.js';
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
function createMockHook(
  name: string, 
  event: HookEvent = 'PreToolUse', 
  overrides: Partial<ParsedHook['frontmatter']> & { claude?: any } = {}
): ParsedHook {
  const { claude, ...frontmatterOverrides } = overrides;
  
  const frontmatter: ParsedHook['frontmatter'] = {
    name,
    event,
    targets: ['claude'],
    ...frontmatterOverrides,
  };
  
  if (claude) {
    frontmatter.claude = claude;
  }
  
  return {
    frontmatter,
    content: `# ${name}\n\nThis is the ${name} hook.`,
  };
}

describe('ClaudeGenerator', () => {
  let generator: ClaudeGenerator;
  let tempDir: string;

  beforeEach(async () => {
    generator = createClaudeGenerator();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-gen-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('name property', () => {
    it('should have name "claude"', () => {
      expect(generator.name).toBe('claude');
    });
  });

  describe('generate() - empty content', () => {
    it('should generate CLAUDE.md even for empty content', async () => {
      const content = createMockContent({ projectRoot: tempDir });
      const result = await generator.generate(content);

      expect(result.files).toContain('CLAUDE.md');
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

      expect(result.files).toContain('.claude/skills/database/SKILL.md');
      expect(result.files).toContain('.claude/skills/testing/SKILL.md');

      // Verify file content
      const dbContent = await fs.readFile(
        path.join(tempDir, '.claude/skills/database/SKILL.md'),
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
        path.join(tempDir, '.claude/skills/core/SKILL.md'),
        'utf-8'
      );
      expect(fileContent).toContain('**Always Active**');
    });

    it('should include globs metadata', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('styles', { globs: ['**/*.css', '**/*.scss'] })],
      });

      await generator.generate(content);

      const fileContent = await fs.readFile(
        path.join(tempDir, '.claude/skills/styles/SKILL.md'),
        'utf-8'
      );
      expect(fileContent).toContain('**Triggers:**');
      expect(fileContent).toContain('**/*.css');
      expect(fileContent).toContain('**/*.scss');
    });

    it('should filter rules that do not target claude', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [
          createMockRule('claude-only', { targets: ['claude'] }),
          createMockRule('cursor-only', { targets: ['cursor'] }),
        ],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.claude/skills/claude-only/SKILL.md');
      expect(result.files).not.toContain('.claude/skills/cursor-only/SKILL.md');
    });
  });

  describe('generate() - agents (personas)', () => {
    it('should generate agent files in agents directory', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        personas: [
          createMockPersona('architect', { description: 'System architect' }),
          createMockPersona('implementer', { description: 'Code implementer' }),
        ],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.claude/agents/architect.md');
      expect(result.files).toContain('.claude/agents/implementer.md');

      const architectContent = await fs.readFile(
        path.join(tempDir, '.claude/agents/architect.md'),
        'utf-8'
      );
      expect(architectContent).toContain('# architect');
      expect(architectContent).toContain('> System architect');
    });

    it('should map tools to Claude-specific names', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        personas: [createMockPersona('dev', { tools: ['read', 'write', 'execute'] })],
      });

      await generator.generate(content);

      const fileContent = await fs.readFile(
        path.join(tempDir, '.claude/agents/dev.md'),
        'utf-8'
      );
      expect(fileContent).toContain('Read');
      expect(fileContent).toContain('Write'); // 'write' stays as 'Write' in Claude
      expect(fileContent).toContain('Bash'); // 'execute' maps to 'Bash' in Claude
    });

    it('should prefer claude-specific tools and model overrides', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        personas: [
          createMockPersona('claude-dev', {
            tools: ['read'],
            model: 'fast',
            claude: {
              tools: ['execute', 'search'],
              model: 'powerful',
            },
          }),
        ],
      });

      await generator.generate(content);

      const fileContent = await fs.readFile(
        path.join(tempDir, '.claude/agents/claude-dev.md'),
        'utf-8'
      );

      expect(fileContent).toContain('- **Tools:** Bash, Search');
      expect(fileContent).toContain('claude-sonnet-4-20250514'); // mapped powerful model
      expect(fileContent).not.toContain('claude-3-5-haiku-20241022'); // fast is overridden
    });

    it('should include model configuration', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        personas: [createMockPersona('fast-dev', { model: 'fast' })],
      });

      await generator.generate(content);

      const fileContent = await fs.readFile(
        path.join(tempDir, '.claude/agents/fast-dev.md'),
        'utf-8'
      );
      expect(fileContent).toContain('## Configuration');
      expect(fileContent).toContain('**Model:**');
    });
  });

  describe('generate() - hooks (Claude format)', () => {
    it('should generate settings.json with correct Claude hook format', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        hooks: [
          createMockHook('lint-check', 'PreToolUse', {
            tool_match: 'Bash(git commit*)',
            execute: 'npm run lint',
          }),
        ],
      });

      const result = await generator.generate(content);
      expect(result.files).toContain('.claude/settings.json');

      const settingsContent = await fs.readFile(
        path.join(tempDir, '.claude/settings.json'),
        'utf-8'
      );
      const settings = JSON.parse(settingsContent);

      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.PreToolUse).toBeDefined();
      expect(settings.hooks.PreToolUse).toHaveLength(1);

      // Verify correct format (not old format)
      const hook = settings.hooks.PreToolUse[0];
      expect(hook.type).toBe('command');
      expect(hook.command).toBe('npm run lint');
      expect(hook.matcher).toBe('Bash(git commit*)');

      // Verify old format NOT used
      expect(hook.hooks).toBeUndefined();
    });

    it('should group hooks by event type', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        hooks: [
          createMockHook('pre-hook-1', 'PreToolUse', { execute: 'cmd1' }),
          createMockHook('post-hook-1', 'PostToolUse', { execute: 'cmd2' }),
          createMockHook('pre-hook-2', 'PreToolUse', { execute: 'cmd3' }),
        ],
      });

      await generator.generate(content);

      const settingsContent = await fs.readFile(
        path.join(tempDir, '.claude/settings.json'),
        'utf-8'
      );
      const settings = JSON.parse(settingsContent);

      expect(settings.hooks.PreToolUse).toHaveLength(2);
      expect(settings.hooks.PostToolUse).toHaveLength(1);
    });

    it('should map PreMessage to UserPromptSubmit', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        hooks: [createMockHook('prompt-check', 'PreMessage', { execute: 'echo check' })],
      });

      await generator.generate(content);
      const settingsContent = await fs.readFile(
        path.join(tempDir, '.claude/settings.json'),
        'utf-8'
      );
      const settings = JSON.parse(settingsContent);

      expect(settings.hooks.PreMessage).toBeUndefined();
      expect(settings.hooks.UserPromptSubmit).toBeDefined();
      expect(settings.hooks.UserPromptSubmit[0].command).toBe('echo check');
    });

    it('should map PreCommit to PreToolUse with default matcher', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        hooks: [createMockHook('pre-commit', 'PreCommit', { execute: 'npm run lint' })],
      });

      await generator.generate(content);
      const settingsContent = await fs.readFile(
        path.join(tempDir, '.claude/settings.json'),
        'utf-8'
      );
      const settings = JSON.parse(settingsContent);

      expect(settings.hooks.PreCommit).toBeUndefined();
      expect(settings.hooks.PreToolUse).toBeDefined();
      expect(settings.hooks.PreToolUse[0].matcher).toBe('Bash(git commit*)');
    });

    it('should support claude extension for action and message', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        hooks: [
          createMockHook('safety-check', 'PreToolUse', {
            tool_match: 'Bash(*rm*)',
            execute: './scripts/safety.sh',
            claude: {
              action: 'block',
              message: 'Destructive command blocked',
            },
          }),
        ],
      });

      await generator.generate(content);
      const settingsContent = await fs.readFile(
        path.join(tempDir, '.claude/settings.json'),
        'utf-8'
      );
      const settings = JSON.parse(settingsContent);

      const hook = settings.hooks.PreToolUse[0];
      expect(hook.action).toBe('block');
      expect(hook.message).toBe('Destructive command blocked');
    });

    it('should combine hooks from files and config.yaml', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        hooks: [createMockHook('file-hook', 'PreToolUse', { execute: 'cmd1' })],
        claudeSettings: {
          hooks: {
            PreToolUse: [{ command: 'cmd2', matcher: 'Edit' }],
          },
        },
      });

      await generator.generate(content);
      const settingsContent = await fs.readFile(
        path.join(tempDir, '.claude/settings.json'),
        'utf-8'
      );
      const settings = JSON.parse(settingsContent);

      expect(settings.hooks.PreToolUse).toHaveLength(2);
    });

    it('should support all Claude hook events', async () => {
      const events = [
        'UserPromptSubmit',
        'PreToolUse',
        'PostToolUse',
        'Notification',
        'Stop',
        'SubagentStop',
        'SessionStart',
        'SessionEnd',
        'PreCompact',
      ];

      const content = createMockContent({
        projectRoot: tempDir,
        claudeSettings: {
          hooks: Object.fromEntries(events.map((event) => [event, [{ command: `cmd-${event}` }]])),
        },
      });

      await generator.generate(content);
      const settingsContent = await fs.readFile(
        path.join(tempDir, '.claude/settings.json'),
        'utf-8'
      );
      const settings = JSON.parse(settingsContent);

      for (const event of events) {
        expect(settings.hooks[event]).toBeDefined();
        expect(settings.hooks[event][0].command).toBe(`cmd-${event}`);
      }
    });

    it('should not include matcher when it is "*" (match all)', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        claudeSettings: {
          hooks: {
            PostToolUse: [{ command: 'npm run format', matcher: '*' }],
          },
        },
      });

      await generator.generate(content);
      const settingsContent = await fs.readFile(
        path.join(tempDir, '.claude/settings.json'),
        'utf-8'
      );
      const settings = JSON.parse(settingsContent);

      expect(settings.hooks.PostToolUse[0].matcher).toBeUndefined();
    });

    it('should not include matcher when tool_match is undefined', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        hooks: [createMockHook('hook', 'PostToolUse', { execute: 'cmd' })],
      });

      await generator.generate(content);
      const settingsContent = await fs.readFile(
        path.join(tempDir, '.claude/settings.json'),
        'utf-8'
      );
      const settings = JSON.parse(settingsContent);

      expect(settings.hooks.PostToolUse[0].matcher).toBeUndefined();
    });

    it('should preserve hook type from claude extension', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        hooks: [
          createMockHook('validate-hook', 'PreToolUse', {
            execute: './validate.sh',
            claude: {
              type: 'validation',
              action: 'block',
            },
          }),
        ],
      });

      await generator.generate(content);
      const settingsContent = await fs.readFile(
        path.join(tempDir, '.claude/settings.json'),
        'utf-8'
      );
      const settings = JSON.parse(settingsContent);

      const hook = settings.hooks.PreToolUse[0];
      expect(hook.type).toBe('validation');
    });

    it('should handle hook with only command (minimal config)', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        claudeSettings: {
          hooks: {
            PostToolUse: [{ command: 'echo done' }],
          },
        },
      });

      await generator.generate(content);
      const settingsContent = await fs.readFile(
        path.join(tempDir, '.claude/settings.json'),
        'utf-8'
      );
      const settings = JSON.parse(settingsContent);

      const hook = settings.hooks.PostToolUse[0];
      expect(hook.type).toBe('command');
      expect(hook.command).toBe('echo done');
      expect(hook.matcher).toBeUndefined();
      expect(hook.action).toBeUndefined();
      expect(hook.message).toBeUndefined();
    });

    it('should sort hooks deterministically within each event', async () => {
      // Create hooks in reverse alphabetical order
      const content = createMockContent({
        projectRoot: tempDir,
        hooks: [
          createMockHook('z-hook', 'PreToolUse', { execute: 'cmd-z' }),
          createMockHook('a-hook', 'PreToolUse', { execute: 'cmd-a' }),
          createMockHook('m-hook', 'PreToolUse', { execute: 'cmd-m' }),
        ],
      });

      await generator.generate(content);
      const settingsContent = await fs.readFile(
        path.join(tempDir, '.claude/settings.json'),
        'utf-8'
      );
      const settings = JSON.parse(settingsContent);

      // Should be sorted alphabetically by name
      expect(settings.hooks.PreToolUse).toHaveLength(3);
      expect(settings.hooks.PreToolUse[0].command).toBe('cmd-a');
      expect(settings.hooks.PreToolUse[1].command).toBe('cmd-m');
      expect(settings.hooks.PreToolUse[2].command).toBe('cmd-z');
    });
  });

  describe('generate() - commands', () => {
    it('should include commands in settings.json', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        commands: [
          createMockCommand('deploy', { description: 'Deploy command', execute: 'npm run deploy' }),
        ],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.claude/settings.json');

      const settingsContent = await fs.readFile(
        path.join(tempDir, '.claude/settings.json'),
        'utf-8'
      );
      const settings = JSON.parse(settingsContent);
      
      expect(settings.commands).toBeDefined();
      expect(settings.commands.deploy).toBeDefined();
      expect(settings.commands.deploy.description).toBe('Deploy command');
      expect(settings.commands.deploy.command).toBe('npm run deploy');
    });

    it('should generate command files with usage and execute sections', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        commands: [
          createMockCommand('Deploy App', {
            description: 'Deploy application to target environment',
            execute: 'npm run deploy $ARGUMENTS',
            args: [
              {
                name: 'environment',
                type: 'string',
                required: true,
                description: 'Target environment',
                choices: ['staging', 'production'],
              },
            ],
          }),
        ],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.claude/commands/deploy-app.md');

      const commandContent = await fs.readFile(
        path.join(tempDir, '.claude/commands/deploy-app.md'),
        'utf-8'
      );

      expect(commandContent).toContain('# /deploy-app');
      expect(commandContent).toContain('Deploy application to target environment');
      expect(commandContent).toContain('$ARGUMENTS');
      expect(commandContent).toContain('environment');
      expect(commandContent).toContain('npm run deploy $ARGUMENTS');
    });
  });

  describe('generate() - CLAUDE.md', () => {
    it('should generate CLAUDE.md entry point', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        projectName: 'test-project',
        rules: [
          createMockRule('core', { always_apply: true }),
          createMockRule('database', { globs: ['**/*.sql'] }),
        ],
        personas: [createMockPersona('architect')],
        commands: [createMockCommand('deploy')],
        hooks: [createMockHook('pre-commit')],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('CLAUDE.md');

      const claudeContent = await fs.readFile(path.join(tempDir, 'CLAUDE.md'), 'utf-8');
      expect(claudeContent).toContain('# Claude Code Context');
      expect(claudeContent).toContain('test-project');
      expect(claudeContent).toContain('## Core Skills (Always Active)');
      expect(claudeContent).toContain('@import .claude/skills/core/SKILL.md');
      expect(claudeContent).toContain('## Context-Aware Skills');
      expect(claudeContent).toContain('database');
      expect(claudeContent).toContain('## Available Agents');
      expect(claudeContent).toContain('architect');
      expect(claudeContent).toContain('## Available Commands');
      expect(claudeContent).toContain('/deploy');
      expect(claudeContent).toContain('## Active Hooks');
    });

    it('should use @import syntax for always_apply rules', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('core', { always_apply: true })],
      });

      await generator.generate(content);

      const claudeContent = await fs.readFile(path.join(tempDir, 'CLAUDE.md'), 'utf-8');
      expect(claudeContent).toContain('@import');
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
        path.join(tempDir, '.claude/skills/test-rule/SKILL.md'),
        'utf-8'
      );
      expect(fileContent).toContain('DO NOT EDIT');
      expect(fileContent).toContain('ai-tool-sync');
    });

    it('should add generated marker to settings.json when addHeaders is true', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        hooks: [createMockHook('test-hook')],
      });

      await generator.generate(content, { addHeaders: true });

      const settingsContent = await fs.readFile(
        path.join(tempDir, '.claude/settings.json'),
        'utf-8'
      );
      const settings = JSON.parse(settingsContent);
      expect(settings.__generated_by).toContain('ai-tool-sync');
    });

    it('should not write files in dry run mode', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('test-rule')],
      });

      const result = await generator.generate(content, { dryRun: true });

      expect(result.files).toContain('.claude/skills/test-rule/SKILL.md');
      expect(result.generated).toBeDefined();

      // Verify files were not actually created
      await expect(
        fs.access(path.join(tempDir, '.claude/skills/test-rule/SKILL.md'))
      ).rejects.toThrow();
    });

    it('should clean existing files when clean option is true', async () => {
      // Create existing files
      const skillsDir = path.join(tempDir, '.claude/skills/old-skill');
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.writeFile(path.join(skillsDir, 'SKILL.md'), 'old content');

      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('new-rule')],
      });

      const result = await generator.generate(content, { clean: true });

      expect(result.files).toContain('.claude/skills/new-rule/SKILL.md');
      expect(result.deleted.length).toBeGreaterThan(0);
    });

    it('should clean existing commands when clean option is true', async () => {
      const commandsDir = path.join(tempDir, '.claude/commands');
      await fs.mkdir(commandsDir, { recursive: true });
      await fs.writeFile(path.join(commandsDir, 'old.md'), 'old command');

      const content = createMockContent({
        projectRoot: tempDir,
        commands: [createMockCommand('new-command', { execute: 'echo test' })],
      });

      const result = await generator.generate(content, { clean: true });

      expect(result.files).toContain('.claude/commands/new-command.md');
      expect(result.deleted).toContain('.claude/commands/old.md');
    });
  });

  describe('file naming', () => {
    it('should convert names with spaces to hyphens', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('My Test Rule')],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.claude/skills/my-test-rule/SKILL.md');
    });

    it('should convert names with special characters to safe filenames', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('rule/with:special@chars')],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.claude/skills/rule-with-special-chars/SKILL.md');
    });
  });
});

describe('createClaudeGenerator', () => {
  it('should create a ClaudeGenerator instance', () => {
    const generator = createClaudeGenerator();
    expect(generator).toBeInstanceOf(ClaudeGenerator);
    expect(generator.name).toBe('claude');
  });
});

describe('generate() - permissions', () => {
  let generator: ClaudeGenerator;
  let tempDir: string;

  beforeEach(async () => {
    generator = createClaudeGenerator();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-permissions-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should generate settings.json with permissions', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      claudeSettings: {
        permissions: [
          { matcher: 'Bash(*)', action: 'allow' },
          { matcher: 'Bash(rm*)', action: 'deny' },
        ],
      },
    });

    const result = await generator.generate(content);

    expect(result.files).toContain('.claude/settings.json');

    const settingsContent = await fs.readFile(
      path.join(tempDir, '.claude/settings.json'),
      'utf-8'
    );
    const settings = JSON.parse(settingsContent);

    expect(settings.permissions).toBeDefined();
    expect(settings.permissions.allow).toContain('Bash(*)');
    expect(settings.permissions.deny).toContain('Bash(rm*)');
  });

  it('should not include empty permission arrays', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      claudeSettings: {
        permissions: [{ matcher: 'Read', action: 'allow' }],
      },
    });

    await generator.generate(content);

    const settingsContent = await fs.readFile(
      path.join(tempDir, '.claude/settings.json'),
      'utf-8'
    );
    const settings = JSON.parse(settingsContent);

    expect(settings.permissions.allow).toBeDefined();
    expect(settings.permissions.deny).toBeUndefined();
    expect(settings.permissions.ask).toBeUndefined();
  });

  it('should group permissions by action', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      claudeSettings: {
        permissions: [
          { matcher: 'Bash(*)', action: 'allow' },
          { matcher: 'Read', action: 'allow' },
          { matcher: 'Bash(rm*)', action: 'deny' },
          { matcher: 'Write', action: 'ask' },
        ],
      },
    });

    await generator.generate(content);

    const settingsContent = await fs.readFile(
      path.join(tempDir, '.claude/settings.json'),
      'utf-8'
    );
    const settings = JSON.parse(settingsContent);

    expect(settings.permissions.allow).toHaveLength(2);
    expect(settings.permissions.deny).toHaveLength(1);
    expect(settings.permissions.ask).toHaveLength(1);
  });
});

describe('generate() - env variables', () => {
  let generator: ClaudeGenerator;
  let tempDir: string;

  beforeEach(async () => {
    generator = createClaudeGenerator();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-env-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should generate settings.json with env variables', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      claudeSettings: {
        env: {
          NODE_ENV: 'development',
          DEBUG: 'true',
        },
      },
    });

    const result = await generator.generate(content);

    expect(result.files).toContain('.claude/settings.json');

    const settingsContent = await fs.readFile(
      path.join(tempDir, '.claude/settings.json'),
      'utf-8'
    );
    const settings = JSON.parse(settingsContent);

    expect(settings.env).toBeDefined();
    expect(settings.env.NODE_ENV).toBe('development');
    expect(settings.env.DEBUG).toBe('true');
  });

  it('should not generate settings.json for empty env object', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      claudeSettings: {
        env: {},
      },
    });

    const result = await generator.generate(content);

    // Should not generate settings.json if only empty env
    expect(result.files).not.toContain('.claude/settings.json');
  });
});

describe('generate() - combined settings', () => {
  let generator: ClaudeGenerator;
  let tempDir: string;

  beforeEach(async () => {
    generator = createClaudeGenerator();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-combined-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should combine permissions, env, hooks, and commands', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      claudeSettings: {
        permissions: [{ matcher: 'Bash', action: 'allow' }],
        env: { NODE_ENV: 'test' },
      },
      hooks: [createMockHook('test-hook')],
      commands: [createMockCommand('test-cmd')],
    });

    await generator.generate(content);

    const settingsContent = await fs.readFile(
      path.join(tempDir, '.claude/settings.json'),
      'utf-8'
    );
    const settings = JSON.parse(settingsContent);

    expect(settings.permissions).toBeDefined();
    expect(settings.env).toBeDefined();
    expect(settings.hooks).toBeDefined();
    expect(settings.commands).toBeDefined();
  });

  it('should generate settings.json with only permissions (no hooks/commands)', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      claudeSettings: {
        permissions: [{ matcher: 'Bash(*)', action: 'allow' }],
      },
    });

    const result = await generator.generate(content);

    expect(result.files).toContain('.claude/settings.json');

    const settingsContent = await fs.readFile(
      path.join(tempDir, '.claude/settings.json'),
      'utf-8'
    );
    const settings = JSON.parse(settingsContent);

    expect(settings.permissions).toBeDefined();
    expect(settings.hooks).toBeUndefined();
    expect(settings.commands).toBeUndefined();
  });
});

describe('MCP generation', () => {
  let generator: ClaudeGenerator;
  let tempDir: string;

  beforeEach(async () => {
    generator = new ClaudeGenerator();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-mcp-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should generate mcp_servers.json when MCP config is present', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      mcpConfig: {
        servers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
            targets: ['claude'],
            enabled: true,
          },
        },
      },
    });

    const result = await generator.generate(content);

    expect(result.files).toContain('.claude/mcp_servers.json');
    const mcpContent = await fs.readFile(path.join(tempDir, '.claude/mcp_servers.json'), 'utf-8');
    const mcpJson = JSON.parse(mcpContent);
    expect(mcpJson.mcpServers.filesystem).toBeDefined();
    expect(mcpJson.mcpServers.filesystem.command).toBe('npx');
  });

  it('should not generate mcp_servers.json when no MCP config', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
    });

    const result = await generator.generate(content);

    expect(result.files).not.toContain('.claude/mcp_servers.json');
  });

  it('should filter MCP servers by claude target', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      mcpConfig: {
        servers: {
          claudeOnly: {
            command: 'claude-server',
            targets: ['claude'],
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

    expect(result.files).toContain('.claude/mcp_servers.json');
    const mcpContent = await fs.readFile(path.join(tempDir, '.claude/mcp_servers.json'), 'utf-8');
    const mcpJson = JSON.parse(mcpContent);
    expect(mcpJson.mcpServers.claudeOnly).toBeDefined();
    expect(mcpJson.mcpServers.cursorOnly).toBeUndefined();
  });

  it('should generate mcp_servers.json with URL server', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      mcpConfig: {
        servers: {
          api: {
            url: 'https://api.example.com/mcp',
            headers: { 'X-API-Key': 'secret' },
            targets: ['claude'],
            enabled: true,
          },
        },
      },
    });

    const result = await generator.generate(content);

    expect(result.files).toContain('.claude/mcp_servers.json');
    const mcpContent = await fs.readFile(path.join(tempDir, '.claude/mcp_servers.json'), 'utf-8');
    const mcpJson = JSON.parse(mcpContent);
    expect(mcpJson.mcpServers.api.url).toBe('https://api.example.com/mcp');
    expect(mcpJson.mcpServers.api.headers['X-API-Key']).toBe('secret');
  });
});

