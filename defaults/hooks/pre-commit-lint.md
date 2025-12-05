---
name: pre-commit-lint
description: Run linting checks before commits to prevent committing broken code
version: 1.0.0
event: PreToolUse
tool_match: "Bash(git commit*)"
execute: pnpm lint || npm run lint || yarn lint
targets:
  - claude
---

# Pre-Commit Lint Hook

Automatically run linting checks before any git commit to catch code style issues and potential errors.

## What This Hook Does

1. **Intercepts Commits**: Triggers before `git commit` commands execute
2. **Runs Linting**: Executes the project's lint command
3. **Blocks Bad Commits**: Prevents commits if linting fails
4. **Reports Issues**: Shows what needs to be fixed before committing

## When This Triggers

This hook activates when the AI assistant is about to run:
- `git commit`
- `git commit -m "message"`
- `git commit -am "message"`
- Any variation of git commit commands

## Why This Matters

- **Catch Issues Early**: Find problems before they enter version control
- **Maintain Code Quality**: Ensure consistent code style across the team
- **Prevent CI Failures**: Avoid failed CI builds due to linting errors
- **Save Time**: Fix issues locally instead of after pushing

## What Happens on Failure

If linting fails:
1. The commit is blocked
2. Linting errors are displayed
3. You can fix the issues and retry the commit
4. Use `/lint-fix` to auto-fix what can be fixed

## Bypassing the Hook

In rare cases where you need to commit despite lint warnings:
- This should be exceptional, not routine
- Consider if the warnings indicate real issues
- Document why bypassing was necessary

## Integration Notes

This hook is specifically designed for Claude Code's hook system. Other tools like Cursor don't support hooks natively and will need alternative approaches (like husky, lint-staged, or CI checks).

## Recommended Workflow

1. Make your changes
2. Run `/lint-fix` to auto-fix issues
3. Commit - this hook validates
4. Push with confidence

## Related Commands

- `/lint-fix` - Auto-fix linting issues
- `/format` - Format code
- `/type-check` - Check TypeScript types

