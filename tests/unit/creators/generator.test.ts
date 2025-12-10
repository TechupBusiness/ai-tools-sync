import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CONFIG_DIR } from '../../../src/config/loader.js';
import { generate } from '../../../src/creators/generator.js';

describe('creator/generator', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = path.join(
      tmpdir(),
      `ai-sync-create-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
    vi.clearAllMocks();
    vi.resetModules();
    vi.doUnmock('@/linters/rule-linter.js');
  });

  it('normalizes rule globs and targets', async () => {
    const result = await generate({
      kind: 'rule',
      name: 'Feature Rule',
      description: 'Test rule',
      globs: ['src/**/*.ts, src/**/*.tsx'],
      projectRoot,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.frontmatter.name).toBe('feature-rule');
      expect(result.value.frontmatter.globs).toEqual(['src/**/*.ts', 'src/**/*.tsx']);
      expect(result.value.frontmatter.targets).toEqual(['cursor', 'claude', 'factory']);

      const rulePath = path.join(projectRoot, DEFAULT_CONFIG_DIR, 'rules', 'feature-rule.md');
      const exists = await fs
        .stat(rulePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    }
  });

  it('maps persona tools and warns on unknown values', async () => {
    const result = await generate({
      kind: 'persona',
      name: 'Helper',
      tools: ['read', 'custom'],
      model: 'default',
      projectRoot,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.frontmatter.tools).toEqual(['read', 'custom']);
      expect(result.value.warnings.some((warning) => warning.includes('kept as-is'))).toBe(true);
      expect(result.value.warnings.some((warning) => warning.includes('Invalid tool'))).toBe(true);
    }
  });

  it('preserves custom model values with warnings', async () => {
    const result = await generate({
      kind: 'persona',
      name: 'ModelUser',
      model: 'gpt-4',
      tools: ['read'],
      projectRoot,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.frontmatter.model).toBe('gpt-4');
      expect(result.value.warnings.some((warning) => warning.includes('Model'))).toBe(true);
    }
  });

  it('requires execute for command generation', async () => {
    const result = await generate({
      kind: 'command',
      name: 'deploy',
      projectRoot,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues?.some((issue) => issue.field === 'execute')).toBe(true);
    }
  });

  it('creates hooks with default event', async () => {
    const result = await generate({
      kind: 'hook',
      name: 'notify',
      projectRoot,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.frontmatter.event).toBe('PreToolUse');
    }
  });

  it('supports dry-run without writing files', async () => {
    const result = await generate({
      kind: 'rule',
      name: 'dry-run-rule',
      globs: ['src/**/*.ts'],
      dryRun: true,
      projectRoot,
    });

    expect(result.ok).toBe(true);
    const rulePath = path.join(projectRoot, DEFAULT_CONFIG_DIR, 'rules', 'dry-run-rule.md');
    const exists = await fs
      .stat(rulePath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it('blocks overwrite unless force is enabled', async () => {
    const rulePath = path.join(projectRoot, DEFAULT_CONFIG_DIR, 'rules', 'conflict.md');
    await fs.mkdir(path.dirname(rulePath), { recursive: true });
    await fs.writeFile(rulePath, 'existing');

    const first = await generate({
      kind: 'rule',
      name: 'conflict',
      globs: ['src/**/*.ts'],
      projectRoot,
    });
    expect(first.ok).toBe(false);

    const second = await generate({
      kind: 'rule',
      name: 'conflict',
      globs: ['src/**/*.ts'],
      overwrite: true,
      projectRoot,
    });

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.warnings.some((w) => w.includes('Overwriting'))).toBe(true);
    }
  });

  it('updates gitignore when writing into tool folders', async () => {
    const result = await generate({
      kind: 'rule',
      name: 'gitignored',
      globs: ['src/**/*.ts'],
      projectRoot,
      configDir: '.cursor',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const gitignorePath = path.join(projectRoot, '.cursor', '.gitignore');
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
      expect(gitignoreContent).toContain('# >>> AI Tool Sync Generated (auto-managed) >>>');
      expect(result.value.warnings.some((w) => w.includes('.gitignore'))).toBe(true);
    }
  });

  it('runs lint when requested', async () => {
    const mockLintRules = vi.fn(() => ({
      ok: true as const,
      value: {
        rules: [
          {
            filePath: 'rule.md',
            ruleName: 'rule',
            issues: [{ ruleId: 'demo', severity: 'warning', message: 'Lint warning' }],
            hasErrors: false,
            hasWarnings: true,
          },
        ],
        summary: { errors: 0, warnings: 1, info: 0, filesLinted: 1, filesWithIssues: 1 },
        success: true,
      },
    }));

    vi.doMock('@/linters/rule-linter.js', () => ({
      lintRules: mockLintRules,
    }));

    const result = await generate({
      kind: 'rule',
      name: 'linted',
      globs: ['src/**/*.ts'],
      runLint: true,
      projectRoot,
    });

    expect(result.ok).toBe(true);
    expect(mockLintRules).toHaveBeenCalledTimes(1);
    if (result.ok) {
      expect(result.value.warnings.some((w) => w.includes('Lint'))).toBe(true);
    }
  });

  it('warns when lint module is unavailable', async () => {
    vi.doMock('@/linters/rule-linter.js', () => {
      throw new Error('module not found');
    });

    const result = await generate({
      kind: 'rule',
      name: 'lint-missing',
      globs: ['src/**/*.ts'],
      runLint: true,
      projectRoot,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.warnings.some((w) => w.includes('not available'))).toBe(true);
    }
  });
});
