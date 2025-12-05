---
name: type-check
description: Run TypeScript type checking without emitting files
version: 1.0.0
execute: pnpm typecheck || npm run typecheck || yarn typecheck || npx tsc --noEmit
args:
  - name: watch
    type: boolean
    description: Watch mode for continuous type checking
    default: false
    required: false
targets:
  - cursor
  - claude
  - factory
---

# Type Check Command

Run TypeScript type checking across the project to catch type errors without compiling output files.

## What This Command Does

1. **Validates Types**: Checks all TypeScript files against their type definitions
2. **Catches Type Errors**: Reports mismatched types, missing properties, incorrect function signatures
3. **No Output Files**: Uses `--noEmit` to check without generating JavaScript files

## Usage

```bash
# Run type check once
/type-check

# Run in watch mode (continuous checking)
/type-check watch=true
```

## Common Issues This Catches

- **Type Mismatches**: Assigning wrong types to variables
- **Missing Properties**: Objects missing required fields
- **Incorrect Function Calls**: Wrong argument types or counts
- **Null/Undefined Handling**: Missing null checks
- **Generic Type Errors**: Incorrect generic type arguments
- **Import Errors**: Missing or incorrect module imports

## When to Use

- Before committing TypeScript changes
- After modifying type definitions or interfaces
- When adding new dependencies with types
- As part of CI/CD pipeline validation
- During refactoring to catch ripple effects

## Expected Output

The command will show:
- List of type errors with file locations and line numbers
- Error descriptions explaining the type mismatch
- Summary count of total errors

## Notes

- This command tries multiple approaches for compatibility across projects
- Type checking catches errors that linting might miss
- Some projects may have different script names for type checking
- Watch mode is useful during development for immediate feedback

