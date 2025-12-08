import { describe, it, expect } from 'vitest';

import { transformConditionalContent } from '../../../src/transformers/conditional-content.js';

describe('Conditional Content Transformer', () => {
  describe('transformConditionalContent()', () => {
    describe('basic functionality', () => {
      it('should return content unchanged when no conditional blocks', () => {
        const content = '# Hello\n\nSome content here.';
        expect(transformConditionalContent(content, 'claude')).toBe(content);
      });

      it('should include matching platform content', () => {
        const content = '{{#claude}}Claude content{{/claude}}';
        expect(transformConditionalContent(content, 'claude')).toBe('Claude content');
      });

      it('should exclude non-matching platform content', () => {
        const content = '{{#cursor}}Cursor content{{/cursor}}';
        expect(transformConditionalContent(content, 'claude')).toBe('');
      });

      it('should process multiple blocks', () => {
        const content = `
{{#claude}}Claude section{{/claude}}
{{#cursor}}Cursor section{{/cursor}}
{{#factory}}Factory section{{/factory}}
`;
        const result = transformConditionalContent(content, 'claude');
        expect(result).toContain('Claude section');
        expect(result).not.toContain('Cursor section');
        expect(result).not.toContain('Factory section');
      });

      it('should preserve content between blocks', () => {
        const content = `Start
{{#claude}}Claude{{/claude}}
Middle
{{#cursor}}Cursor{{/cursor}}
End`;
        const result = transformConditionalContent(content, 'claude');
        expect(result).toContain('Start');
        expect(result).toContain('Claude');
        expect(result).toContain('Middle');
        expect(result).not.toContain('Cursor');
        expect(result).toContain('End');
      });
    });

    describe('negation operator (!)', () => {
      it('should exclude negated platform', () => {
        const content = '{{#!cursor}}Not for Cursor{{/!cursor}}';
        expect(transformConditionalContent(content, 'cursor')).toBe('');
        expect(transformConditionalContent(content, 'claude')).toBe('Not for Cursor');
      });

      it('should include content for all non-negated platforms', () => {
        const content = '{{#!factory}}Not Factory{{/!factory}}';
        expect(transformConditionalContent(content, 'cursor')).toBe('Not Factory');
        expect(transformConditionalContent(content, 'claude')).toBe('Not Factory');
        expect(transformConditionalContent(content, 'factory')).toBe('');
      });
    });

    describe('OR operator (|)', () => {
      it('should include if any platform matches', () => {
        const content = '{{#claude|factory}}Either platform{{/claude|factory}}';
        expect(transformConditionalContent(content, 'claude')).toBe('Either platform');
        expect(transformConditionalContent(content, 'factory')).toBe('Either platform');
        expect(transformConditionalContent(content, 'cursor')).toBe('');
      });

      it('should handle three platforms with OR', () => {
        const content = '{{#cursor|claude|factory}}All platforms{{/cursor|claude|factory}}';
        expect(transformConditionalContent(content, 'cursor')).toBe('All platforms');
        expect(transformConditionalContent(content, 'claude')).toBe('All platforms');
        expect(transformConditionalContent(content, 'factory')).toBe('All platforms');
      });
    });

    describe('AND operator (&)', () => {
      it('should exclude if target is negated in AND', () => {
        const content = '{{#claude&!cursor}}Claude without Cursor{{/claude&!cursor}}';
        expect(transformConditionalContent(content, 'claude')).toBe('Claude without Cursor');
        expect(transformConditionalContent(content, 'cursor')).toBe('');
        expect(transformConditionalContent(content, 'factory')).toBe('');
      });
    });

    describe('edge cases', () => {
      it('should handle empty blocks', () => {
        const content = 'Before{{#claude}}{{/claude}}After';
        expect(transformConditionalContent(content, 'claude')).toBe('BeforeAfter');
        expect(transformConditionalContent(content, 'cursor')).toBe('BeforeAfter');
      });

      it('should leave mismatched tags as-is', () => {
        const content = '{{#claude}}Content{{/cursor}}';
        expect(transformConditionalContent(content, 'claude')).toBe(content);
      });

      it('should handle blocks with multiline content', () => {
        const content = `{{#claude}}
Line 1
Line 2
Line 3
{{/claude}}`;
        const result = transformConditionalContent(content, 'claude');
        expect(result).toContain('Line 1');
        expect(result).toContain('Line 2');
        expect(result).toContain('Line 3');
      });

      it('should handle content with curly braces that are not blocks', () => {
        const content = 'Code: `const x = { a: 1 }`';
        expect(transformConditionalContent(content, 'claude')).toBe(content);
      });

      it('should handle invalid targets gracefully', () => {
        const content = '{{#invalid}}Content{{/invalid}}';
        // Invalid target means no platforms match, so content is excluded
        expect(transformConditionalContent(content, 'claude')).toBe('');
      });

      it('should ignore whitespace inside tags (strict syntax)', () => {
        const content = '{{ #claude }}Content{{ /claude }}';
        // Should not match, left as-is
        expect(transformConditionalContent(content, 'claude')).toBe(content);
      });

      it('should handle nested blocks (outer takes precedence)', () => {
        const content = '{{#claude}}Outer {{#cursor}}Inner{{/cursor}} End{{/claude}}';
        // Entire outer block is processed, inner tags become content
        const result = transformConditionalContent(content, 'claude');
        expect(result).toBe('Outer {{#cursor}}Inner{{/cursor}} End');
      });
    });

    describe('whitespace handling', () => {
      it('should collapse multiple blank lines by default', () => {
        const content = `Before

{{#cursor}}Cursor{{/cursor}}

After`;
        const result = transformConditionalContent(content, 'claude');
        // Should not have more than 2 consecutive newlines
        expect(result).not.toMatch(/\n{3,}/);
      });

      it('should preserve whitespace when option is set', () => {
        const content = `Before

{{#cursor}}Cursor{{/cursor}}

After`;
        const result = transformConditionalContent(content, 'claude', {
          preserveWhitespace: true,
        });
        // Original whitespace preserved (block becomes empty string)
        expect(result).toBe('Before\n\n\n\nAfter');
      });
    });
  });
});
