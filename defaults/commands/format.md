---
name: format
description: Format code using the project's configured formatter
version: 1.0.0
execute: pnpm format || npm run format || yarn format || npx prettier --write .
args:
  - name: path
    type: string
    description: Optional path to format (defaults to entire project)
    required: false
  - name: check
    type: boolean
    description: Check formatting without making changes
    default: false
    required: false
targets:
  - cursor
  - claude
  - factory
---

# Format Command

Format code files using the project's configured code formatter (typically Prettier).

## What This Command Does

1. **Applies Consistent Formatting**: Ensures all code follows the same style rules
2. **Respects Project Config**: Uses `.prettierrc`, `.editorconfig`, or equivalent
3. **Handles Multiple Languages**: Formats JS, TS, JSON, CSS, Markdown, and more

## Usage

```bash
# Format entire project
/format

# Format specific path
/format path=src/components/

# Check formatting without changes
/format check=true
```

## What Gets Formatted

- **Indentation**: Tabs vs spaces, consistent indentation levels
- **Line Length**: Wraps long lines according to config
- **Spacing**: Consistent spacing around operators, brackets
- **Quotes**: Single vs double quotes
- **Trailing Commas**: Adds or removes based on config
- **Semicolons**: Consistent semicolon usage
- **Object Formatting**: Consistent object and array formatting

## When to Use

- Before committing code
- After copy-pasting code from external sources
- When code style arguments arise (let the formatter decide!)
- After large refactoring operations
- When onboarding to a new project

## Expected Output

The command will show:
- List of files that were formatted
- In check mode: list of files that need formatting
- Summary of changes made

## Configuration Files

The formatter respects these configuration files:
- `.prettierrc` / `.prettierrc.json` / `prettier.config.js`
- `.editorconfig`
- `package.json` (under `prettier` key)

## Notes

- Formatting is separate from linting - run both for best results
- Some files may be ignored via `.prettierignore`
- Check mode is useful in CI to verify formatting without changes
- The command tries multiple package managers for compatibility

