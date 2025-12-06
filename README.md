# ai-tool-sync

[![npm version](https://img.shields.io/npm/v/@anthropic/ai-tool-sync.svg)](https://www.npmjs.com/package/@anthropic/ai-tool-sync)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org)

**Unified AI tool configuration** — single source of truth for Cursor, Claude Code, Factory, and more.

## The Problem

Modern projects often use multiple AI coding assistants. Each tool has its own configuration format:
- **Cursor**: `.cursor/rules/*.mdc`
- **Claude Code**: `.claude/skills/`, `CLAUDE.md`
- **Factory**: `.factory/skills/`, `.factory/droids/`

Maintaining separate configurations leads to:
- 🔄 Duplicated content across multiple locations
- 📝 Inconsistencies when updating rules
- ⚡ Wasted tokens loading identical context
- 🤯 Config sprawl that's hard to maintain

## The Solution

`ai-tool-sync` provides a **single `.ai-tool-sync/` directory** as your source of truth. Write your rules, personas, and commands once using a generic format, then generate tool-specific outputs automatically.

```
.ai-tool-sync/                 # You maintain this (configurable)
├── config.yaml                # Configuration
├── rules/                     # Your project rules
│   ├── _core.md
│   └── database.md
├── personas/                  # Custom personas
└── commands/                  # Custom commands
        │
        │  ai-sync
        ▼
.cursor/rules/*.mdc            # Generated for Cursor
.claude/skills/*/SKILL.md      # Generated for Claude Code
.factory/skills/*/SKILL.md     # Generated for Factory
```

## Key Features

- ✅ **Single source of truth** — Define once, generate everywhere
- ✅ **11 built-in personas** — Architect, Implementer, Security Hacker, Test Zealot, and more
- ✅ **Glob-based triggering** — Rules activate only when relevant files are touched
- ✅ **Monorepo support** — Generate subfolder contexts for different packages
- ✅ **Plugin system** — Load rules from npm packages, git repos, or local paths
- ✅ **Language-agnostic** — Works with any project (Node.js, Python, Go, Rust, etc.)

## Quick Start

### Installation

```bash
# Global installation
npm install -g @anthropic/ai-tool-sync

# Or as a dev dependency
npm install --save-dev @anthropic/ai-tool-sync
```

### Initialize Your Project

```bash
# Create .ai-tool-sync/ configuration (default)
ai-sync init

# Or use a custom directory name
ai-sync init --config-dir .ai
```

This creates:

```
.ai-tool-sync/
├── config.yaml       # Main configuration file
├── rules/
│   └── _core.md      # Example core rule (edit this!)
├── personas/         # Your custom personas
├── commands/         # Your custom commands
└── hooks/            # Your custom hooks
```

### Configure and Sync

1. **Edit your configuration** — `.ai-tool-sync/config.yaml`

```yaml
version: "1.0.0"
project_name: my-awesome-project

# Enable built-in personas
use:
  personas:
    - architect
    - implementer
    - security-hacker
    - test-zealot
  commands:
    - lint-fix

# Generate for these tools
targets:
  - cursor
  - claude
  - factory
```

2. **Write your project rules** — `.ai-tool-sync/rules/_core.md`

```markdown
---
name: _core
description: Core project context
always_apply: true
targets: [cursor, claude, factory]
---

# My Awesome Project

This project is a [describe your project]...
```

3. **Generate tool configurations**

```bash
ai-sync
```

That's it! Your rules are now available in all your AI tools.

## CLI Reference

### `ai-sync` (default command)

Generate tool-specific configurations from `.ai-tool-sync/` sources.

```bash
ai-sync [options]

Options:
  -v, --verbose             Enable verbose output
  -d, --dry-run             Preview changes without writing files
  --no-clean                Keep existing generated files
  -p, --project <path>      Use a different project root
  -c, --config-dir <path>   Configuration directory name (default: .ai-tool-sync)
```

**Examples:**

```bash
# Basic sync
ai-sync

# Preview what would be generated
ai-sync --dry-run

# Verbose output for debugging
ai-sync --verbose

# Sync a different project
ai-sync --project /path/to/other/project

# Use a custom config directory
ai-sync --config-dir .ai
```

### `ai-sync init`

Initialize a new configuration directory.

```bash
ai-sync init [options]

Options:
  -f, --force               Overwrite existing configuration
  -p, --project <path>      Use a different project root
  -c, --config-dir <path>   Configuration directory name (default: .ai-tool-sync)
```

### `ai-sync validate`

Validate configuration without generating output. Useful for CI/CD.

```bash
ai-sync validate [options]

Options:
  -v, --verbose             Show detailed validation results
  -p, --project <path>      Use a different project root
  -c, --config-dir <path>   Configuration directory name (default: .ai-tool-sync)
```

**Validates:**
- Configuration syntax and schema
- All rule, persona, command, and hook files
- References between files
- Common issues (missing globs, duplicates, etc.)

## Configuration

### Configurable Directory Name

By default, ai-tool-sync uses `.ai-tool-sync/` as the configuration directory. You can customize this using (in priority order):

1. **CLI flag**: `--config-dir .ai`
2. **Environment variable**: `AI_TOOL_SYNC_DIR=.ai`
3. **package.json**:
   ```json
   {
     "ai-tool-sync": {
       "configDir": ".ai"
     }
   }
   ```
4. **Default**: `.ai-tool-sync`

### `.ai-tool-sync/config.yaml`

```yaml
version: "1.0.0"
project_name: my-project

# Enable built-in content
use:
  personas:
    - architect          # Strategic systems architect
    - implementer        # Pragmatic coding craftsman
    - security-hacker    # Security analyst
    - test-zealot        # Testing specialist
    - data-specialist    # Database expert
    - devops-specialist  # Infrastructure guru
    - hyper-critic       # Critical code reviewer
    - performance-optimizer  # Performance expert
    - ux-psychologist    # User experience focus
    - growth-hacker      # Growth and metrics
    - coordinator        # Multi-agent orchestration
  commands:
    - lint-fix
    - type-check
    - format

# Content loaders
loaders:
  - type: ai-tool-sync   # Built-in defaults

  # Load from local directory
  - type: local
    source: ../shared-rules

  # Load from npm package
  - type: npm
    package: "@company/ai-rules"
    version: "^1.0.0"

  # Load from git repository
  - type: git
    source: github:company/ai-rules#main

# Target tools
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
    personas: [implementer, data-specialist]
    description: "Backend package context"
```

### Rule Files (`.ai-tool-sync/rules/*.md`)

```yaml
---
name: database
description: Database schema and migration guidelines
version: 1.0.0

# When to load this rule
always_apply: false
globs:
  - "**/*.sql"
  - "**/migrations/**"

# Which tools to generate for
targets: [cursor, claude, factory]

# Rule priority
priority: high

# Other rules that should load with this
requires: [_core]
---

# Database Guidelines

[Your rule content here...]
```

### Persona Files (`.ai-tool-sync/personas/*.md`)

```yaml
---
name: my-persona
description: Custom persona for my project
version: 1.0.0

tools:
  - read
  - write
  - edit
  - execute

model: default

targets: [cursor, claude, factory]
---

# My Custom Persona

[Persona instructions here...]
```

### Command Files (`.ai-tool-sync/commands/*.md`)

```yaml
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

[Command documentation...]
```

### Hook Files (`.ai-tool-sync/hooks/*.md`)

```yaml
---
name: pre-commit
description: Run checks before commit
version: 1.0.0

event: PreToolUse
tool_match: "Bash(git commit*)"
targets: [claude]
---

# Pre-commit Hook

[Hook instructions...]
```

## Generated Output

After running `ai-sync`, the following structure is generated:

```
# Cursor
.cursor/
├── rules/*.mdc              # Rules with Cursor frontmatter
└── commands/roles/*.md      # Personas as command roles
AGENTS.md                    # Entry point

# Claude Code
.claude/
├── skills/<name>/SKILL.md   # Skills from rules
├── agents/<name>.md         # Agents from personas
└── settings.json            # Hooks and commands
CLAUDE.md                    # Entry point with @imports

# Factory
.factory/
├── skills/<name>/SKILL.md   # Skills from rules
├── droids/<name>.md         # Droids from personas
└── commands/<name>.md       # Commands
AGENTS.md                    # Entry point

# Subfolder contexts (if configured)
packages/backend/CLAUDE.md
packages/backend/AGENTS.md
```

## Loaders

ai-tool-sync supports multiple content sources:

| Loader | Description | Example |
|--------|-------------|---------|
| `ai-tool-sync` | Built-in defaults | `type: ai-tool-sync` |
| `local` | Local file path | `source: ../shared-rules` |
| `npm` | npm package | `package: "@company/ai-rules"` |
| `pip` | Python package | `package: "ai-rules-django"` |
| `git` | Git repository | `source: github:user/repo#branch` |
| `url` | Remote URL | `source: https://example.com/rules.yaml` |
| `claude-plugin` | Claude plugins | `source: claude-plugin:@anthropic/web-dev` |

See [docs/LOADERS.md](docs/LOADERS.md) for detailed configuration.

## Programmatic API

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

## Documentation

- [Configuration Reference](docs/CONFIGURATION.md) — Full config.yaml documentation
- [Loaders Guide](docs/LOADERS.md) — How to use each loader type
- [Generators Guide](docs/GENERATORS.md) — Target-specific output details
- [Contributing](CONTRIBUTING.md) — Development setup and guidelines

## Built-in Personas

ai-tool-sync includes 11 carefully crafted personas:

| Persona | Focus | Best For |
|---------|-------|----------|
| **architect** | System design | High-level architecture decisions |
| **implementer** | Pragmatic coding | Day-to-day implementation |
| **security-hacker** | Security analysis | Vulnerability assessment |
| **test-zealot** | Testing | Coverage and test quality |
| **data-specialist** | Databases | Schema design, queries, migrations |
| **devops-specialist** | Infrastructure | CI/CD, deployment, monitoring |
| **hyper-critic** | Code review | Quality gatekeeper |
| **performance-optimizer** | Performance | Profiling and optimization |
| **ux-psychologist** | User experience | Usability and accessibility |
| **growth-hacker** | Growth metrics | A/B testing, analytics |
| **coordinator** | Orchestration | Multi-agent coordination |

## Examples

### Minimal Setup

```yaml
# .ai-tool-sync/config.yaml
version: "1.0.0"
targets: [cursor]
```

### Full-Featured Project

```yaml
version: "1.0.0"
project_name: enterprise-app

use:
  personas: [architect, implementer, security-hacker, test-zealot]
  commands: [lint-fix, type-check]

loaders:
  - type: ai-tool-sync
  - type: npm
    package: "@company/ai-rules-react"
    version: "^2.0.0"

targets: [cursor, claude, factory]

rules:
  _core:
    always_apply: true
  api:
    globs: ["apps/api/**"]
  frontend:
    globs: ["apps/web/**"]

subfolder_contexts:
  apps/api:
    rules: [_core, api]
    personas: [implementer, security-hacker]
  apps/web:
    rules: [_core, frontend]
    personas: [implementer, ux-psychologist]

output:
  clean_before_sync: true
  add_do_not_edit_headers: true
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Development mode
npm run dev

# Lint and type check
npm run lint
npm run typecheck
```

## License

MIT © Anthropic
