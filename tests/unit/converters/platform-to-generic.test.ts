import { describe, expect, it } from 'vitest';

import { convertPlatformFile } from '../../../src/converters/platform-to-generic.js';

import type { PlatformFileInput } from '../../../src/converters/types.js';

function buildContent(frontmatter: string, body = ''): string {
  return `---\n${frontmatter.trim()}\n---\n\n${body}`;
}

describe('platform-to-generic conversion', () => {
  it('normalizes cursor rule globs and always_apply', () => {
    const input: PlatformFileInput = {
      platform: 'cursor',
      kind: 'rule',
      sourcePath: '/project/.cursor/rules/sample.mdc',
      relativePath: '.cursor/rules/sample.mdc',
      content: buildContent(
        `
name: sample
description: Sample rule
alwaysApply: true
globs: "*.ts, *.tsx"
        `,
        '# Sample'
      ),
    };

    const result = convertPlatformFile(input);
    expect(result.ok).toBe(true);
    const conversion = result.ok ? result.value[0] : undefined;
    expect(conversion?.frontmatter).toMatchObject({
      name: 'sample',
      description: 'Sample rule',
      always_apply: true,
      globs: ['*.ts', '*.tsx'],
    });
  });

  it('maps cursor command allowedTools and preserves cursor extension', () => {
    const input: PlatformFileInput = {
      platform: 'cursor',
      kind: 'command',
      sourcePath: '/project/.cursor/commands/build.md',
      relativePath: '.cursor/commands/build.md',
      content: buildContent(
        `
name: build
execute: npm test
allowedTools:
  - Read
  - Execute
        `,
        'Run tests'
      ),
    };

    const result = convertPlatformFile(input);
    expect(result.ok).toBe(true);
    const conversion = result.ok ? result.value[0] : undefined;
    expect(conversion?.frontmatter).toMatchObject({
      name: 'build',
      allowedTools: ['read', 'execute'],
    });
    expect(conversion?.frontmatter.cursor).toMatchObject({
      allowedTools: ['Read', 'Execute'],
    });
  });

  it('reverse-maps claude persona tools and model', () => {
    const input: PlatformFileInput = {
      platform: 'claude',
      kind: 'persona',
      sourcePath: '/project/.claude/agents/agent.md',
      relativePath: '.claude/agents/agent.md',
      content: buildContent(
        `
name: agent
tools:
  - Read
model: claude-3-5-haiku-20241022
        `,
        'You are helpful'
      ),
    };

    const result = convertPlatformFile(input);
    expect(result.ok).toBe(true);
    const conversion = result.ok ? result.value[0] : undefined;
    expect(conversion?.frontmatter).toMatchObject({
      name: 'agent',
      tools: ['read'],
      model: 'fast',
    });
  });

  it('maps factory droid reasoningEffort and allowed-tools', () => {
    const input: PlatformFileInput = {
      platform: 'factory',
      kind: 'persona',
      sourcePath: '/project/.factory/droids/helper.md',
      relativePath: '.factory/droids/helper.md',
      content: buildContent(
        `
name: helper
description: Factory droid
tools:
  - read
reasoningEffort: high
allowed-tools:
  - write
model: powerful
        `,
        'Factory helper'
      ),
    };

    const result = convertPlatformFile(input);
    expect(result.ok).toBe(true);
    const conversion = result.ok ? result.value[0] : undefined;
    expect(conversion?.frontmatter).toMatchObject({
      name: 'helper',
      model: 'powerful',
    });
    expect(conversion?.frontmatter.factory).toMatchObject({
      reasoningEffort: 'high',
      'allowed-tools': ['write'],
    });
  });

  it('flags mixed files for manual handling', () => {
    const input: PlatformFileInput = {
      platform: 'claude',
      kind: 'mixed',
      sourcePath: '/project/CLAUDE.md',
      relativePath: 'CLAUDE.md',
      content: '# Mixed content',
    };

    const result = convertPlatformFile(input);
    expect(result.ok).toBe(false);
    const issues = result.ok ? [] : (result.error.issues ?? []);
    expect(issues.some((issue) => issue.level === 'warning')).toBe(true);
  });

  it('preserves unknown claude tools under extension with warning', () => {
    const input: PlatformFileInput = {
      platform: 'claude',
      kind: 'persona',
      sourcePath: '/project/.claude/agents/unknown.md',
      relativePath: '.claude/agents/unknown.md',
      content: buildContent(
        `
name: unknown
tools:
  - MysteryTool
model: unknown-model
        `,
        'Body'
      ),
    };

    const result = convertPlatformFile(input);
    expect(result.ok).toBe(true);
    const conversion = result.ok ? result.value[0] : undefined;
    expect(conversion?.frontmatter.claude).toMatchObject({
      tools: ['MysteryTool'],
      model: 'unknown-model',
    });
    expect(conversion?.warnings.some((warning) => warning.includes('Unknown Claude tool'))).toBe(
      true
    );
  });

  it('infers name when frontmatter missing', () => {
    const input: PlatformFileInput = {
      platform: 'cursor',
      kind: 'rule',
      sourcePath: '/project/.cursor/rules/no-fm.mdc',
      relativePath: '.cursor/rules/no-fm.mdc',
      content: '# No frontmatter here',
    };

    const result = convertPlatformFile(input);
    expect(result.ok).toBe(true);
    const conversion = result.ok ? result.value[0] : undefined;
    expect(conversion?.frontmatter.name).toBe('no-fm');
    expect(conversion?.warnings.some((warning) => warning.includes('Name'))).toBe(true);
  });
});
