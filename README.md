# ai-tool-sync

[![npm version](https://img.shields.io/npm/v/@anthropic/ai-tool-sync.svg)](https://www.npmjs.com/package/@anthropic/ai-tool-sync)
[![npm downloads](https://img.shields.io/npm/dm/@anthropic/ai-tool-sync.svg)](https://www.npmjs.com/package/@anthropic/ai-tool-sync)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-900%2B%20passing-brightgreen.svg)](https://github.com/anthropic/ai-tool-sync)

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

### `ai-sync migrate`

Discover and migrate existing AI tool configurations to ai-tool-sync format.

```bash
ai-sync migrate [options]

Options:
  -v, --verbose             Enable verbose output
  -d, --dry-run             Show what would be migrated without changes
  -b, --backup              Create backup before migration
  -y, --yes                 Skip interactive prompts
  --discovery-only          Only run discovery phase (no migration)
  -p, --project <path>      Use a different project root
  -c, --config-dir <path>   Configuration directory name (default: .ai-tool-sync)
```

**Discovers:**
- `.cursor/rules/*.mdc` — Cursor rules
- `.cursorrules` — Deprecated Cursor format
- `CLAUDE.md` — Manual Claude instructions
- `.claude/skills/`, `.claude/agents/` — Claude Code files
- `.factory/skills/`, `.factory/droids/` — Factory files

**Examples:**

```bash
# Discover existing files (report only, no changes)
ai-sync migrate --discovery-only

# Preview migration without making changes
ai-sync migrate --dry-run

# Migrate with backup
ai-sync migrate --backup

# Non-interactive migration (for CI/scripts)
ai-sync migrate --yes
```

The migrate command helps you transition from existing tool-specific configurations to the unified ai-tool-sync format. It analyzes file contents, detects content types (rules, personas, commands), and can generate AI-assisted migration prompts for complex files that need manual review.

### `ai-sync merge`

Process and merge files from the `input/` folder into your configuration.

```bash
ai-sync merge [options]

Options:
  -v, --verbose             Show detailed diff output
  -d, --dry-run             Show what would be merged without changes
  -y, --yes                 Skip interactive prompts
  -f, --file <path>         Process specific file only
  -p, --project <path>      Use a different project root
  -c, --config-dir <path>   Configuration directory name (default: .ai-tool-sync)
```

**What it does:**

The merge command helps you integrate files from `.ai-tool-sync/input/` (populated by `migrate` or manual import) into your configuration:

1. **Discovers** all markdown files in `input/`
2. **Analyzes** each file to detect content type (rule, persona, command, hook)
3. **Compares** with existing content to identify new, modified, or identical files
4. **Reports** differences with detailed diff information (frontmatter changes, content changes)
5. **Merges** accepted files into the appropriate directories (rules/, personas/, etc.)

**Examples:**

```bash
# Preview what would be merged (no changes)
ai-sync merge --dry-run

# See detailed diffs for all files
ai-sync merge --verbose

# Auto-merge without prompts
ai-sync merge --yes

# Merge a specific file only
ai-sync merge --file input/my-rule.md

# Dry run with verbose output
ai-sync merge --dry-run --verbose
```

**Interactive Mode:**

When merging modified files, you'll be prompted for each file:
- `(y)es` — Merge this file
- `(n)o` — Skip this file
- `(d)iff` — Show detailed diff, then confirm

**File Status Types:**
- 🆕 **New** — File doesn't exist in target folder
- ✏️ **Modified** — File exists with different content
- ✅ **Identical** — File exists with same content (automatically skipped)
- ⚠️ **Conflict** — Cannot auto-merge (manual review needed)
- ❌ **Invalid** — File cannot be parsed

After merging, files are automatically removed from the `input/` folder and placed in the correct location based on their content type.

### `ai-sync clean`

Remove generated files with safety checks.

```bash
ai-sync clean [options]

Options:
  -v, --verbose             Enable verbose output
  -f, --force               Force removal of modified files (user changes will be lost)
  -d, --dry-run             Preview what would be deleted
  -p, --project <path>      Use a different project root
  -c, --config-dir <path>   Configuration directory name (default: .ai-tool-sync)
```

**Behavior**:
- Reads manifest (`.ai-tool-sync-generated.json`) to identify generated files
- Uses SHA256 hashes to detect user-modified files
- Skips modified files by default (warns user)
- `--force` removes even modified files

**Examples:**

```bash
# Preview what would be deleted
ai-sync clean --dry-run

# Clean with verbose output
ai-sync clean --verbose

# Force remove even modified files
ai-sync clean --force
```

### `ai-sync status`

Show status of generated files (unchanged, modified, missing).

```bash
ai-sync status [options]

Options:
  -v, --verbose             Show all files with their status
  -p, --project <path>      Use a different project root
  -c, --config-dir <path>   Configuration directory name (default: .ai-tool-sync)
```

**Output**:
- Count of generated files by status (unchanged, modified, missing)
- Verbose mode shows per-file status with icons (✓ unchanged, ⚠ modified, ✗ missing)

**Examples:**

```bash
# Quick summary
ai-sync status

# Detailed per-file status
ai-sync status --verbose
```

### `ai-sync plugins`

Manage plugins from Git repositories.

```bash
# List installed plugins
ai-sync plugins list [options]
  --json                    Output as JSON
  -v, --verbose             Show detailed information

# Add a plugin from Git
ai-sync plugins add <source> [options]
  -n, --name <name>         Custom plugin name
  -v, --version <version>   Pin to specific version
  --force                   Overwrite if already installed
  --include <types...>      Content types to include (rules,personas,commands,hooks)
  --exclude <types...>      Content types to exclude
  --timeout <ms>            Timeout for git operations

# Remove a plugin
ai-sync plugins remove <name> [options]
  --force                   Remove even if in config.yaml
  --keep-cache              Keep cached files

# Check for and apply updates
ai-sync plugins update [name] [options]
  --apply                   Actually apply updates (default: dry-run)
  --force                   Force re-download even if up to date
  --all                     Update all plugins
  --timeout <ms>            Timeout for git operations
```

**Source formats**:
- `github:owner/repo@v1.0.0`
- `gitlab:owner/repo@main`
- `https://github.com/owner/repo.git#v1.0.0`

**Examples:**

```bash
# List all plugins
ai-sync plugins list

# Add a plugin
ai-sync plugins add github:company/ai-rules@v2.0.0

# Check for updates (dry-run)
ai-sync plugins update

# Apply all updates
ai-sync plugins update --all --apply

# Remove a plugin
ai-sync plugins remove company-ai-rules
```

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

#### Conditional Rules (`when:`)

Include rules only when certain conditions are met in the project:

```yaml
---
name: react-guidelines
description: React development guidelines
when: npm:react              # Only include if react is a dependency
globs: ["**/*.tsx", "**/*.jsx"]
---
```

**Supported namespaces**:

| Namespace | Description | Example |
|-----------|-------------|---------|
| `npm:` | Node.js package.json dependency | `npm:react`, `npm:@types/node` |
| `pip:` | Python dependency (requirements.txt, pyproject.toml, Pipfile) | `pip:django`, `pip:flask` |
| `go:` | Go module (go.mod) | `go:github.com/gin-gonic/gin` |
| `cargo:` | Rust crate (Cargo.toml) | `cargo:serde`, `cargo:tokio` |
| `composer:` | PHP package (composer.json) | `composer:laravel/framework` |
| `gem:` | Ruby gem (Gemfile) | `gem:rails`, `gem:rspec` |
| `pub:` | Dart/Flutter package (pubspec.yaml) | `pub:flutter`, `pub:dio` |
| `maven:` | Maven artifact (pom.xml) | `maven:spring-boot` |
| `gradle:` | Gradle dependency (build.gradle) | `gradle:kotlin-stdlib` |
| `nuget:` | .NET package (*.csproj) | `nuget:Newtonsoft.Json` |
| `file:` | File exists in project | `file:tsconfig.json` |
| `dir:` | Directory exists in project | `dir:.github/workflows` |
| `pkg:` | package.json field value | `pkg:type == "module"` |
| `var:` | Custom variable from config | `var:my_flag == true` |

**Logical operators**:
- `&&` — AND (both must be true)
- `||` — OR (either can be true)
- `!` — NOT (negate condition)

**Comparison operators** (for `pkg:` and `var:`):
- `==`, `!=`, `>`, `<`, `>=`, `<=`

**Examples**:

```yaml
when: npm:typescript                           # TypeScript is installed
when: npm:react && npm:@testing-library/react  # React with testing library
when: file:docker-compose.yml || dir:.docker   # Has Docker setup
when: !npm:jest                                # Jest is NOT installed
when: pkg:type == "module"                     # ESM project
```

### Including Shared Content (`@include`)

Rules can include content from other markdown files using the `@include` directive:

```markdown
---
name: api-guidelines
description: API development guidelines
always_apply: false
globs: ["**/api/**"]
---

# API Guidelines

@include shared/base-rules.md
@include shared/error-handling.md

## API-Specific Rules

[Additional content...]
```

**Features**:
- Paths are relative to the including file
- Frontmatter in included files is stripped (only body content is inlined)
- Supports nested includes up to 10 levels deep
- Circular includes are detected and rejected with clear error messages
- Missing files produce helpful error messages with file path

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

#### Persona Inheritance (`extends:`)

Personas can extend other personas to inherit their properties:

```yaml
---
name: my-implementer
extends: implementer        # Inherits from built-in implementer
description: Custom implementer with project-specific traits
model: powerful             # Override parent's model
claude:
  tools: [Read, Write, Edit, Bash]  # Override tools for Claude
---

# My Custom Implementer

Additional instructions specific to my project...
```

**Inheritance rules**:
- Child frontmatter overrides parent (shallow merge)
- Platform extensions (`cursor`, `claude`, `factory`) are merged separately
- Content is concatenated: parent content, then `---` separator, then child content
- Missing parent persona generates a warning (inheritance skipped, not a fatal error)
- Circular inheritance is detected and rejected
- Maximum inheritance depth: 10 levels

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

### Platform-Conditional Content

Include content only for specific platforms using conditional blocks:

```markdown
# Getting Started

{{#claude}}
Use `/command-name` to invoke this command in Claude Code.
{{/claude}}

{{#cursor}}
Press Cmd+K and type the command name in Cursor.
{{/cursor}}

{{#factory}}
Invoke via the Factory command palette or droid delegation.
{{/factory}}

Common content that appears for all platforms.
```

**Supported operators**:
- `{{#platform}}...{{/platform}}` — Include only for that platform
- `{{#claude|factory}}...{{/claude|factory}}` — OR: include for claude OR factory
- `{{#claude&factory}}...{{/claude&factory}}` — AND: (rarely useful, for same-named blocks)
- `{{#!cursor}}...{{/!cursor}}` — NOT: include for all platforms except cursor

**Supported platforms**: `claude`, `cursor`, `factory`

Non-matching blocks are completely removed from the generated output, keeping each platform's files clean.

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

### Plugin Caching

Git repositories and remote plugins are automatically cached in `.ai-tool-sync/plugins/` to improve performance:

- **Version-aware caching** — Each version is cached separately
- **Automatic invalidation** — Cache is refreshed when versions change
- **Zero configuration** — Works transparently out of the box

This means the first sync might be slower (downloading plugins), but subsequent syncs are instant.

See [docs/LOADERS.md](docs/LOADERS.md) for detailed configuration.

## Programmatic API

```typescript
import { sync, init, validate, migrate, merge, discover } from '@anthropic/ai-tool-sync';

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

// Discover existing AI tool configurations
const discovery = await discover('/path/to/project');
console.log(`Found ${discovery.stats.totalFiles} files from ${discovery.stats.platforms.join(', ')}`);

// Migrate existing configurations
const migration = await migrate({
  projectRoot: '/path/to/project',
  backup: true,
  dryRun: false,
});

console.log(`Migrated ${migration.migratedFiles.length} files`);

// Merge files from input/ folder
const mergeResult = await merge({
  projectRoot: '/path/to/project',
  verbose: true,
  yes: false, // Interactive mode
});

console.log(`Merged ${mergeResult.merged.length} files`);
console.log(`Skipped ${mergeResult.skipped.length} files`);
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
