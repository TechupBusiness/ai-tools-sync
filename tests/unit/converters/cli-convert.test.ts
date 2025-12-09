import * as fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { convert } from '../../../src/cli/commands/convert.js';

function buildContent(frontmatter: string, body = ''): string {
  return `---\n${frontmatter.trim()}\n---\n\n${body}`;
}

describe('cli convert command', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'tests', 'fixtures', `convert-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('writes converted cursor rule into rules directory', async () => {
    const cursorRuleDir = path.join(testDir, '.cursor', 'rules');
    await fs.mkdir(cursorRuleDir, { recursive: true });
    await fs.writeFile(
      path.join(cursorRuleDir, 'sample.mdc'),
      buildContent(
        `
name: sample
alwaysApply: true
globs: "*.ts"
        `,
        '# Body'
      )
    );

    const result = await convert({ projectRoot: testDir });

    expect(result.success).toBe(true);
    expect(result.converted).toContain('rules/sample.md');

    const output = await fs.readFile(
      path.join(testDir, '.ai-tool-sync', 'rules', 'sample.md'),
      'utf8'
    );
    expect(output).toContain('always_apply: true');
    expect(output).toMatch(/globs:\s+- ['"]?\*\.ts['"]?/);
  });

  it('suffixes duplicate names to avoid overwrite', async () => {
    const cursorRuleDir = path.join(testDir, '.cursor', 'rules');
    await fs.mkdir(path.join(cursorRuleDir, 'nested'), { recursive: true });

    const ruleFrontmatter = `
name: duplicate
globs: "**/*.ts"
`;

    await fs.writeFile(path.join(cursorRuleDir, 'one.mdc'), buildContent(ruleFrontmatter, 'First'));
    await fs.writeFile(
      path.join(cursorRuleDir, 'nested', 'two.mdc'),
      buildContent(ruleFrontmatter, 'Second')
    );

    const result = await convert({ projectRoot: testDir });

    expect(result.success).toBe(true);
    expect(result.converted).toContain('rules/duplicate.md');
    expect(result.converted).toContain('rules/duplicate-1.md');
  });

  it('copies mixed files to input with warning', async () => {
    const agentsPath = path.join(testDir, 'AGENTS.md');
    await fs.writeFile(agentsPath, '# Mixed');

    const result = await convert({ projectRoot: testDir });

    expect(result.warnings.some((warning) => warning.includes('input'))).toBe(true);
    const copied = await fs.readFile(
      path.join(testDir, '.ai-tool-sync', 'input', 'AGENTS.md'),
      'utf8'
    );
    expect(copied).toContain('# Mixed');
  });

  it('fails in strict mode when conversion emits warnings', async () => {
    const cursorRuleDir = path.join(testDir, '.cursor', 'rules');
    await fs.mkdir(cursorRuleDir, { recursive: true });
    await fs.writeFile(path.join(cursorRuleDir, 'no-frontmatter.mdc'), '# Missing fm');

    const result = await convert({ projectRoot: testDir, strict: true });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
