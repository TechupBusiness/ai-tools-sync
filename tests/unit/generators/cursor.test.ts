/**
 * @file Cursor Generator Tests
 * @description Tests for Cursor IDE output generation
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { CursorGenerator, createCursorGenerator } from '../../../src/generators/cursor.js';

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
function createMockHook(name: string, event: 'PreToolUse' | 'PostToolUse' = 'PreToolUse', targets: ('cursor' | 'claude' | 'factory')[] = ['cursor', 'claude', 'factory']): ParsedHook {
  return {
    frontmatter: {
      name,
      event,
      targets,
    },
    content: `# ${name}\n\nThis is the ${name} hook.`,
  };
}

describe('CursorGenerator', () => {
  let generator: CursorGenerator;
  let tempDir: string;

  beforeEach(async () => {
    generator = createCursorGenerator();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cursor-gen-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('name property', () => {
    it('should have name "cursor"', () => {
      expect(generator.name).toBe('cursor');
    });
  });

  describe('generate() - empty content', () => {
    it('should return empty result for empty content', async () => {
      const content = createMockContent({ projectRoot: tempDir });
      const result = await generator.generate(content);

      expect(result.files).toHaveLength(0);
      expect(result.deleted).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('generate() - rules', () => {
    it('should generate .mdc files for rules', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [
          createMockRule('database', { description: 'Database rules' }),
          createMockRule('testing', { description: 'Testing rules' }),
        ],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.cursor/rules/database.mdc');
      expect(result.files).toContain('.cursor/rules/testing.mdc');

      // Verify file content
      const dbContent = await fs.readFile(path.join(tempDir, '.cursor/rules/database.mdc'), 'utf-8');
      expect(dbContent).toContain('---');
      expect(dbContent).toContain('description: Database rules');
      expect(dbContent).toContain('# database');
    });

    it('should transform always_apply to alwaysApply in frontmatter', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('core', { always_apply: true })],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.cursor/rules/core.mdc');

      const fileContent = await fs.readFile(path.join(tempDir, '.cursor/rules/core.mdc'), 'utf-8');
      expect(fileContent).toContain('alwaysApply: true');
    });

    it('should transform globs array to comma-separated string', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('styles', { globs: ['**/*.css', '**/*.scss'] })],
      });

      const result = await generator.generate(content);

      const fileContent = await fs.readFile(path.join(tempDir, '.cursor/rules/styles.mdc'), 'utf-8');
      expect(fileContent).toContain('globs: **/*.css, **/*.scss');
    });

    it('should filter rules that do not target cursor', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [
          createMockRule('cursor-only', { targets: ['cursor'] }),
          createMockRule('claude-only', { targets: ['claude'] }),
        ],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.cursor/rules/cursor-only.mdc');
      expect(result.files).not.toContain('.cursor/rules/claude-only.mdc');
    });

    it('should sort rules by priority', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [
          createMockRule('low-priority', { priority: 'low' }),
          createMockRule('high-priority', { priority: 'high' }),
          createMockRule('medium-priority', { priority: 'medium' }),
        ],
      });

      const result = await generator.generate(content, { dryRun: true });

      // In dry run mode, we can check the order via generated array
      const ruleFiles = result.generated?.filter((f) => f.type === 'rule') ?? [];
      expect(ruleFiles[0]?.path).toContain('high-priority');
      expect(ruleFiles[1]?.path).toContain('medium-priority');
      expect(ruleFiles[2]?.path).toContain('low-priority');
    });
  });

  describe('generate() - personas', () => {
    it('should generate role files for personas', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        personas: [
          createMockPersona('architect', { description: 'System architect' }),
          createMockPersona('implementer', { description: 'Code implementer' }),
        ],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.cursor/commands/roles/architect.md');
      expect(result.files).toContain('.cursor/commands/roles/implementer.md');

      const architectContent = await fs.readFile(
        path.join(tempDir, '.cursor/commands/roles/architect.md'),
        'utf-8'
      );
      expect(architectContent).toContain('# architect');
      expect(architectContent).toContain('> System architect');
    });

    it('should map tools to Cursor-specific names', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        personas: [createMockPersona('dev', { tools: ['read', 'write', 'execute'] })],
      });

      const result = await generator.generate(content);

      const fileContent = await fs.readFile(
        path.join(tempDir, '.cursor/commands/roles/dev.md'),
        'utf-8'
      );
      expect(fileContent).toContain('Read');
      expect(fileContent).toContain('Create'); // 'write' maps to 'Create' in Cursor
      expect(fileContent).toContain('Execute');
    });
  });

  describe('generate() - commands', () => {
    it('should generate command files with frontmatter', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        commands: [
          createMockCommand('deploy', {
            description: 'Deploy to production',
            execute: 'npm run deploy',
          }),
        ],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.cursor/commands/deploy.md');

      const cmdContent = await fs.readFile(
        path.join(tempDir, '.cursor/commands/deploy.md'),
        'utf-8'
      );
      // Commands now use YAML frontmatter for description
      expect(cmdContent).toContain('---');
      expect(cmdContent).toContain('description: Deploy to production');
      expect(cmdContent).toContain('npm run deploy');
    });

    it('should include allowedTools in frontmatter when specified', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        commands: [
          createMockCommand('refactor', {
            description: 'Safe refactor without terminal',
            allowedTools: ['read', 'edit'],
          }),
        ],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.cursor/commands/refactor.md');

      const cmdContent = await fs.readFile(
        path.join(tempDir, '.cursor/commands/refactor.md'),
        'utf-8'
      );
      expect(cmdContent).toContain('allowedTools: ["Read", "Edit"]');
    });

    it('should include globs in frontmatter when specified', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        commands: [
          createMockCommand('typescript', {
            description: 'TypeScript help',
            globs: ['**/*.ts', '**/*.tsx'],
          }),
        ],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.cursor/commands/typescript.md');

      const cmdContent = await fs.readFile(
        path.join(tempDir, '.cursor/commands/typescript.md'),
        'utf-8'
      );
      expect(cmdContent).toContain('globs: ["**/*.ts", "**/*.tsx"]');
    });

    it('should include arguments section when args are defined', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        commands: [
          createMockCommand('build', {
            args: [
              { name: 'env', type: 'string', default: 'development', choices: ['development', 'production'] },
            ],
          }),
        ],
      });

      const result = await generator.generate(content);

      const cmdContent = await fs.readFile(
        path.join(tempDir, '.cursor/commands/build.md'),
        'utf-8'
      );
      expect(cmdContent).toContain('## Arguments');
      expect(cmdContent).toContain('**env**');
      expect(cmdContent).toContain('string');
      expect(cmdContent).toContain('[default: development]');
      expect(cmdContent).toContain('Choices: development, production');
    });
  });

  describe('generate() - hooks', () => {
    it('should generate .cursor/hooks.json for hooks (v1.7+)', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        hooks: [createMockHook('format-on-edit', 'PostToolUse', ['cursor'])],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.cursor/hooks.json');
      
      const hooksContent = await fs.readFile(
        path.join(tempDir, '.cursor/hooks.json'),
        'utf-8'
      );
      const hooksJson = JSON.parse(hooksContent);
      expect(hooksJson.version).toBe(1);
      expect(hooksJson.hooks).toBeDefined();
      expect(hooksJson.hooks.afterFileEdit).toBeDefined();
      expect(hooksJson.hooks.afterFileEdit).toHaveLength(1);
    });

    it('should not generate hooks.json when no hooks map to Cursor events', async () => {
      // Hook with event that doesn't map to Cursor
      const content = createMockContent({
        projectRoot: tempDir,
        hooks: [createMockHook('pre-commit', 'PreCommit', ['cursor'])],
      });

      const result = await generator.generate(content);

      // PreCommit doesn't map to a Cursor event, so hooks.json shouldn't be generated
      expect(result.files).not.toContain('.cursor/hooks.json');
    });
  });

  describe('generate() - AGENTS.md', () => {
    it('should generate AGENTS.md when personas or commands exist', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        projectName: 'test-project',
        personas: [createMockPersona('architect', { description: 'System architect' })],
        commands: [createMockCommand('deploy', { description: 'Deploy command' })],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('AGENTS.md');

      const agentsContent = await fs.readFile(path.join(tempDir, 'AGENTS.md'), 'utf-8');
      expect(agentsContent).toContain('# AI Agents');
      expect(agentsContent).toContain('test-project');
      expect(agentsContent).toContain('## Available Roles');
      expect(agentsContent).toContain('architect');
      expect(agentsContent).toContain('## Available Commands');
      expect(agentsContent).toContain('deploy');
    });

    it('should not generate AGENTS.md when no personas or commands', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('test-rule')],
      });

      const result = await generator.generate(content);

      expect(result.files).not.toContain('AGENTS.md');
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
        path.join(tempDir, '.cursor/rules/test-rule.mdc'),
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

      expect(result.files).toContain('.cursor/rules/test-rule.mdc');
      expect(result.generated).toBeDefined();
      expect(result.generated).toHaveLength(1);

      // Verify file was not actually created
      await expect(
        fs.access(path.join(tempDir, '.cursor/rules/test-rule.mdc'))
      ).rejects.toThrow();
    });

    it('should clean existing files when clean option is true', async () => {
      // Create existing files
      const rulesDir = path.join(tempDir, '.cursor/rules');
      await fs.mkdir(rulesDir, { recursive: true });
      await fs.writeFile(path.join(rulesDir, 'old-rule.mdc'), 'old content');

      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('new-rule')],
      });

      const result = await generator.generate(content, { clean: true });

      expect(result.files).toContain('.cursor/rules/new-rule.mdc');
      expect(result.deleted.length).toBeGreaterThan(0);
    });
  });

  describe('file naming', () => {
    it('should convert names with spaces to hyphens', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('My Test Rule')],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.cursor/rules/my-test-rule.mdc');
    });

    it('should convert names with special characters to safe filenames', async () => {
      const content = createMockContent({
        projectRoot: tempDir,
        rules: [createMockRule('rule/with:special@chars')],
      });

      const result = await generator.generate(content);

      expect(result.files).toContain('.cursor/rules/rule-with-special-chars.mdc');
    });
  });
});

describe('createCursorGenerator', () => {
  it('should create a CursorGenerator instance', () => {
    const generator = createCursorGenerator();
    expect(generator).toBeInstanceOf(CursorGenerator);
    expect(generator.name).toBe('cursor');
  });
});

describe('MCP generation', () => {
  let generator: CursorGenerator;
  let tempDir: string;

  beforeEach(async () => {
    generator = new CursorGenerator();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cursor-mcp-test-'));
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
            targets: ['cursor'],
            enabled: true,
          },
        },
      },
    });

    const result = await generator.generate(content);

    expect(result.files).toContain('mcp.json');
    const mcpContent = await fs.readFile(path.join(tempDir, 'mcp.json'), 'utf-8');
    const mcpJson = JSON.parse(mcpContent);
    expect(mcpJson.mcpServers.filesystem).toBeDefined();
    expect(mcpJson.mcpServers.filesystem.command).toBe('npx');
    expect(mcpJson.mcpServers.filesystem.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem']);
  });

  it('should not generate mcp.json when no MCP config', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
    });

    const result = await generator.generate(content);

    expect(result.files).not.toContain('mcp.json');
  });

  it('should not generate mcp.json when servers is empty', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      mcpConfig: {
        servers: {},
      },
    });

    const result = await generator.generate(content);

    expect(result.files).not.toContain('mcp.json');
  });

  it('should generate mcp.json with URL server', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      mcpConfig: {
        servers: {
          api: {
            url: 'https://api.example.com/mcp',
            headers: { Authorization: 'Bearer token' },
            targets: ['cursor'],
            enabled: true,
          },
        },
      },
    });

    const result = await generator.generate(content);

    expect(result.files).toContain('mcp.json');
    const mcpContent = await fs.readFile(path.join(tempDir, 'mcp.json'), 'utf-8');
    const mcpJson = JSON.parse(mcpContent);
    expect(mcpJson.mcpServers.api).toBeDefined();
    expect(mcpJson.mcpServers.api.url).toBe('https://api.example.com/mcp');
    expect(mcpJson.mcpServers.api.headers.Authorization).toBe('Bearer token');
  });

  it('should filter MCP servers by cursor target', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      mcpConfig: {
        servers: {
          cursorOnly: {
            command: 'cursor-server',
            targets: ['cursor'],
            enabled: true,
          },
          claudeOnly: {
            command: 'claude-server',
            targets: ['claude'],
            enabled: true,
          },
        },
      },
    });

    const result = await generator.generate(content);

    expect(result.files).toContain('mcp.json');
    const mcpContent = await fs.readFile(path.join(tempDir, 'mcp.json'), 'utf-8');
    const mcpJson = JSON.parse(mcpContent);
    expect(mcpJson.mcpServers.cursorOnly).toBeDefined();
    expect(mcpJson.mcpServers.claudeOnly).toBeUndefined();
  });

  it('should exclude disabled MCP servers', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      mcpConfig: {
        servers: {
          enabled: {
            command: 'enabled-server',
            targets: ['cursor'],
            enabled: true,
          },
          disabled: {
            command: 'disabled-server',
            targets: ['cursor'],
            enabled: false,
          },
        },
      },
    });

    const result = await generator.generate(content);

    expect(result.files).toContain('mcp.json');
    const mcpContent = await fs.readFile(path.join(tempDir, 'mcp.json'), 'utf-8');
    const mcpJson = JSON.parse(mcpContent);
    expect(mcpJson.mcpServers.enabled).toBeDefined();
    expect(mcpJson.mcpServers.disabled).toBeUndefined();
  });

  it('should add generated marker when addHeaders is true', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      mcpConfig: {
        servers: {
          test: {
            command: 'test',
            targets: ['cursor'],
            enabled: true,
          },
        },
      },
    });

    const result = await generator.generate(content, { addHeaders: true });

    expect(result.files).toContain('mcp.json');
    const mcpContent = await fs.readFile(path.join(tempDir, 'mcp.json'), 'utf-8');
    const mcpJson = JSON.parse(mcpContent);
    expect(mcpJson.__generated_by).toContain('ai-tool-sync');
  });

  it('should include env and cwd in mcp.json', async () => {
    const content = createMockContent({
      projectRoot: tempDir,
      mcpConfig: {
        servers: {
          test: {
            command: 'test-server',
            args: ['--port', '3000'],
            env: { NODE_ENV: 'development' },
            cwd: '/path/to/cwd',
            targets: ['cursor'],
            enabled: true,
          },
        },
      },
    });

    const result = await generator.generate(content);

    expect(result.files).toContain('mcp.json');
    const mcpContent = await fs.readFile(path.join(tempDir, 'mcp.json'), 'utf-8');
    const mcpJson = JSON.parse(mcpContent);
    expect(mcpJson.mcpServers.test.env).toEqual({ NODE_ENV: 'development' });
    expect(mcpJson.mcpServers.test.cwd).toBe('/path/to/cwd');
  });
});

