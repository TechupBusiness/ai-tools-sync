/**
 * @file Command Parser Tests
 * @description Tests for command file parsing, validation, and defaults
 */

import { describe, it, expect } from 'vitest';

import {
  parseCommand,
  parseCommands,
  filterCommandsByTarget,
  COMMAND_DEFAULTS,
} from '../../../src/parsers/command.js';
import { isOk, isErr } from '../../../src/utils/result.js';

describe('Command Parser', () => {
  describe('parseCommand()', () => {
    it('should parse valid command with all fields', () => {
      const content = `---
name: deploy
description: Deploy application to environment
version: 1.0.0
execute: scripts/deploy.sh
args:
  - name: environment
    type: string
    description: Target environment
    default: staging
    choices:
      - staging
      - production
    required: false
  - name: force
    type: boolean
    description: Force deployment
    default: false
targets:
  - cursor
  - claude
---
# Deploy Command

Deploy your application with this command.`;

      const result = parseCommand(content, 'commands/deploy.md');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.name).toBe('deploy');
        expect(result.value.frontmatter.description).toBe('Deploy application to environment');
        expect(result.value.frontmatter.version).toBe('1.0.0');
        expect(result.value.frontmatter.execute).toBe('scripts/deploy.sh');
        expect(result.value.frontmatter.args).toHaveLength(2);
        expect(result.value.frontmatter.args?.[0].name).toBe('environment');
        expect(result.value.frontmatter.args?.[0].type).toBe('string');
        expect(result.value.frontmatter.args?.[0].choices).toEqual(['staging', 'production']);
        expect(result.value.frontmatter.args?.[1].type).toBe('boolean');
        expect(result.value.frontmatter.targets).toEqual(['cursor', 'claude']);
        expect(result.value.content).toContain('Deploy Command');
        expect(result.value.filePath).toBe('commands/deploy.md');
      }
    });

    it('should apply defaults for optional fields', () => {
      const content = `---
name: simple-command
---
Content`;

      const result = parseCommand(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.args).toEqual(COMMAND_DEFAULTS.args);
        expect(result.value.frontmatter.targets).toEqual(COMMAND_DEFAULTS.targets);
      }
    });

    it('should return error for missing name', () => {
      const content = `---
description: Missing name
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'name')).toBe(true);
      }
    });

    it('should return error for invalid arg type', () => {
      const content = `---
name: test
args:
  - name: myArg
    type: invalid
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'args[0].type')).toBe(true);
      }
    });

    it('should return error for missing arg name', () => {
      const content = `---
name: test
args:
  - type: string
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'args[0].name')).toBe(true);
      }
    });

    it('should return error for missing arg type', () => {
      const content = `---
name: test
args:
  - name: myArg
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'args[0].type')).toBe(true);
      }
    });

    it('should return error for type mismatch in default value', () => {
      const content = `---
name: test
args:
  - name: myArg
    type: number
    default: "not a number"
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'args[0].default')).toBe(true);
      }
    });

    it('should return error when default not in choices', () => {
      const content = `---
name: test
args:
  - name: env
    type: string
    default: invalid
    choices:
      - staging
      - production
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'args[0].default')).toBe(true);
        expect(result.error.validationErrors?.some((e) => e.message.includes('choices'))).toBe(true);
      }
    });

    it('should accept number type with number default', () => {
      const content = `---
name: test
args:
  - name: count
    type: number
    default: 10
---
Content`;

      const result = parseCommand(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.args?.[0].default).toBe(10);
      }
    });

    it('should accept boolean type with boolean default', () => {
      const content = `---
name: test
args:
  - name: verbose
    type: boolean
    default: true
---
Content`;

      const result = parseCommand(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.args?.[0].default).toBe(true);
      }
    });

    it('should accept number choices', () => {
      const content = `---
name: test
args:
  - name: port
    type: number
    default: 3000
    choices:
      - 3000
      - 8080
      - 8000
---
Content`;

      const result = parseCommand(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.args?.[0].choices).toEqual([3000, 8080, 8000]);
      }
    });

    it('should return error for non-array args', () => {
      const content = `---
name: test
args:
  name: single
  type: string
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'args')).toBe(true);
      }
    });

    it('should return error for non-object arg', () => {
      const content = `---
name: test
args:
  - "just a string"
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'args[0]')).toBe(true);
      }
    });

    it('should return error for missing frontmatter', () => {
      const content = `# Just a title
No frontmatter`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('missing frontmatter');
      }
    });

    it('should parse allowedTools field', () => {
      const content = `---
name: refactor
description: Safe refactoring command
allowedTools:
  - read
  - edit
---
# Refactor Command`;

      const result = parseCommand(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.allowedTools).toEqual(['read', 'edit']);
      }
    });

    it('should parse globs field', () => {
      const content = `---
name: typescript-help
description: TypeScript assistance
globs:
  - "**/*.ts"
  - "**/*.tsx"
---
# TypeScript Help`;

      const result = parseCommand(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.globs).toEqual(['**/*.ts', '**/*.tsx']);
      }
    });

    it('should parse platform-specific extensions', () => {
      const content = `---
name: cross-platform
description: Command with platform overrides
cursor:
  allowedTools:
    - Read
    - Edit
  globs:
    - "**/*.ts"
claude:
  tools:
    - Bash
factory:
  tools:
    - execute
---
# Cross-Platform Command`;

      const result = parseCommand(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.cursor).toEqual({
          allowedTools: ['Read', 'Edit'],
          globs: ['**/*.ts'],
        });
        expect(result.value.frontmatter.claude).toEqual({
          tools: ['Bash'],
        });
        expect(result.value.frontmatter.factory).toEqual({
          tools: ['execute'],
        });
      }
    });

    it('should return error for non-array allowedTools', () => {
      const content = `---
name: test
allowedTools: read
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'allowedTools')).toBe(true);
      }
    });

    it('should return error for invalid platform extension (non-object)', () => {
      const content = `---
name: test
cursor: not-an-object
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'cursor')).toBe(true);
      }
    });

    it('should validate multiple args', () => {
      const content = `---
name: test
args:
  - name: valid
    type: string
  - type: number
  - name: another
    type: invalid
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'args[1].name')).toBe(true);
        expect(result.error.validationErrors?.some((e) => e.path === 'args[2].type')).toBe(true);
      }
    });
  });

  describe('parseCommands()', () => {
    it('should parse multiple valid commands', () => {
      const files = [
        { content: `---\nname: cmd1\n---\nCommand 1`, filePath: 'cmd1.md' },
        { content: `---\nname: cmd2\n---\nCommand 2`, filePath: 'cmd2.md' },
      ];

      const result = parseCommands(files);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.length).toBe(2);
      }
    });

    it('should collect all errors', () => {
      const files = [
        { content: `---\ndescription: no name\n---\n`, filePath: 'bad1.md' },
        { content: `# No frontmatter`, filePath: 'bad2.md' },
      ];

      const result = parseCommands(files);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.length).toBe(2);
      }
    });
  });

  describe('variables field', () => {
    it('should parse command with variables', () => {
      const content = `---
name: deploy
variables:
  - name: ARGUMENTS
    description: User input after command name
  - name: CUSTOM_VAR
    description: Custom variable
    default: defaultValue
---
Deploy with $ARGUMENTS`;

      const result = parseCommand(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.variables).toHaveLength(2);
        expect(result.value.frontmatter.variables?.[0].name).toBe('ARGUMENTS');
        expect(result.value.frontmatter.variables?.[0].description).toBe('User input after command name');
        expect(result.value.frontmatter.variables?.[1].name).toBe('CUSTOM_VAR');
        expect(result.value.frontmatter.variables?.[1].default).toBe('defaultValue');
      }
    });

    it('should return error for variables that is not an array', () => {
      const content = `---
name: test
variables: "not an array"
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'variables')).toBe(true);
      }
    });

    it('should return error for variable without name', () => {
      const content = `---
name: test
variables:
  - description: Missing name
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'variables[0].name')).toBe(true);
      }
    });

    it('should return error for variable with empty name', () => {
      const content = `---
name: test
variables:
  - name: ""
    description: Empty name
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'variables[0].name')).toBe(true);
      }
    });

    it('should return error for variable with non-string name', () => {
      const content = `---
name: test
variables:
  - name: 123
    description: Numeric name
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'variables[0].name')).toBe(true);
      }
    });

    it('should return error for variable with non-string description', () => {
      const content = `---
name: test
variables:
  - name: VAR
    description: 123
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'variables[0].description')).toBe(true);
      }
    });

    it('should return error for variable with non-string default', () => {
      const content = `---
name: test
variables:
  - name: VAR
    default: 123
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'variables[0].default')).toBe(true);
      }
    });

    it('should allow variables with only name', () => {
      const content = `---
name: test
variables:
  - name: SIMPLE_VAR
---
Content`;

      const result = parseCommand(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.variables).toHaveLength(1);
        expect(result.value.frontmatter.variables?.[0].name).toBe('SIMPLE_VAR');
        expect(result.value.frontmatter.variables?.[0].description).toBeUndefined();
      }
    });

    it('should return error for non-object variable', () => {
      const content = `---
name: test
variables:
  - "string instead of object"
---
Content`;

      const result = parseCommand(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'variables[0]')).toBe(true);
      }
    });
  });

  describe('filterCommandsByTarget()', () => {
    const commands = [
      {
        frontmatter: { name: 'cursor-only', targets: ['cursor'] as const },
        content: '',
      },
      {
        frontmatter: { name: 'all' },
        content: '',
      },
    ];

    it('should filter by target', () => {
      const filtered = filterCommandsByTarget(commands as any, 'cursor');

      expect(filtered.length).toBe(2);
    });

    it('should exclude non-matching commands', () => {
      const filtered = filterCommandsByTarget(commands as any, 'factory');

      expect(filtered.length).toBe(1);
      expect(filtered[0].frontmatter.name).toBe('all');
    });
  });
});

