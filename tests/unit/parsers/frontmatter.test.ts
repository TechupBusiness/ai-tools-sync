/**
 * @file Frontmatter Parser Tests
 * @description Tests for YAML frontmatter parsing from markdown files
 */

import { describe, it, expect } from 'vitest';

import {
  parseFrontmatter,
  hasFrontmatter,
  validateRequiredFields,
  applyDefaults,
  formatParseError,
} from '../../../src/parsers/frontmatter.js';
import { isOk, isErr } from '../../../src/utils/result.js';

describe('Frontmatter Parser', () => {
  describe('hasFrontmatter()', () => {
    it('should return true when content starts with ---', () => {
      const content = `---
name: test
---
# Content`;
      expect(hasFrontmatter(content)).toBe(true);
    });

    it('should return true when content starts with --- after whitespace', () => {
      const content = `  ---
name: test
---
# Content`;
      expect(hasFrontmatter(content)).toBe(true);
    });

    it('should return false when content does not start with ---', () => {
      const content = `# No frontmatter
Just content`;
      expect(hasFrontmatter(content)).toBe(false);
    });

    it('should return false for empty content', () => {
      expect(hasFrontmatter('')).toBe(false);
    });

    it('should return false for content with --- not at start', () => {
      const content = `# Title
---
name: test
---`;
      expect(hasFrontmatter(content)).toBe(false);
    });
  });

  describe('parseFrontmatter()', () => {
    it('should parse valid YAML frontmatter', () => {
      const content = `---
name: test-rule
description: A test rule
version: 1.0.0
---
# Rule Content

This is the rule body.`;

      const result = parseFrontmatter(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.data).toEqual({
          name: 'test-rule',
          description: 'A test rule',
          version: '1.0.0',
        });
        expect(result.value.content.trim()).toBe('# Rule Content\n\nThis is the rule body.');
        expect(result.value.isEmpty).toBe(false);
      }
    });

    it('should handle empty frontmatter', () => {
      const content = `---
---
# Content`;

      const result = parseFrontmatter(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.isEmpty).toBe(true);
        expect(result.value.data).toEqual({});
      }
    });

    it('should handle missing frontmatter', () => {
      const content = `# No frontmatter

Just some content here.`;

      const result = parseFrontmatter(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.isEmpty).toBe(true);
        expect(result.value.data).toEqual({});
        expect(result.value.content).toBe(content);
        expect(result.value.contentStartLine).toBe(1);
      }
    });

    it('should handle empty content', () => {
      const result = parseFrontmatter('');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.isEmpty).toBe(true);
        expect(result.value.content).toBe('');
      }
    });

    it('should handle whitespace-only content', () => {
      const result = parseFrontmatter('   \n  \n  ');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.isEmpty).toBe(true);
      }
    });

    it('should parse arrays in frontmatter', () => {
      const content = `---
name: test
globs:
  - "*.ts"
  - "**/*.tsx"
targets:
  - cursor
  - claude
---
Content`;

      const result = parseFrontmatter(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.data).toEqual({
          name: 'test',
          globs: ['*.ts', '**/*.tsx'],
          targets: ['cursor', 'claude'],
        });
      }
    });

    it('should parse nested objects in frontmatter', () => {
      const content = `---
name: test
traits:
  verbose: true
  strictMode: false
  config:
    timeout: 30
---
Content`;

      const result = parseFrontmatter(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.data).toEqual({
          name: 'test',
          traits: {
            verbose: true,
            strictMode: false,
            config: {
              timeout: 30,
            },
          },
        });
      }
    });

    it('should preserve content after frontmatter exactly', () => {
      const content = `---
name: test
---
# Title

Some **bold** and *italic* text.

\`\`\`typescript
const x = 1;
\`\`\`
`;

      const result = parseFrontmatter(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.content).toContain('# Title');
        expect(result.value.content).toContain('**bold**');
        expect(result.value.content).toContain('```typescript');
      }
    });

    it('should handle special characters in content', () => {
      const content = `---
name: test
---
Special chars: & < > " ' \` @ # $ % ^ * ()`;

      const result = parseFrontmatter(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.content).toContain('& < > " \' ` @ # $ % ^ * ()');
      }
    });

    it('should handle multiline YAML values', () => {
      const content = `---
name: test
description: |
  This is a multiline
  description that spans
  multiple lines.
---
Content`;

      const result = parseFrontmatter(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.data.description).toContain('multiline');
        expect(result.value.data.description).toContain('multiple lines');
      }
    });

    it('should return error for invalid YAML', () => {
      const content = `---
name: test
invalid: [not closed
---
Content`;

      const result = parseFrontmatter(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Failed to parse');
      }
    });

    it('should return error with line number for YAML errors', () => {
      const content = `---
name: test
bad_indent:
    nested: true
  wrong: indent
---
Content`;

      const result = parseFrontmatter(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Failed to parse');
        // Line number should be present in the error
        expect(result.error.line).toBeDefined();
      }
    });

    it('should extract raw frontmatter string', () => {
      const content = `---
name: test
version: 1.0.0
---
Content`;

      const result = parseFrontmatter(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.rawFrontmatter).toContain('name: test');
        expect(result.value.rawFrontmatter).toContain('version: 1.0.0');
      }
    });

    it('should calculate correct content start line', () => {
      const content = `---
name: test
version: 1.0.0
targets:
  - cursor
---
# Content starts here`;

      const result = parseFrontmatter(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Line 1: ---
        // Line 2: name: test
        // Line 3: version: 1.0.0
        // Line 4: targets:
        // Line 5:   - cursor
        // Line 6: ---
        // Line 7: # Content starts here
        // contentStartLine counts lines including the closing ---, so it's 7
        expect(result.value.contentStartLine).toBe(7);
      }
    });
  });

  describe('validateRequiredFields()', () => {
    it('should return empty array when all required fields present', () => {
      const data = { name: 'test', description: 'desc' };
      const required = ['name', 'description'];

      const missing = validateRequiredFields(data, required);

      expect(missing).toEqual([]);
    });

    it('should return missing field names', () => {
      const data = { name: 'test' };
      const required = ['name', 'description', 'version'];

      const missing = validateRequiredFields(data, required);

      expect(missing).toEqual(['description', 'version']);
    });

    it('should handle empty data', () => {
      const data = {};
      const required = ['name'];

      const missing = validateRequiredFields(data, required);

      expect(missing).toEqual(['name']);
    });

    it('should handle empty required array', () => {
      const data = { name: 'test' };
      const required: string[] = [];

      const missing = validateRequiredFields(data, required);

      expect(missing).toEqual([]);
    });

    it('should treat undefined values as missing', () => {
      const data = { name: undefined };
      const required = ['name'];

      const missing = validateRequiredFields(data, required);

      expect(missing).toEqual(['name']);
    });
  });

  describe('applyDefaults()', () => {
    it('should apply defaults for missing fields', () => {
      const data = { name: 'test' };
      const defaults = { name: 'default-name', version: '1.0.0', enabled: true };

      const result = applyDefaults(data, defaults);

      expect(result).toEqual({
        name: 'test',
        version: '1.0.0',
        enabled: true,
      });
    });

    it('should not override existing values', () => {
      const data = { name: 'test', version: '2.0.0' };
      const defaults = { name: 'default', version: '1.0.0' };

      const result = applyDefaults(data, defaults);

      expect(result.name).toBe('test');
      expect(result.version).toBe('2.0.0');
    });

    it('should handle empty data', () => {
      const data = {};
      const defaults = { name: 'default', version: '1.0.0' };

      const result = applyDefaults(data, defaults);

      expect(result).toEqual(defaults);
    });

    it('should handle empty defaults', () => {
      const data = { name: 'test' };
      const defaults = {};

      const result = applyDefaults(data, defaults);

      expect(result).toEqual({ name: 'test' });
    });

    it('should not apply undefined values', () => {
      const data = { name: undefined };
      const defaults = { name: 'default', version: '1.0.0' };

      const result = applyDefaults(data, defaults);

      expect(result.name).toBe('default');
    });
  });

  describe('formatParseError()', () => {
    it('should format error with file path and line', () => {
      const error = {
        message: 'Invalid YAML',
        line: 5,
        column: 10,
      };

      const formatted = formatParseError(error, '/path/to/file.md');

      expect(formatted).toBe('/path/to/file.md:5:10: Invalid YAML');
    });

    it('should format error with just line number', () => {
      const error = {
        message: 'Invalid YAML',
        line: 5,
      };

      const formatted = formatParseError(error);

      expect(formatted).toBe('Line 5: Invalid YAML');
    });

    it('should format error without location', () => {
      const error = {
        message: 'Invalid YAML',
      };

      const formatted = formatParseError(error);

      expect(formatted).toBe('Invalid YAML');
    });

    it('should format error with file path but no line', () => {
      const error = {
        message: 'Missing frontmatter',
      };

      const formatted = formatParseError(error, '/path/to/file.md');

      expect(formatted).toBe('/path/to/file.md: Missing frontmatter');
    });
  });
});
