import fs from 'node:fs/promises';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseRule } from '../../../src/parsers/rule.js';
import {
  buildProjectContext,
  evaluateConditionExpression,
  parseConditionExpression,
  parseConditionTerm,
  parseIdentifier,
  shouldIncludeRule,
} from '../../../src/transformers/condition-evaluator.js';

const FIXTURES_PATH = path.join(__dirname, '../../fixtures/conditional-rules');

async function loadRule(fileName: string) {
  const content = await fs.readFile(path.join(FIXTURES_PATH, 'rules', fileName), 'utf-8');
  const parsed = parseRule(content, fileName);

  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    throw new Error('Failed to parse rule fixture');
  }

  return parsed.value;
}

describe('Condition Evaluator', () => {
  describe('parseIdentifier()', () => {
    it('parses npm package identifiers', () => {
      const result = parseIdentifier('npm:react');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.namespace).toBe('npm');
        expect(result.value.name).toBe('react');
      }
    });

    it('parses scoped npm packages', () => {
      const result = parseIdentifier('npm:@types/node');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.namespace).toBe('npm');
        expect(result.value.name).toBe('@types/node');
      }
    });

    it('parses file identifiers with spaces using quotes', () => {
      const result = parseIdentifier('file:"path with spaces/tsconfig.json"');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.namespace).toBe('file');
        expect(result.value.name).toBe('path with spaces/tsconfig.json');
      }
    });

    it('returns error for unknown namespace', () => {
      const result = parseIdentifier('foo:bar');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('UNKNOWN_NAMESPACE');
      }
    });
  });

  describe('parseConditionTerm()', () => {
    it('parses existence checks', () => {
      const result = parseConditionTerm('npm:react');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.negated).toBe(false);
        expect(result.value.operator).toBeNull();
      }
    });

    it('parses negated existence', () => {
      const result = parseConditionTerm('!npm:react');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.negated).toBe(true);
        expect(result.value.operator).toBeNull();
      }
    });

    it('parses equality comparison', () => {
      const result = parseConditionTerm('pkg:type == "module"');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.operator).toBe('==');
        expect(result.value.value).toBe('module');
      }
    });
  });

  describe('evaluateConditionExpression()', () => {
    const context = buildProjectContext(FIXTURES_PATH);

    it('detects npm dependencies from package.json', async () => {
      const result = await evaluateConditionExpression('npm:react', context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.matches).toBe(true);
      }
    });

    it('detects pip dependencies from requirements.txt', async () => {
      const result = await evaluateConditionExpression('pip:django', context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.matches).toBe(true);
      }
    });

    it('detects Go modules from go.mod', async () => {
      const result = await evaluateConditionExpression('go:github.com/gin-gonic/gin', context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.matches).toBe(true);
      }
    });

    it('detects file and directory existence', async () => {
      const fileResult = await evaluateConditionExpression('file:tsconfig.json', context);
      expect(fileResult.ok && fileResult.value.matches).toBe(true);

      const dirResult = await evaluateConditionExpression('dir:rules', context);
      expect(dirResult.ok && dirResult.value.matches).toBe(true);
    });

    it('evaluates compound AND conditions with precedence', async () => {
      const expression = 'npm:react && npm:typescript || npm:vue';
      const result = parseConditionExpression(expression);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.conditions).toHaveLength(3);
        expect(result.value.operators).toEqual(['&&', '||']);
      }

      const evalResult = await evaluateConditionExpression(expression, context);
      expect(evalResult.ok).toBe(true);
      if (evalResult.ok) {
        expect(evalResult.value.matches).toBe(true);
      }
    });

    it('returns false when dependency is missing', async () => {
      const result = await evaluateConditionExpression('npm:vue', context);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.matches).toBe(false);
      }
    });
  });

  describe('shouldIncludeRule()', () => {
    const context = buildProjectContext(FIXTURES_PATH);

    it('includes rules without when condition', async () => {
      const rule = await loadRule('always-applies.md');
      const result = await shouldIncludeRule(rule.frontmatter, context);
      expect(result.ok && result.value).toBe(true);
    });

    it('includes rules when condition matches', async () => {
      const tsRule = await loadRule('typescript-only.md');
      const tsResult = await shouldIncludeRule(tsRule.frontmatter, context);
      expect(tsResult.ok && tsResult.value).toBe(true);

      const reactRule = await loadRule('react-only.md');
      const reactResult = await shouldIncludeRule(reactRule.frontmatter, context);
      expect(reactResult.ok && reactResult.value).toBe(true);
    });

    it('excludes rules when condition does not match', async () => {
      const rule = await loadRule('react-only.md');
      const result = await shouldIncludeRule(
        { ...rule.frontmatter, when: 'npm:nonexistent' },
        context
      );
      expect(result.ok && result.value).toBe(false);
    });
  });
});
