---
name: pre-commit
description: Run checks before committing
version: 1.0.0
event: PreToolUse
tool_match: "Bash(git commit*)"
execute: scripts/pre-commit.sh
targets:
  - claude
---

# Pre-Commit Hook

This hook runs before git commit operations.

## Checks

- Lint code
- Run tests
- Check formatting

