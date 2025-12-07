/**
 * @file Hook Parser Tests
 * @description Tests for hook file parsing, validation, and defaults
 */

import { describe, it, expect } from 'vitest';

import {
  parseHook,
  parseHooks,
  filterHooksByTarget,
  filterHooksByEvent,
  groupHooksByEvent,
  HOOK_DEFAULTS,
} from '../../../src/parsers/hook.js';
import { isOk, isErr } from '../../../src/utils/result.js';

describe('Hook Parser', () => {
  describe('parseHook()', () => {
    it('should parse valid hook with all fields', () => {
      const content = `---
name: pre-commit-lint
description: Run linting before commits
version: 1.0.0
event: PreToolUse
tool_match: "Bash(git commit*)"
execute: scripts/lint.sh
targets:
  - claude
---
# Pre-commit Lint Hook

Ensures code is linted before committing.`;

      const result = parseHook(content, 'hooks/pre-commit.md');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.name).toBe('pre-commit-lint');
        expect(result.value.frontmatter.description).toBe('Run linting before commits');
        expect(result.value.frontmatter.version).toBe('1.0.0');
        expect(result.value.frontmatter.event).toBe('PreToolUse');
        expect(result.value.frontmatter.tool_match).toBe('Bash(git commit*)');
        expect(result.value.frontmatter.execute).toBe('scripts/lint.sh');
        expect(result.value.frontmatter.targets).toEqual(['claude']);
        expect(result.value.content).toContain('Pre-commit Lint Hook');
        expect(result.value.filePath).toBe('hooks/pre-commit.md');
      }
    });

    it('should apply default targets (claude only)', () => {
      const content = `---
name: test-hook
event: PostToolUse
---
Content`;

      const result = parseHook(content);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.targets).toEqual(HOOK_DEFAULTS.targets);
        expect(result.value.frontmatter.targets).toContain('claude');
      }
    });

    it('should return error for missing name', () => {
      const content = `---
event: PreToolUse
---
Content`;

      const result = parseHook(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'name')).toBe(true);
      }
    });

    it('should return error for missing event', () => {
      const content = `---
name: test
---
Content`;

      const result = parseHook(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'event')).toBe(true);
      }
    });

    it('should return error for invalid event', () => {
      const content = `---
name: test
event: InvalidEvent
---
Content`;

      const result = parseHook(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'event')).toBe(true);
        expect(result.error.validationErrors?.some((e) => e.message.includes('InvalidEvent'))).toBe(true);
      }
    });

    it('should accept all valid event types', () => {
      const events = ['PreToolUse', 'PostToolUse', 'PreMessage', 'PostMessage', 'PreCommit'];

      for (const event of events) {
        const content = `---
name: test-${event}
event: ${event}
---
Content`;

        const result = parseHook(content);
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value.frontmatter.event).toBe(event);
        }
      }
    });

    it('should return error for non-string tool_match', () => {
      const content = `---
name: test
event: PreToolUse
tool_match: 123
---
Content`;

      const result = parseHook(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'tool_match')).toBe(true);
      }
    });

    it('should return error for invalid version format', () => {
      const content = `---
name: test
event: PreToolUse
version: not-semver
---
Content`;

      const result = parseHook(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.some((e) => e.path === 'version')).toBe(true);
      }
    });

    it('should return error for missing frontmatter', () => {
      const content = `# No frontmatter`;

      const result = parseHook(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('missing frontmatter');
      }
    });

    it('should collect all validation errors', () => {
      const content = `---
description: no name or event
version: bad
targets:
  - invalid
---
Content`;

      const result = parseHook(content);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.validationErrors?.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('parseHooks()', () => {
    it('should parse multiple valid hooks', () => {
      const files = [
        { content: `---\nname: hook1\nevent: PreToolUse\n---\n`, filePath: 'h1.md' },
        { content: `---\nname: hook2\nevent: PostToolUse\n---\n`, filePath: 'h2.md' },
      ];

      const result = parseHooks(files);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.length).toBe(2);
      }
    });

    it('should collect errors from invalid files', () => {
      const files = [
        { content: `---\nname: valid\nevent: PreToolUse\n---\n`, filePath: 'good.md' },
        { content: `---\nevent: PreToolUse\n---\n`, filePath: 'bad.md' },
      ];

      const result = parseHooks(files);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.length).toBe(1);
        expect(result.error[0].filePath).toBe('bad.md');
      }
    });
  });

  describe('filterHooksByTarget()', () => {
    const hooks = [
      {
        frontmatter: { name: 'claude-hook', event: 'PreToolUse', targets: ['claude'] as const },
        content: '',
      },
      {
        frontmatter: { name: 'all-hook', event: 'PreToolUse', targets: ['cursor', 'claude', 'factory'] as const },
        content: '',
      },
    ];

    it('should filter by claude', () => {
      const filtered = filterHooksByTarget(hooks as any, 'claude');

      expect(filtered.length).toBe(2);
    });

    it('should filter by cursor', () => {
      const filtered = filterHooksByTarget(hooks as any, 'cursor');

      expect(filtered.length).toBe(1);
      expect(filtered[0].frontmatter.name).toBe('all-hook');
    });
  });

  describe('filterHooksByEvent()', () => {
    const hooks = [
      { frontmatter: { name: 'h1', event: 'PreToolUse' }, content: '' },
      { frontmatter: { name: 'h2', event: 'PostToolUse' }, content: '' },
      { frontmatter: { name: 'h3', event: 'PreToolUse' }, content: '' },
    ];

    it('should filter by PreToolUse', () => {
      const filtered = filterHooksByEvent(hooks as any, 'PreToolUse');

      expect(filtered.length).toBe(2);
      expect(filtered.map((h) => h.frontmatter.name)).toEqual(['h1', 'h3']);
    });

    it('should filter by PostToolUse', () => {
      const filtered = filterHooksByEvent(hooks as any, 'PostToolUse');

      expect(filtered.length).toBe(1);
      expect(filtered[0].frontmatter.name).toBe('h2');
    });

    it('should return empty array for unused events', () => {
      const filtered = filterHooksByEvent(hooks as any, 'PreCommit');

      expect(filtered.length).toBe(0);
    });
  });

  describe('groupHooksByEvent()', () => {
    const hooks = [
      { frontmatter: { name: 'h1', event: 'PreToolUse' }, content: '' },
      { frontmatter: { name: 'h2', event: 'PostToolUse' }, content: '' },
      { frontmatter: { name: 'h3', event: 'PreToolUse' }, content: '' },
      { frontmatter: { name: 'h4', event: 'PreCommit' }, content: '' },
    ];

    it('should group hooks by event type', () => {
      const groups = groupHooksByEvent(hooks as any);

      expect(groups.PreToolUse?.length).toBe(2);
      expect(groups.PostToolUse?.length).toBe(1);
      expect(groups.PreCommit?.length).toBe(1);
    });

    it('should handle empty array', () => {
      const groups = groupHooksByEvent([]);
      expect(Object.keys(groups).length).toBe(0);
    });
  });

  describe('parseHook - Claude events', () => {
    it('should accept UserPromptSubmit event', () => {
      const content = `---
name: prompt-check
event: UserPromptSubmit
execute: echo "checking prompt"
---
Check user prompts.`;

      const result = parseHook(content);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.event).toBe('UserPromptSubmit');
      }
    });

    it('should accept all Claude-specific events', () => {
      const events = [
        'Notification',
        'Stop',
        'SubagentStop',
        'SessionStart',
        'SessionEnd',
        'PreCompact',
      ];

      for (const event of events) {
        const content = `---
name: test-hook
event: ${event}
execute: echo "test"
---
Test hook.`;

        const result = parseHook(content);
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value.frontmatter.event).toBe(event);
        }
      }
    });

    it('should accept claude extension properties', () => {
      const content = `---
name: blocking-hook
event: PreToolUse
tool_match: "Bash(*rm*)"
execute: ./scripts/check.sh
claude:
  action: block
  message: "Blocked for safety"
---
Safety check hook.`;

      const result = parseHook(content);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.claude?.action).toBe('block');
        expect(result.value.frontmatter.claude?.message).toBe('Blocked for safety');
      }
    });

    it('should accept claude extension type property', () => {
      const content = `---
name: validation-hook
event: PreToolUse
execute: ./scripts/validate.sh
claude:
  type: validation
---
Validation hook.`;

      const result = parseHook(content);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.frontmatter.claude?.type).toBe('validation');
      }
    });
  });
});

