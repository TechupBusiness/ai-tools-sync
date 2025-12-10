import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { create } from '../../../src/cli/commands/create.js';
import { DEFAULT_CONFIG_DIR } from '../../../src/config/loader.js';

vi.mock('../../../src/cli/output.js', async () => {
  const actual = await vi.importActual('../../../src/cli/output.js');
  return {
    ...actual,
    printHeader: vi.fn(),
    printGeneratedFile: vi.fn(),
    printWarning: vi.fn(),
    printError: vi.fn(),
    printSummary: vi.fn(),
  };
});

describe('cli create command', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = path.join(
      tmpdir(),
      `ai-sync-create-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
    vi.clearAllMocks();
    vi.resetModules();
    vi.doUnmock('@/linters/rule-linter.js');
  });

  it('writes to a custom config directory and prints summary', async () => {
    const result = await create('rule', 'custom-rule', {
      projectRoot,
      configDir: '.custom-ai',
      globs: ['src/**/*.ts'],
    });

    expect(result.success).toBe(true);

    const filePath = path.join(projectRoot, '.custom-ai', 'rules', 'custom-rule.md');
    const exists = await fs
      .stat(filePath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it('supports dry-run without writing files', async () => {
    const result = await create('persona', 'preview-persona', {
      projectRoot,
      dryRun: true,
      tools: ['read'],
    });

    expect(result.success).toBe(true);
    const personaPath = path.join(
      projectRoot,
      DEFAULT_CONFIG_DIR,
      'personas',
      'preview-persona.md'
    );
    const exists = await fs
      .stat(personaPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it('blocks overwrite unless force is provided', async () => {
    const rulePath = path.join(projectRoot, DEFAULT_CONFIG_DIR, 'rules', 'exists.md');
    await fs.mkdir(path.dirname(rulePath), { recursive: true });
    await fs.writeFile(rulePath, 'existing');

    const result = await create('rule', 'exists', {
      projectRoot,
      globs: ['src/**/*.ts'],
    });

    expect(result.success).toBe(false);
    expect(result.issues?.some((issue) => issue.field === 'path')).toBe(true);
  });

  it('runs lint when requested via CLI flag', async () => {
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

    const result = await create('rule', 'lint-cli', {
      projectRoot,
      globs: ['src/**/*.ts'],
      runLint: true,
    });

    const output = await import('../../../src/cli/output.js');
    const printWarning = output.printWarning as unknown as vi.Mock;

    expect(result.success).toBe(true);
    expect(mockLintRules).toHaveBeenCalledTimes(1);
    expect(printWarning.mock.calls.some(([msg]) => String(msg).includes('Lint'))).toBe(true);
  });
});
