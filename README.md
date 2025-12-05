# ai-tool-sync

Unified AI tool configuration — single source of truth for Cursor, Claude Code, Factory, and more.

## Overview

`ai-tool-sync` solves the problem of maintaining separate configurations for different AI coding assistants. Define your rules, personas, commands, and hooks once in a `.ai/` directory, then generate tool-specific outputs for:

- **Cursor** (`.cursor/rules/*.mdc`, `.cursor/commands/roles/*.md`)
- **Claude Code** (`.claude/skills/`, `.claude/agents/`, `CLAUDE.md`)
- **Factory** (`.factory/skills/`, `.factory/droids/`, `AGENTS.md`)

## Installation

```bash
npm install -g @anthropic/ai-tool-sync
```

Or install locally in your project:

```bash
npm install --save-dev @anthropic/ai-tool-sync
```

## Quick Start

```bash
# Initialize a new .ai/ configuration
ai-sync init

# Edit your configuration
# .ai/config.yaml - main configuration
# .ai/rules/ - your project rules
# .ai/personas/ - custom personas
# .ai/commands/ - custom commands

# Generate tool-specific outputs
ai-sync
```

## CLI Commands

### `ai-sync` (or `ai-sync sync`)

Sync `.ai/` configuration to tool-specific outputs. This is the default command.

```bash
ai-sync [options]

Options:
  -v, --verbose       Enable verbose output
  -d, --dry-run       Show what would be generated without writing files
  --no-clean          Do not clean output directories before generating
  -p, --project <path>  Project root directory (default: current directory)
```

**Examples:**

```bash
# Basic sync
ai-sync

# Preview changes without writing
ai-sync --dry-run

# Verbose output for debugging
ai-sync --verbose

# Sync a different project
ai-sync --project /path/to/project
```

### `ai-sync init`

Initialize `.ai/` directory with template configuration.

```bash
ai-sync init [options]

Options:
  -f, --force         Overwrite existing configuration
  -y, --yes           Skip prompts and use defaults
  -p, --project <path>  Project root directory
```

**Examples:**

```bash
# Create new configuration
ai-sync init

# Overwrite existing configuration
ai-sync init --force
```

**Creates:**
```
.ai/
├── config.yaml       # Main configuration file
├── rules/
│   └── _core.md      # Example core rule
├── personas/         # Custom personas (empty)
├── commands/         # Custom commands (empty)
└── hooks/            # Custom hooks (empty)
```

### `ai-sync validate`

Validate configuration without generating output. Useful for CI/CD pipelines.

```bash
ai-sync validate [options]

Options:
  -v, --verbose       Show detailed validation results
  -p, --project <path>  Project root directory
```

**Examples:**

```bash
# Validate current project
ai-sync validate

# Detailed validation output
ai-sync validate --verbose
```

**Validates:**
- Configuration file syntax and schema
- All rule, persona, command, and hook files
- References between files (e.g., subfolder_contexts)
- Common issues (missing globs, duplicates, etc.)

## Configuration

### `.ai/config.yaml`

```yaml
version: "1.0.0"
project_name: my-project

# What to use from ai-tool-sync defaults
use:
  personas:
    - architect
    - implementer
    - security-hacker
  commands:
    - lint-fix

# Where to load content from
loaders:
  - type: ai-tool-sync    # Built-in defaults

# Which tools to generate for
targets:
  - cursor
  - claude
  - factory

# Output settings
output:
  clean_before_sync: true
  add_do_not_edit_headers: true

# Subfolder contexts for monorepos
subfolder_contexts:
  packages/backend:
    rules: [_core, database]
    personas: [implementer]
    description: "Backend package context"
```

### Rules (`.ai/rules/*.md`)

```markdown
---
name: database
description: Database schema and migrations
version: 1.0.0

always_apply: false
globs:
  - "**/*.sql"
  - "**/migrations/**"
targets: [cursor, claude, factory]
priority: high
---

# Database Guidelines

Your rule content here...
```

### Personas (`.ai/personas/*.md`)

```markdown
---
name: architect
description: System architect for high-level design
version: 1.0.0

tools:
  - read
  - write
  - search
targets: [cursor, claude, factory]
---

# The Architect

Persona instructions here...
```

### Commands (`.ai/commands/*.md`)

```markdown
---
name: deploy
description: Deploy to production
version: 1.0.0

execute: scripts/deploy.sh
args:
  - name: environment
    type: string
    default: staging
    choices: [staging, production]
---

# Deploy Command

Command documentation...
```

### Hooks (`.ai/hooks/*.md`)

```markdown
---
name: pre-commit
description: Run checks before commit
version: 1.0.0

event: PreToolUse
tool_match: "Bash(git commit*)"
targets: [claude]
---

# Pre-commit Hook

Hook instructions...
```

## Generated Output

After running `ai-sync`, the following files are generated:

```
# Cursor
.cursor/
├── rules/*.mdc           # Rules with Cursor frontmatter
└── commands/roles/*.md   # Personas as role commands
AGENTS.md                 # Entry point

# Claude Code
.claude/
├── skills/<name>/SKILL.md  # Skills from rules
├── agents/<name>.md        # Agents from personas
└── settings.json           # Hooks configuration
CLAUDE.md                   # Entry point with @imports

# Factory
.factory/
├── skills/<name>/SKILL.md  # Skills from rules
├── droids/<name>.md        # Droids from personas
└── commands/<name>.md      # Commands
AGENTS.md                   # Entry point

# Subfolder contexts (if configured)
packages/backend/CLAUDE.md
packages/backend/AGENTS.md
```

## Programmatic Usage

```typescript
import { sync, init, validate } from '@anthropic/ai-tool-sync';

// Sync configuration
const result = await sync({
  projectRoot: '/path/to/project',
  dryRun: false,
  verbose: true,
});

console.log(`Generated ${result.filesGenerated} files`);

// Initialize new project
await init({
  projectRoot: '/path/to/project',
  force: false,
});

// Validate configuration
const validation = await validate({
  projectRoot: '/path/to/project',
});

if (!validation.success) {
  console.error('Validation failed:', validation.errors);
}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run in development mode
npm run dev

# Lint
npm run lint

# Type check
npm run typecheck
```

## License

MIT
