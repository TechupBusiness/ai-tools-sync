# Configuration Reference

This document provides a complete reference for `.ai/config.yaml` configuration options.

## Table of Contents

- [Overview](#overview)
- [Configuration Schema](#configuration-schema)
- [Top-Level Properties](#top-level-properties)
- [use](#use)
- [loaders](#loaders)
- [targets](#targets)
- [rules](#rules)
- [subfolder_contexts](#subfolder_contexts)
- [hooks](#hooks)
- [output](#output)
- [Complete Examples](#complete-examples)

## Overview

The configuration file `.ai/config.yaml` is the central control point for ai-tool-sync. It defines:

- What built-in content to use
- Where to load additional content from
- Which tools to generate for
- How rules should be triggered
- Monorepo subfolder configurations
- Output settings

## Configuration Schema

```yaml
version: "1.0.0"                    # Required: Configuration version
project_name: my-project             # Optional: Project identifier

use:                                 # Optional: Built-in content to enable
  personas: [...]
  commands: [...]
  plugins: [...]

loaders: [...]                       # Optional: Content loader configuration

targets: [cursor, claude, factory]   # Optional: Target tools (default: all)

rules: {}                            # Optional: Rule-specific overrides

subfolder_contexts: {}               # Optional: Monorepo context generation

hooks: {}                            # Optional: Hook configurations

output: {}                           # Optional: Output settings
```

## Top-Level Properties

### version

**Required** — Configuration version string.

```yaml
version: "1.0.0"
```

Must follow semantic versioning format: `MAJOR.MINOR.PATCH`

### project_name

**Optional** — Project identifier used for logging and documentation.

```yaml
project_name: my-awesome-project
```

## use

Enables built-in content from ai-tool-sync defaults.

### use.personas

Array of persona names to enable from built-in defaults.

```yaml
use:
  personas:
    - architect
    - implementer
    - security-hacker
    - test-zealot
    - data-specialist
    - devops-specialist
    - hyper-critic
    - performance-optimizer
    - ux-psychologist
    - growth-hacker
    - coordinator
```

**Available Personas:**

| Name | Description |
|------|-------------|
| `architect` | Strategic systems architect for design reviews |
| `implementer` | Pragmatic coding craftsman for implementation |
| `security-hacker` | Security analyst for vulnerability assessment |
| `test-zealot` | Testing specialist for coverage and quality |
| `data-specialist` | Database expert for schema and queries |
| `devops-specialist` | Infrastructure guru for CI/CD and deployment |
| `hyper-critic` | Critical code reviewer for quality gates |
| `performance-optimizer` | Performance expert for profiling and optimization |
| `ux-psychologist` | User experience focus for usability |
| `growth-hacker` | Growth metrics specialist for A/B testing |
| `coordinator` | Multi-agent orchestration coordinator |

### use.commands

Array of command names to enable from built-in defaults.

```yaml
use:
  commands:
    - lint-fix
    - type-check
    - format
```

**Available Commands:**

| Name | Description |
|------|-------------|
| `lint-fix` | Run linting with auto-fix |
| `type-check` | Run type checking |
| `format` | Run code formatting |

### use.plugins

Array of plugin configurations to enable.

```yaml
use:
  plugins:
    - name: typescript-strict
      source: ai-tool-sync         # Built-in plugin
      enabled: true

    - name: react-patterns
      source: npm:@company/ai-react
      version: "^2.0.0"
      enabled: true
      include: [rules, commands]   # Only use specific content types
      exclude: [hooks]             # Exclude specific content types
```

**Plugin Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Plugin identifier (required) |
| `source` | string | Plugin source (required) |
| `version` | string | Version constraint (optional) |
| `enabled` | boolean | Whether plugin is active (default: true) |
| `include` | array | Content types to include: `rules`, `personas`, `commands`, `hooks` |
| `exclude` | array | Content types to exclude |

## loaders

Array of content loader configurations. Loaders define where to load rules, personas, commands, and hooks from.

```yaml
loaders:
  # Built-in defaults
  - type: ai-tool-sync

  # Local directory
  - type: local
    source: ../shared-rules

  # npm package
  - type: npm
    package: "@company/ai-rules"
    version: "^1.0.0"

  # Python package
  - type: pip
    package: "ai-rules-django"
    version: ">=1.0.0"

  # Git repository
  - type: git
    source: github:user/repo#main

  # Remote URL
  - type: url
    source: "https://example.com/rules/"

  # Claude plugin
  - type: claude-plugin
    source: "@anthropic/web-dev"
```

See [LOADERS.md](LOADERS.md) for detailed loader documentation.

### Loader Properties

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | Loader type (required): `ai-tool-sync`, `local`, `npm`, `pip`, `git`, `url`, `claude-plugin` |
| `source` | string | Source path, URL, or identifier |
| `package` | string | Package name (for npm/pip) |
| `version` | string | Version constraint |

## targets

Array of target tools to generate configuration for.

```yaml
targets:
  - cursor
  - claude
  - factory
```

**Available Targets:**

| Target | Output Location | Entry Point |
|--------|-----------------|-------------|
| `cursor` | `.cursor/rules/*.mdc` | `AGENTS.md` |
| `claude` | `.claude/skills/*/SKILL.md` | `CLAUDE.md` |
| `factory` | `.factory/skills/*/SKILL.md` | `AGENTS.md` |

**Default:** All targets enabled (`[cursor, claude, factory]`)

See [GENERATORS.md](GENERATORS.md) for target-specific output details.

## rules

Rule-specific configuration overrides. These settings override or supplement the frontmatter in individual rule files.

```yaml
rules:
  _core:
    always_apply: true
    description: "Core project context"

  database:
    always_apply: false
    globs:
      - "**/*.sql"
      - "**/migrations/**"
    targets: [cursor, claude]  # Exclude factory

  api:
    globs:
      - "apps/api/**"
    source: ai-tool-sync       # Use built-in rule
```

### Rule Configuration Properties

| Property | Type | Description |
|----------|------|-------------|
| `always_apply` | boolean | Load this rule regardless of context |
| `globs` | array | Glob patterns to trigger this rule |
| `targets` | array | Target tools for this rule |
| `source` | string | Source of the rule (e.g., `ai-tool-sync` for defaults) |
| `description` | string | Human-readable description |

### Glob Pattern Syntax

Glob patterns support:

- `*` — Match any characters except path separator
- `**` — Match any characters including path separator (recursive)
- `?` — Match single character
- `{a,b}` — Match `a` or `b`
- `!pattern` — Negation (in arrays)

**Examples:**

```yaml
globs:
  - "**/*.ts"              # All TypeScript files
  - "apps/api/**"          # All files in apps/api/
  - "**/*.test.{ts,tsx}"   # All test files
  - "**/migrations/*.sql"  # SQL files in migrations directories
```

## subfolder_contexts

Configure context generation for monorepo subfolders. This generates `CLAUDE.md` and `AGENTS.md` files in specified directories.

```yaml
subfolder_contexts:
  packages/backend:
    rules: [_core, database, api]
    personas: [implementer, data-specialist]
    description: "Backend package context"

  packages/frontend:
    rules: [_core, ui, forms]
    personas: [implementer, ux-psychologist]
    description: "Frontend package context"

  apps/mobile:
    rules: [_core, mobile]
    personas: [implementer]
    description: "Mobile app context"
```

### Subfolder Context Properties

| Property | Type | Description |
|----------|------|-------------|
| `rules` | array | Rule names to include (required) |
| `personas` | array | Persona names to include (optional) |
| `description` | string | Context description (optional) |

**Generated Files:**

For each subfolder, these files are created:
- `<subfolder>/CLAUDE.md` — Entry point for Claude Code
- `<subfolder>/AGENTS.md` — Entry point for Cursor/Factory

## hooks

Hook configurations for event-based actions. Currently only supported by Claude Code.

```yaml
hooks:
  PreToolUse:
    - name: financial-safety
      match: "Bash(*trade*)|Edit(*order*)"
      action: warn
      message: "⚠️ Financial operation detected"

    - name: production-guard
      match: "Bash(*deploy* --production*)"
      action: block
      message: "🛑 Production deployment requires approval"

  PostToolUse:
    - name: audit-log
      match: "Write(*)|Edit(*)"
      action: allow
      message: "Logged file modification"
```

### Hook Event Types

| Event | When Triggered |
|-------|----------------|
| `PreToolUse` | Before any tool is executed |
| `PostToolUse` | After any tool completes |
| `PreMessage` | Before AI generates a response |
| `PostMessage` | After AI generates a response |
| `PreCommit` | Before git commit |

### Hook Configuration Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Hook identifier (required) |
| `match` | string | Tool/pattern match expression (required) |
| `action` | string | Action: `warn`, `block`, `allow` (required) |
| `message` | string | Message to display (optional) |

### Match Pattern Syntax

```
ToolName(pattern)         # Match specific tool with argument pattern
Tool1(*)|Tool2(*)         # Match multiple tools (OR)
Bash(git commit*)         # Match Bash commands starting with "git commit"
Edit(*order*)             # Match Edit on files containing "order"
```

## output

Output generation settings.

```yaml
output:
  clean_before_sync: true
  add_do_not_edit_headers: true
```

### Output Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `clean_before_sync` | boolean | `true` | Delete generated files before syncing |
| `add_do_not_edit_headers` | boolean | `true` | Add "do not edit" comments to generated files |

## Complete Examples

### Minimal Configuration

```yaml
version: "1.0.0"
targets: [cursor]
```

### Standard Project

```yaml
version: "1.0.0"
project_name: my-app

use:
  personas: [architect, implementer, test-zealot]
  commands: [lint-fix]

loaders:
  - type: ai-tool-sync

targets:
  - cursor
  - claude
  - factory

output:
  clean_before_sync: true
  add_do_not_edit_headers: true
```

### Enterprise Monorepo

```yaml
version: "1.0.0"
project_name: enterprise-platform

use:
  personas:
    - architect
    - implementer
    - security-hacker
    - test-zealot
    - data-specialist
    - devops-specialist
  commands:
    - lint-fix
    - type-check
    - format

loaders:
  - type: ai-tool-sync

  # Company-shared rules
  - type: npm
    package: "@company/ai-rules-base"
    version: "^1.0.0"

  # Team-specific rules
  - type: local
    source: ../shared-team-rules

targets:
  - cursor
  - claude
  - factory

rules:
  _core:
    always_apply: true
    description: "Platform core context"

  api:
    globs:
      - "apps/api/**"
      - "**/api/**"
    priority: high

  database:
    globs:
      - "**/*.sql"
      - "**/migrations/**"
      - "**/prisma/**"

  security:
    always_apply: true
    targets: [claude]  # Only for Claude Code

subfolder_contexts:
  apps/api:
    rules: [_core, api, database, security]
    personas: [implementer, security-hacker, data-specialist]
    description: "API service"

  apps/web:
    rules: [_core, ui]
    personas: [implementer, ux-psychologist]
    description: "Web frontend"

  packages/shared:
    rules: [_core]
    personas: [implementer, test-zealot]
    description: "Shared libraries"

hooks:
  PreToolUse:
    - name: production-safety
      match: "Bash(*deploy* --prod*)"
      action: warn
      message: "⚠️ Production deployment - please confirm"

output:
  clean_before_sync: true
  add_do_not_edit_headers: true
```

## Schema Validation

The configuration is validated against a JSON Schema. Common validation errors:

| Error | Cause | Fix |
|-------|-------|-----|
| Missing version | `version` field not present | Add `version: "1.0.0"` |
| Invalid target | Unknown target name | Use `cursor`, `claude`, or `factory` |
| Invalid loader type | Unknown loader type | Check [LOADERS.md](LOADERS.md) for valid types |
| Invalid hook action | Unknown action | Use `warn`, `block`, or `allow` |

Run `ai-sync validate` to check your configuration for errors.

