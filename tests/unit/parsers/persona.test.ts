/**
 * @file Persona Parser Tests
 * @description Tests for persona file parsing, validation, and defaults
 */

import { describe, it, expect } from 'vitest';

import {
  parsePersona,
  parsePersonas,
  filterPersonasByTarget,
  getUniqueTools,
  resolvePersonaInheritance,
  PERSONA_DEFAULTS,
  type ParsedPersona,
} from '../../../src/parsers/persona.js';
import { isOk, isErr } from '../../../src/utils/result.js';

describe('Persona Parser', () => {
  describe('parsePersona()', () => {
    it('should parse valid persona with all fields', () => {
      const content = `---
name: implementer
description: Pragmatic coding craftsman
version: 1.0.0
tools:
  - read
  - write
  - edit
  - execute
model: default
targets:
  - cursor
  - claude
  - factory
traits:
  verbose: true
  codeStyle: clean
---
# The Implementer

A pragmatic persona focused on writing clean, working code.`;

      const result = parsePersona(content, 'personas/implementer.md');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.name).toBe('implementer');
        expect(result.value.frontmatter.description).toBe('Pragmatic coding craftsman');
        expect(result.value.frontmatter.version).toBe('1.0.0');
        expect(result.value.frontmatter.tools).toEqual(['read', 'write', 'edit', 'execute']);
        expect(result.value.frontmatter.model).toBe('default');
        expect(result.value.frontmatter.targets).toEqual(['cursor', 'claude', 'factory']);
        expect(result.value.frontmatter.traits).toEqual({ verbose: true, codeStyle: 'clean' });
        expect(result.value.content).toContain('The Implementer');
        expect(result.value.filePath).toBe('personas/implementer.md');
      }
    });

    it('should apply defaults for optional fields', () => {
      const content = `---
name: minimal-persona
---
Content`;

      const result = parsePersona(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.tools).toEqual(PERSONA_DEFAULTS.tools);
        expect(result.value.frontmatter.model).toBe(PERSONA_DEFAULTS.model);
        expect(result.value.frontmatter.targets).toEqual(PERSONA_DEFAULTS.targets);
      }
    });

    it('should return error for missing name', () => {
      const content = `---
description: Missing name
---
Content`;

      const result = parsePersona(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'name')).toBe(true);
      }
    });

    it('should return error for empty name', () => {
      const content = `---
name: "   "
---
Content`;

      const result = parsePersona(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.message.includes('empty'))).toBe(true);
      }
    });

    it('should return error for invalid tool', () => {
      const content = `---
name: test
tools:
  - read
  - invalid-tool
  - write
---
Content`;

      const result = parsePersona(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'tools[1]')).toBe(true);
        expect(result.error.validationErrors?.some((e) => e.message.includes('invalid-tool'))).toBe(true);
      }
    });

    it('should return error for non-array tools', () => {
      const content = `---
name: test
tools: read
---
Content`;

      const result = parsePersona(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'tools')).toBe(true);
      }
    });

    it('should return error for invalid version format', () => {
      const content = `---
name: test
version: v1
---
Content`;

      const result = parsePersona(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'version')).toBe(true);
      }
    });

    it('should return error for invalid target', () => {
      const content = `---
name: test
targets:
  - cursor
  - vscode
---
Content`;

      const result = parsePersona(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path.includes('targets'))).toBe(true);
      }
    });

    it('should return error for non-object traits', () => {
      const content = `---
name: test
traits:
  - item1
  - item2
---
Content`;

      const result = parsePersona(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'traits')).toBe(true);
      }
    });

    it('should return error for missing frontmatter', () => {
      const content = `# Just content
No frontmatter here`;

      const result = parsePersona(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('missing frontmatter');
      }
    });

    it('should accept all valid tool types', () => {
      const content = `---
name: all-tools
tools:
  - read
  - write
  - edit
  - execute
  - search
  - glob
  - fetch
  - ls
---
Content`;

      const result = parsePersona(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.tools?.length).toBe(8);
      }
    });

    it('should accept any string as model', () => {
      const content = `---
name: custom-model
model: gpt-4-turbo
---
Content`;

      const result = parsePersona(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.model).toBe('gpt-4-turbo');
      }
    });

    it('should parse persona with valid extends field', () => {
      const content = `---
name: child
extends: base
---
Content`;

      const result = parsePersona(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.extends).toBe('base');
      }
    });

    it('should return error for non-string extends', () => {
      const content = `---
name: child
extends: 123
---
Content`;

      const result = parsePersona(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        const paths = result.error.validationErrors?.map((e) => e.path);
        expect(paths).toContain('extends');
      }
    });

    it('should return error for empty extends', () => {
      const content = `---
name: child
extends: "   "
---
Content`;

      const result = parsePersona(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        const messages = result.error.validationErrors?.map((e) => e.message).join(' ');
        expect(messages).toContain('extends');
      }
    });
  });

  describe('parsePersonas()', () => {
    it('should parse multiple valid personas', () => {
      const files = [
        { content: `---\nname: architect\n---\nArchitect persona`, filePath: 'architect.md' },
        { content: `---\nname: implementer\n---\nImplementer persona`, filePath: 'implementer.md' },
      ];

      const result = parsePersonas(files);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.length).toBe(2);
        expect(result.value.map((p) => p.frontmatter.name)).toEqual(['architect', 'implementer']);
      }
    });

    it('should collect errors from all invalid files', () => {
      const files = [
        { content: `---\ntools: invalid\n---\nMissing name`, filePath: 'bad1.md' },
        { content: `# No frontmatter`, filePath: 'bad2.md' },
      ];

      const result = parsePersonas(files);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.length).toBe(2);
      }
    });
  });

  describe('resolvePersonaInheritance()', () => {
    it('should merge parent frontmatter and content with separator', () => {
      const parent: ParsedPersona = {
        frontmatter: {
          name: 'base-implementer',
          description: 'Base implementer',
          tools: ['read', 'write', 'edit'],
          model: 'default',
          targets: ['cursor', 'claude'],
        },
        content: '# Base Implementer\n\nBase content here.',
      };

      const child: ParsedPersona = {
        frontmatter: {
          name: 'senior-implementer',
          extends: 'base-implementer',
          description: 'Senior implementer',
          tools: ['read', 'write', 'edit', 'execute'],
        },
        content: '## Senior Additions\n\nAdditional content.',
        filePath: 'personas/senior-implementer.md',
      };

      const result = resolvePersonaInheritance([parent, child]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.warnings).toHaveLength(0);
        const resolved = result.value.personas.find(
          (p) => p.frontmatter.name === 'senior-implementer'
        );
        expect(resolved).toBeDefined();
        expect(resolved?.frontmatter.description).toBe('Senior implementer');
        expect(resolved?.frontmatter.tools).toEqual(['read', 'write', 'edit', 'execute']);
        expect(resolved?.frontmatter.model).toBe('default');
        expect(resolved?.frontmatter.targets).toEqual(['cursor', 'claude']);
        expect(resolved?.frontmatter.extends).toBeUndefined();
        expect(resolved?.content).toContain('Base Implementer');
        expect(resolved?.content).toContain('Senior Additions');
        expect(resolved?.content).toContain('---');
        expect(resolved?.filePath).toBe('personas/senior-implementer.md');
      }
    });

    it('should resolve multi-level inheritance', () => {
      const base: ParsedPersona = {
        frontmatter: { name: 'base', model: 'default' },
        content: 'Base content',
      };
      const middle: ParsedPersona = {
        frontmatter: { name: 'middle', extends: 'base', tools: ['read'] },
        content: 'Middle content',
      };
      const leaf: ParsedPersona = {
        frontmatter: { name: 'leaf', extends: 'middle', description: 'Leaf override' },
        content: 'Leaf content',
      };

      const result = resolvePersonaInheritance([base, middle, leaf]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const resolved = result.value.personas.find((p) => p.frontmatter.name === 'leaf');
        expect(resolved).toBeDefined();
        expect(resolved?.frontmatter.model).toBe('default');
        expect(resolved?.frontmatter.tools).toEqual(['read']);
        expect(resolved?.frontmatter.description).toBe('Leaf override');
        expect(resolved?.content).toBe('Base content\n\n---\n\nMiddle content\n\n---\n\nLeaf content');
      }
    });

    it('should warn when parent is missing', () => {
      const orphan: ParsedPersona = {
        frontmatter: { name: 'orphan', extends: 'ghost' },
        content: 'Content',
        filePath: 'personas/orphan.md',
      };

      const result = resolvePersonaInheritance([orphan]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.warnings).toHaveLength(1);
        expect(result.value.warnings[0]).toMatchObject({
          persona: 'orphan',
          filePath: 'personas/orphan.md',
        });
        expect(result.value.personas[0].frontmatter.extends).toBe('ghost');
      }
    });

    it('should detect circular references', () => {
      const a: ParsedPersona = {
        frontmatter: { name: 'persona-a', extends: 'persona-b' },
        content: 'A',
      };
      const b: ParsedPersona = {
        frontmatter: { name: 'persona-b', extends: 'persona-a' },
        content: 'B',
      };

      const result = resolvePersonaInheritance([a, b]);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Circular');
      }
    });

    it('should respect max depth limit', () => {
      const a: ParsedPersona = {
        frontmatter: { name: 'a', extends: 'b' },
        content: 'A',
      };
      const b: ParsedPersona = {
        frontmatter: { name: 'b', extends: 'c' },
        content: 'B',
      };
      const c: ParsedPersona = {
        frontmatter: { name: 'c' },
        content: 'C',
      };

      const result = resolvePersonaInheritance([a, b, c], { maxDepth: 1 });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Maximum inheritance depth');
      }
    });

    it('should merge platform extensions with child priority', () => {
      const parent: ParsedPersona = {
        frontmatter: {
          name: 'base',
          cursor: { alwaysApply: true, globs: ['**/*.ts'] },
          claude: { model: 'opus' },
        },
        content: 'Base',
      };

      const child: ParsedPersona = {
        frontmatter: {
          name: 'child',
          extends: 'base',
          cursor: { globs: ['**/*.tsx'] },
          factory: { reasoningEffort: 'high' },
        },
        content: 'Child',
      };

      const result = resolvePersonaInheritance([parent, child]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const resolved = result.value.personas.find((p) => p.frontmatter.name === 'child');
        expect(resolved?.frontmatter.cursor).toEqual({
          alwaysApply: true,
          globs: ['**/*.tsx'],
        });
        expect(resolved?.frontmatter.claude).toEqual({ model: 'opus' });
        expect(resolved?.frontmatter.factory).toEqual({ reasoningEffort: 'high' });
      }
    });

    it('should warn on duplicate persona names and keep first', () => {
      const first: ParsedPersona = {
        frontmatter: { name: 'duplicate', description: 'first' },
        content: 'First',
        filePath: 'project/duplicate.md',
      };
      const second: ParsedPersona = {
        frontmatter: { name: 'duplicate', description: 'second' },
        content: 'Second',
        filePath: 'defaults/duplicate.md',
      };

      const result = resolvePersonaInheritance([first, second]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.personas).toHaveLength(1);
        expect(result.value.personas[0].frontmatter.description).toBe('first');
        expect(result.value.warnings).toHaveLength(1);
        expect(result.value.warnings[0].message).toContain('Duplicate persona');
        expect(result.value.warnings[0].persona).toBe('duplicate');
      }
    });

    it('should keep first duplicate persona and warn', () => {
      const first: ParsedPersona = {
        frontmatter: { name: 'duplicate', description: 'first' },
        content: 'First',
        filePath: 'project/duplicate.md',
      };
      const second: ParsedPersona = {
        frontmatter: { name: 'duplicate', description: 'second' },
        content: 'Second',
        filePath: 'defaults/duplicate.md',
      };

      const result = resolvePersonaInheritance([first, second]);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.personas).toHaveLength(1);
        expect(result.value.personas[0].frontmatter.description).toBe('first');
        expect(result.value.warnings).toHaveLength(1);
        expect(result.value.warnings[0].message).toContain('Duplicate persona');
        expect(result.value.warnings[0].persona).toBe('duplicate');
      }
    });
  });

  describe('filterPersonasByTarget()', () => {
    const personas = [
      {
        frontmatter: { name: 'cursor-only', targets: ['cursor'] as const },
        content: '',
      },
      {
        frontmatter: { name: 'claude-only', targets: ['claude'] as const },
        content: '',
      },
      {
        frontmatter: { name: 'all', targets: ['cursor', 'claude', 'factory'] as const },
        content: '',
      },
    ];

    it('should filter by cursor', () => {
      const filtered = filterPersonasByTarget(personas as any, 'cursor');

      expect(filtered.length).toBe(2);
      expect(filtered.map((p) => p.frontmatter.name)).toContain('cursor-only');
      expect(filtered.map((p) => p.frontmatter.name)).toContain('all');
    });

    it('should filter by claude', () => {
      const filtered = filterPersonasByTarget(personas as any, 'claude');

      expect(filtered.length).toBe(2);
      expect(filtered.map((p) => p.frontmatter.name)).not.toContain('cursor-only');
    });
  });

  describe('getUniqueTools()', () => {
    it('should collect unique tools from all personas', () => {
      const personas = [
        { frontmatter: { name: 'p1', tools: ['read', 'write'] }, content: '' },
        { frontmatter: { name: 'p2', tools: ['write', 'edit', 'execute'] }, content: '' },
        { frontmatter: { name: 'p3', tools: ['read', 'search'] }, content: '' },
      ];

      const tools = getUniqueTools(personas as any);

      expect(tools).toHaveLength(5);
      expect(tools).toContain('read');
      expect(tools).toContain('write');
      expect(tools).toContain('edit');
      expect(tools).toContain('execute');
      expect(tools).toContain('search');
    });

    it('should use defaults when persona has no tools', () => {
      const personas = [
        { frontmatter: { name: 'no-tools' }, content: '' },
      ];

      const tools = getUniqueTools(personas as any);

      expect(tools.length).toBeGreaterThan(0);
    });

    it('should handle empty persona array', () => {
      const tools = getUniqueTools([]);

      expect(tools).toEqual([]);
    });
  });
});

