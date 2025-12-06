# Contributing to ai-tool-sync

Thank you for your interest in contributing to ai-tool-sync! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Adding New Features](#adding-new-features)

## Code of Conduct

Please be respectful and constructive in all interactions. We're building something together.

## Getting Started

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Git**

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork:

```bash
git clone git@github.com:YOUR_USERNAME/ai-tool-sync.git
cd ai-tool-sync
```

3. Add the upstream remote:

```bash
git remote add upstream git@github.com:anthropic/ai-tool-sync.git
```

## Development Setup

### Install Dependencies

```bash
npm install
```

### Build

```bash
# Build once
npm run build

# Build and watch for changes
npm run build:watch
```

### Run in Development Mode

```bash
# Run CLI directly with tsx (no build needed)
npm run dev

# With arguments
npm run dev -- init
npm run dev -- validate --verbose
```

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run only E2E tests
npm run test:e2e
```

### Lint and Format

```bash
# Check for lint errors
npm run lint

# Fix lint errors
npm run lint:fix

# Check types
npm run typecheck

# Format code
npm run format

# Check formatting
npm run format:check
```

## Project Structure

```
ai-tool-sync/
├── bin/                    # CLI entry point
│   └── ai-sync.js
│
├── src/                    # Source code
│   ├── cli/                # CLI implementation
│   │   ├── commands/       # CLI commands (init, sync, validate)
│   │   ├── index.ts        # CLI entry point
│   │   └── output.ts       # Console output formatting
│   │
│   ├── config/             # Configuration handling
│   │   ├── loader.ts       # Load config.yaml
│   │   ├── validator.ts    # Validate configuration
│   │   ├── target-mapping.ts # Target configuration
│   │   └── defaults.ts     # Default values
│   │
│   ├── parsers/            # Content parsers
│   │   ├── frontmatter.ts  # YAML frontmatter extraction
│   │   ├── rule.ts         # Rule file parser
│   │   ├── persona.ts      # Persona file parser
│   │   ├── command.ts      # Command file parser
│   │   └── hook.ts         # Hook file parser
│   │
│   ├── loaders/            # Content loaders
│   │   ├── base.ts         # Loader interface
│   │   ├── local.ts        # Local filesystem loader
│   │   ├── npm.ts          # npm package loader
│   │   ├── pip.ts          # pip package loader
│   │   ├── git.ts          # Git repository loader
│   │   ├── url.ts          # URL loader
│   │   └── claude-plugin.ts # Claude plugin loader
│   │
│   ├── generators/         # Output generators
│   │   ├── base.ts         # Generator interface
│   │   ├── cursor.ts       # Cursor IDE generator
│   │   ├── claude.ts       # Claude Code generator
│   │   ├── factory.ts      # Factory generator
│   │   └── subfolder-context.ts
│   │
│   ├── transformers/       # Content transformers
│   │   ├── frontmatter.ts  # Frontmatter transformation
│   │   ├── tool-mapper.ts  # Tool name mapping
│   │   ├── model-mapper.ts # Model name mapping
│   │   └── glob-matcher.ts # Glob pattern matching
│   │
│   ├── schemas/            # JSON Schemas
│   │   ├── config.schema.json
│   │   ├── rule.schema.json
│   │   ├── persona.schema.json
│   │   ├── command.schema.json
│   │   └── hook.schema.json
│   │
│   ├── utils/              # Utilities
│   │   ├── fs.ts           # File system operations
│   │   ├── yaml.ts         # YAML parsing
│   │   ├── logger.ts       # Logging
│   │   └── result.ts       # Result type utilities
│   │
│   └── index.ts            # Library entry point
│
├── defaults/               # Built-in content
│   ├── personas/           # Default personas
│   ├── commands/           # Default commands
│   ├── hooks/              # Default hooks
│   └── rules/              # Default rules
│
├── targets/                # Target configurations
│   ├── cursor.yaml
│   ├── claude.yaml
│   └── factory.yaml
│
├── tests/                  # Test files
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   ├── e2e/                # End-to-end tests
│   └── fixtures/           # Test fixtures
│
└── docs/                   # Documentation
    ├── CONFIGURATION.md
    ├── LOADERS.md
    ├── GENERATORS.md
    └── examples/
```

## Development Workflow

### Branching

1. Create a feature branch from `main`:

```bash
git checkout main
git pull upstream main
git checkout -b feature/my-feature
```

2. Make your changes with clear, atomic commits
3. Push to your fork and create a Pull Request

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, missing semicolons, etc.
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or fixing tests
- `chore`: Maintenance tasks

Examples:

```
feat(loader): add git loader for repository sources
fix(cursor): correct frontmatter transformation for globs
docs(readme): add installation instructions
test(parser): add tests for edge cases in frontmatter parsing
```

## Testing

### Test Structure

```
tests/
├── unit/                   # Unit tests for individual modules
│   ├── cli/
│   ├── config/
│   ├── generators/
│   ├── loaders/
│   ├── parsers/
│   ├── transformers/
│   └── utils/
├── integration/            # Integration tests
│   ├── pipeline.test.ts    # Full sync pipeline tests
│   ├── config-resolution.test.ts
│   └── snapshots.test.ts   # Snapshot tests for output
├── e2e/                    # End-to-end tests
│   └── scenarios.test.ts   # Real-world scenario tests
└── fixtures/               # Test fixtures
    ├── configs/
    ├── loaders/
    └── expected-outputs/
```

### Writing Tests

Use [Vitest](https://vitest.dev/) for testing:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('MyModule', () => {
  describe('myFunction', () => {
    it('should handle normal input', () => {
      const result = myFunction('input');
      expect(result).toBe('expected');
    });

    it('should handle edge cases', () => {
      expect(() => myFunction(null)).toThrow();
    });
  });
});
```

### Test Coverage

We aim for high test coverage:

| Component | Minimum Coverage |
|-----------|-----------------|
| Parsers | 95% |
| Config | 95% |
| Transformers | 95% |
| Loaders | 90% |
| Generators | 90% |
| CLI | 80% |
| **Overall** | **90%** |

Run coverage report:

```bash
npm run test:coverage
```

### Snapshot Tests

Use snapshots for generated output:

```typescript
it('should generate correct cursor output', async () => {
  const result = await generateCursorOutput(input);
  expect(result).toMatchSnapshot();
});
```

Update snapshots when output intentionally changes:

```bash
npm test -- -u
```

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer explicit types for public APIs
- Use `Result<T, E>` for error handling in core logic
- Only throw exceptions at CLI boundary

```typescript
// Good: Explicit return type, Result for errors
export function parseConfig(path: string): Promise<Result<Config, ConfigError>> {
  // ...
}

// Good: Generic type constraints
export function loadContent<T extends ParsedContent>(
  source: string,
  parser: Parser<T>
): Promise<Result<T, ParseError>> {
  // ...
}
```

### Error Handling

Use the Result type pattern:

```typescript
import { ok, err, type Result } from '../utils/result.js';

function parseFile(content: string): Result<ParsedData, ParseError> {
  try {
    const data = parse(content);
    return ok(data);
  } catch (error) {
    return err(new ParseError('Failed to parse', { cause: error }));
  }
}
```

### Logging

Use the logger utility:

```typescript
import { logger } from '../utils/logger.js';

logger.debug('Processing file:', filePath);
logger.info('Loaded', count, 'rules');
logger.warn('Deprecated option used');
logger.error('Failed to load:', error.message);
```

### File Organization

- One concept per file
- Export interfaces/types before implementations
- Keep files under 500 lines (split if larger)
- Use barrel exports (`index.ts`) for public APIs

## Pull Request Process

### Before Submitting

1. Run all checks:

```bash
npm run lint
npm run typecheck
npm test
```

2. Update documentation if needed
3. Add tests for new functionality
4. Update CHANGELOG.md

### PR Description

Include:
- What the change does
- Why it's needed
- How to test it
- Breaking changes (if any)

### Review Process

1. CI must pass
2. At least one approval required
3. Address review comments
4. Squash merge when approved

## Adding New Features

### Adding a New Loader

1. Create loader file in `src/loaders/`:

```typescript
// src/loaders/myloader.ts
import { Loader, LoadResult, LoaderOptions, emptyLoadResultWithSource } from './base.js';

export class MyLoader implements Loader {
  readonly name = 'myloader';

  canLoad(source: string): boolean {
    return source.startsWith('myprefix:');
  }

  async load(source: string, options?: LoaderOptions): Promise<LoadResult> {
    const result = emptyLoadResultWithSource(source);
    // Implementation...
    return result;
  }
}
```

2. Add tests in `tests/unit/loaders/myloader.test.ts`
3. Update documentation in `docs/LOADERS.md`
4. Update config schema if new options needed

### Adding a New Generator

1. Create generator file in `src/generators/`:

```typescript
// src/generators/mygenerator.ts
import { Generator, GeneratorOptions, GenerateResult } from './base.js';

export class MyGenerator implements Generator {
  readonly name = 'mytarget';

  async generate(
    content: ResolvedContent,
    options: GeneratorOptions
  ): Promise<GenerateResult> {
    // Implementation...
  }
}
```

2. Add target configuration in `targets/mytarget.yaml`
3. Add tests in `tests/unit/generators/mygenerator.test.ts`
4. Update documentation in `docs/GENERATORS.md`
5. Update config schema to include new target

### Adding a New Persona

1. Create persona file in `defaults/personas/`:

```markdown
---
name: my-persona
description: Description of the persona
version: 1.0.0
tools:
  - read
  - write
  - edit
model: default
targets: [cursor, claude, factory]
---

# My Persona

[Persona content...]
```

2. Add to README.md persona list
3. Test with integration tests

### Adding a New Command

1. Create command file in `defaults/commands/`:

```markdown
---
name: my-command
description: Description
version: 1.0.0
execute: scripts/my-command.sh
targets: [cursor, claude, factory]
---

# My Command

[Command documentation...]
```

2. Add to README.md command list

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions or ideas
- Check existing issues before creating new ones

Thank you for contributing! 🎉

