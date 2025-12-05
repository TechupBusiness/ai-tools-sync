---
name: lint-fix
description: Run linting with automatic fix for code style issues
version: 1.0.0
execute: pnpm lint --fix || npm run lint -- --fix || yarn lint --fix
args:
  - name: path
    type: string
    description: Optional path to lint (defaults to entire project)
    required: false
targets:
  - cursor
  - claude
  - factory
---

# Lint Fix Command

Run the project's linter with automatic fixing enabled. This command attempts to automatically resolve code style issues, formatting problems, and simple linting errors.

## What This Command Does

1. **Detects Code Style Issues**: Identifies violations of the project's code style rules
2. **Auto-fixes What It Can**: Automatically corrects formatting, spacing, import ordering, etc.
3. **Reports Remaining Issues**: Shows any issues that require manual intervention

## Usage

```bash
# Lint entire project with auto-fix
/lint-fix

# Lint specific path
/lint-fix path=src/components/
```

## Common Issues This Fixes

- **Formatting**: Inconsistent spacing, indentation, line lengths
- **Import Ordering**: Sorts and groups import statements
- **Trailing Commas**: Adds or removes based on project config
- **Semicolons**: Ensures consistent semicolon usage
- **Quotes**: Normalizes string quote style
- **Unused Variables**: Removes or flags unused imports/variables

## When to Use

- Before committing code
- After refactoring or moving files
- When integrating code from external sources
- As part of a code review cleanup

## Expected Output

The command will show:
- List of files that were automatically fixed
- List of remaining issues that need manual attention
- Summary of total errors and warnings

## Notes

- This command tries multiple package managers (pnpm, npm, yarn) for compatibility
- Some issues cannot be auto-fixed and require manual intervention
- Run tests after lint-fix to ensure auto-fixes didn't break functionality

