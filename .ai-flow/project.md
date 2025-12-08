# AI Tool Sync - Architecture & Design

## Overview

`ai-tool-sync` is a CLI tool that provides a **single source of truth** for AI coding assistant configurations. It generates tool-specific outputs for Cursor, Claude Code, Factory, and potentially others from a unified `.ai-tool-sync/` configuration folder.

**Key Benefits:**
- ~70% reduction in always-loaded context tokens
- Single source of truth with tool-aware generation
- Glob-based rule triggering (not `alwaysApply: true` everywhere)
- Subfolder context files for Claude/Factory
- **Language-agnostic** - works with any project (Node.js, Python, PHP, Dart, Go, etc.)

**Implementation Status:** MVP Complete ✅ (844+ tests)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ai-tool-sync (npm package)                                                  │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Contains: Sync tool + Generic reusable content                              │
│  Distribution: npm (primary), standalone binary (future)                     │
│                                                                              │
│  ├── bin/ai-sync.js                # CLI entry point                         │
│  ├── src/                          # Tool source code                        │
│  ├── defaults/                     # Generic personas, commands, rules       │
│  └── targets/                      # Default target mappings                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ runs against
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  .ai-tool-sync/                    PROJECT-SPECIFIC (in project git)         │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Contains: Project configuration + Project-specific content                  │
│                                                                              │
│  ├── config.yaml                   # Main configuration                      │
│  ├── rules/                        # Project-specific rules                  │
│  ├── personas/                     # Project-specific personas               │
│  ├── commands/                     # Project-specific commands               │
│  ├── hooks/                        # Project-specific hooks                  │
│  ├── mcp.yaml                      # MCP server configurations               │
│  ├── overrides/                    # Override defaults                       │
│  └── targets/                      # Project-specific target overrides       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ generates
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Generated Outputs                                                           │
│  ─────────────────────────────────────────────────────────────────────────  │
│  .cursor/rules/*.mdc               # Cursor rules                            │
│  .cursor/commands/roles/*.md       # Cursor personas                         │
│  .claude/skills/                   # Claude Code skills                      │
│  .claude/agents/                   # Claude personas                         │
│  .factory/skills/                  # Factory skills                          │
│  .factory/droids/                  # Factory personas                        │
│  CLAUDE.md, AGENTS.md              # Entry points                            │
│  mcp.json                          # MCP configuration                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Platform Comparison Matrix

### Feature Overview

| Feature | Cursor | Claude Code | Factory |
|---------|--------|-------------|---------|
| **Rules/Skills** | `.cursor/rules/*.mdc` | `.claude/skills/<name>/SKILL.md` | `.factory/skills/<name>/SKILL.md` |
| **Personas/Agents** | `.cursor/commands/roles/*.md` | `.claude/agents/<name>.md` | `.factory/droids/<name>.md` |
| **Commands** | `.cursor/commands/*.md` | `.claude/commands/*.md` | `.factory/commands/*.md` |
| **Entry Point** | `AGENTS.md` | `CLAUDE.md` | `AGENTS.md` |
| **Hooks** | `.cursor/hooks.json` | `.claude/settings.json` | `~/.factory/settings.json` |
| **MCP Config** | `mcp.json` | `.claude/mcp_servers.json` | `.factory/mcp.json` |

### Terminology Mapping

| Generic (ai-tool-sync) | Cursor | Claude Code | Factory |
|------------------------|--------|-------------|---------|
| personas | commands/roles | agents | droids |
| rules | rules (.mdc) | skills | skills |
| commands | commands | commands | commands |
| hooks | hooks | hooks | hooks |
| entry point | AGENTS.md | CLAUDE.md | AGENTS.md |

### Rules Configuration

| Aspect | Cursor | Claude Code | Factory |
|--------|--------|-------------|---------|
| **Location** | `.cursor/rules/` | `.claude/skills/<name>/` | `.factory/skills/<name>/` |
| **Extension** | `.mdc` | `SKILL.md` | `SKILL.md` |
| **Frontmatter** | `description`, `globs`, `alwaysApply` | `name`, `description` | `name`, `description`, `allowed-tools` |
| **Glob Patterns** | ✅ Via `globs:` field | ❌ Skills loaded by relevance | ❌ Droids invoked explicitly |
| **Always Apply** | ✅ `alwaysApply: true` | ✅ Via `@import` in CLAUDE.md | ✅ Via AGENTS.md |

### Commands Configuration

| Aspect | Cursor | Claude Code | Factory |
|--------|--------|-------------|---------|
| **Location** | `.cursor/commands/` | `.claude/commands/` | `.factory/commands/` |
| **Invocation** | `/command-name` | `/command-name` | `/command-name` |
| **Arguments** | Natural language after `/cmd` | `$ARGUMENTS` placeholder | `$ARGUMENTS` placeholder |
| **Tool Restrictions** | ✅ `allowedTools: [Read, Edit]` | ✅ Via permissions | ✅ Via `tools` allowlist |

### Hooks Configuration

| Aspect | Cursor | Claude Code | Factory |
|--------|--------|-------------|---------|
| **Supported** | ✅ (v1.7+) | ✅ | ✅ |
| **Config File** | `.cursor/hooks.json` | `.claude/settings.json` | `~/.factory/settings.json` |
| **Events** | `beforeSubmitPrompt`, `beforeShellExecution`, `beforeMCPExecution`, `beforeReadFile`, `afterFileEdit`, `stop` | `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Notification`, `Stop` | `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Notification`, `Stop`, `SubagentStop`, `PreCompact`, `SessionStart`, `SessionEnd` |
| **Can Block** | ✅ (before* events) | ✅ (`PreToolUse`) | ✅ (`PreToolUse`) |
| **Matcher** | Per-event commands | Regex patterns | Regex patterns |

### MCP Configuration

| Aspect | Cursor | Claude Code | Factory |
|--------|--------|-------------|---------|
| **Project Config** | `mcp.json` (root) | `.claude/mcp_servers.json` | `.factory/mcp.json` |
| **User Config** | UI / Settings | `~/.claude.json` | `~/.factory/mcp.json` |
| **Server Types** | stdio | stdio | stdio, http |

### Unique Features

| Platform | Unique Features |
|----------|-----------------|
| **Cursor** | Glob-based auto-apply rules, Shadow Workspace (background linting), Tab completion |
| **Claude Code** | `@import` syntax in CLAUDE.md, Plugin marketplace, Token-efficient skill loading |
| **Factory** | Autonomous droids with delegation, Factory Bridge for remote MCP, `reasoningEffort` control |

---

## Claude Code Plugin Ecosystem (Research Dec 2025)

### Plugin Marketplace & Distribution

Claude Code uses a **Git-based distribution model** (no npm registry):

| Aspect | Details |
|--------|---------|
| **Distribution** | GitHub, GitLab, self-hosted Git repos |
| **Official Reference** | `anthropics/claude-code` marketplace (GitHub) |
| **Installation** | `/plugin marketplace add owner/repo` or full Git URL |
| **Discovery** | CLI commands (`/plugin`), GitHub topics (`claude-code-plugin`) |
| **Team Distribution** | Auto-install via `.claude/settings.json` with marketplace + enabled plugin lists |
| **Versioning** | Semantic only, exact pinning (`"2.1.0"`), no ranges like npm |

### Official Plugin Structure

```
plugin-root/
├── .claude-plugin/
│   └── plugin.json            # [REQUIRED] Plugin manifest (minimal)
├── commands/                   # Custom slash commands
│   └── *.md
├── agents/                     # Subagents (personas)
│   └── *.md
├── skills/                     # SKILL.md files (auto-invoked by Claude)
│   └── <skill-name>/
│       └── SKILL.md
├── hooks/
│   └── hooks.json             # Event handlers
└── .mcp.json                   # MCP server configs (optional)
```

### plugin.json Manifest

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": "Author Name",
  "homepage": "https://github.com/org/plugin",
  "repository": "https://github.com/org/plugin",
  "license": "MIT",
  "keywords": ["claude-code", "development"],
  
  "commands": "commands/",
  "agents": "agents/",
  "hooks": "hooks/hooks.json",
  "mcpServers": ".mcp.json"
}
```

**Special Variable:** `${CLAUDE_PLUGIN_ROOT}` for plugin-relative paths in configs.

### Plugin Skills (Auto-Invoked)

Claude **autonomously decides** when to use skills based on task context (not manual slash commands):

```yaml
---
name: typescript-expert
description: TypeScript best practices and patterns
version: 1.0.0
tags: [typescript, programming, patterns]
---

# TypeScript Expert Skill

[Skill content...]
```

### Plugin Hooks System

Full event system with matchers for tool filtering:

| Event | Trigger | Can Block |
|-------|---------|-----------|
| `UserPromptSubmit` | Before user prompt processed | Yes |
| `PreToolUse` | Before any tool execution | Yes |
| `PostToolUse` | After tool execution | No |
| `Notification` | Claude wants to notify user | No |
| `Stop` | Agent stops responding | No |
| `SubagentStop` | Subagent completes | No |
| `SessionStart` | New session begins | No |
| `SessionEnd` | Session ends | No |
| `PreCompact` | Before context compaction | No |

**hooks.json Example:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "name": "safety-check",
        "match": "Bash(*rm*)",
        "type": "command",
        "command": "sh -c './hooks/safety-check.sh'",
        "action": "warn",
        "message": "Destructive command detected"
      }
    ],
    "PostToolUse": [
      {
        "name": "format-on-edit",
        "match": "Write|Edit",
        "type": "command",
        "command": "sh -c './hooks/format.sh'"
      }
    ]
  }
}
```

### Plugin MCP Servers

Plugins can bundle complete MCP servers (auto-lifecycle managed):

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp-server/index.js"],
      "env": {
        "DEBUG": "true"
      }
    },
    "remote-server": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
```

Supports: **stdio**, **HTTP**, **SSE** transports.

### Plugin Dependencies

**Not in official spec.** Workaround: soft deps in README + runtime checks.

### Known Community Plugins (Dec 2025)

| Plugin | Description |
|--------|-------------|
| **claudeup** | Plugin version manager CLI (solves missing update notifications) |
| **claude-infrastructure** | Skill template with 10 agents + auto-activation |
| **claude-plugins (cbrake)** | Hardware dev, KiCad integration |
| **Obsidian Claude Code MCP** | Knowledge vault integration |

### Plugin vs ai-tool-sync Terminology Mapping

| Claude Plugin | ai-tool-sync Generic |
|---------------|---------------------|
| `skills/` | `rules` |
| `agents/` | `personas` |
| `commands/` | `commands` |
| `hooks/hooks.json` | `hooks` |
| `.mcp.json` | `mcp.yaml` |
| `plugin.json` | (no equivalent yet) |

---

## Tool Behaviors (Detailed)

### Cursor
- **Entry point:** `AGENTS.md` (general context)
- **Rules:** `.cursor/rules/*.mdc` (flat structure, no subdirectories)
- **Commands:** `.cursor/commands/*.md` with frontmatter `description`, `allowedTools`, `globs`
- **Personas:** `.cursor/commands/roles/*.md` (commands used as persona workaround)
- **Hooks:** `.cursor/hooks.json` (v1.7+) - lifecycle events for agent automation
- **MCPs:** `mcp.json` in project root
- **Globs:** Via frontmatter `globs:` field for auto-apply

### Claude Code
- **Entry point:** `CLAUDE.md` (with `@import` support for skills)
- **Skills:** `.claude/skills/<name>/SKILL.md`
- **Agents:** `.claude/agents/<name>.md` with frontmatter `name`, `description`, `model`, `tools`
- **Commands:** `.claude/commands/*.md` with `$ARGUMENTS` variable
- **Hooks:** Via `.claude/settings.json` under `hooks` key
- **Settings:** `.claude/settings.json` for permissions, env vars, hooks
- **MCPs:** `.claude/mcp_servers.json` or `~/.claude.json`

### Factory
- **Entry point:** `AGENTS.md`
- **Skills:** `.factory/skills/<name>/SKILL.md`
- **Droids:** `.factory/droids/<name>.md` with frontmatter `name`, `model`, `tools`, `reasoningEffort`
- **Commands:** `.factory/commands/*.md` with `$ARGUMENTS` variable
- **Hooks:** `~/.factory/settings.json` - comprehensive event system
- **MCPs:** `.factory/mcp.json` supporting stdio and http server types

---

## Package Structure

```
ai-tool-sync/
├── bin/ai-sync.js                   # CLI entry point

├── src/
│   ├── cli/                         # CLI commands
│   │   ├── commands/
│   │   │   ├── sync.ts              # Main sync command
│   │   │   ├── init.ts              # Initialize .ai-tool-sync/
│   │   │   ├── validate.ts          # Validate config
│   │   │   └── migrate.ts           # Migration wizard
│   │   └── output.ts                # Console formatting
│   │
│   ├── config/
│   │   ├── loader.ts                # Load config.yaml
│   │   ├── validator.ts             # Validate against schema
│   │   ├── defaults.ts              # Default values
│   │   └── target-mapping.ts        # Load target configs
│   │
│   ├── parsers/
│   │   ├── frontmatter.ts           # YAML frontmatter parser
│   │   ├── rule.ts
│   │   ├── persona.ts
│   │   ├── command.ts
│   │   ├── hook.ts
│   │   └── mcp.ts                   # MCP config parser
│   │
│   ├── loaders/
│   │   ├── base.ts                  # Base loader interface
│   │   ├── local.ts                 # Local file loader
│   │   ├── npm.ts                   # npm package loader
│   │   ├── pip.ts                   # pip package loader
│   │   ├── git.ts                   # Git repository loader
│   │   ├── url.ts                   # URL loader
│   │   └── claude-plugin.ts         # Claude plugin loader
│   │
│   ├── generators/
│   │   ├── base.ts                  # Base generator interface
│   │   ├── cursor.ts
│   │   ├── claude.ts
│   │   ├── factory.ts
│   │   └── subfolder-context.ts     # Subfolder CLAUDE.md/AGENTS.md
│   │
│   ├── transformers/
│   │   ├── tool-mapper.ts
│   │   ├── model-mapper.ts
│   │   ├── frontmatter.ts
│   │   └── glob-matcher.ts
│   │
│   ├── schemas/                     # JSON schemas for validation
│   │   ├── config.schema.json
│   │   ├── rule.schema.json
│   │   ├── persona.schema.json
│   │   ├── command.schema.json
│   │   ├── hook.schema.json
│   │   └── mcp.schema.json
│   │
│   └── utils/
│       ├── fs.ts                    # File system utilities
│       ├── yaml.ts                  # YAML utilities
│       ├── logger.ts                # Logging
│       ├── result.ts                # Result<T, E> type
│       ├── manifest.ts              # Generated files manifest
│       └── gitignore.ts             # Gitignore management

├── defaults/                        # Generic reusable content
│   ├── personas/                    # 11 personas
│   │   ├── architect.md
│   │   ├── implementer.md
│   │   ├── security-hacker.md
│   │   ├── test-zealot.md
│   │   ├── data-specialist.md
│   │   ├── devops-specialist.md
│   │   ├── hyper-critic.md
│   │   ├── performance-optimizer.md
│   │   ├── ux-psychologist.md
│   │   ├── growth-hacker.md
│   │   └── coordinator.md
│   │
│   ├── commands/                    # 3 commands
│   │   ├── lint-fix.md
│   │   ├── type-check.md
│   │   └── format.md
│   │
│   ├── hooks/                       # 1 hook
│   │   └── pre-commit-lint.md
│   │
│   └── rules/                       # 2 rules
│       ├── code-review.md
│       └── documentation.md

├── targets/                         # Target mappings
│   ├── cursor.yaml
│   ├── claude.yaml
│   └── factory.yaml

└── tests/
    ├── unit/
    ├── integration/
    ├── e2e/
    └── fixtures/
```

---

## Project Configuration (`.ai-tool-sync/`)

```
.ai-tool-sync/
├── config.yaml                      # Main configuration
├── rules/                           # Project-specific rules
│   ├── _core.md                     # Core project context
│   ├── database.md
│   └── trade-engine/
│       ├── core.md
│       └── testing.md
├── personas/                        # Project-specific personas
├── commands/                        # Project-specific commands
├── hooks/                           # Project-specific hooks
├── mcp.yaml                         # MCP server configurations
├── overrides/                       # Override defaults
│   └── personas/
│       └── implementer.md           # Custom version
└── targets/                         # Target-specific overrides
    └── cursor.yaml
```

---

## Configuration File (`config.yaml`)

```yaml
version: 1.0.0
project_name: my-project

# What to use from ai-tool-sync defaults
use:
  personas:
    - architect
    - implementer
    - security-hacker
    - test-zealot
  commands:
    - lint-fix
    - type-check

# Additional loaders
loaders:
  - type: ai-tool-sync              # Default loader (always enabled)
  - type: local
    source: ../shared-rules/        # Monorepo shared rules
  - type: npm
    package: "@company/ai-rules"
    version: "^1.0.0"

# Targets to generate
targets:
  - cursor
  - claude
  - factory

# Rules configuration
rules:
  _core:
    always_apply: true
    description: "Core project context"
  
  database:
    always_apply: false
    globs:
      - "apps/web/supabase/**"
      - "**/*.sql"

# Subfolder context generation
subfolder_contexts:
  packages/trade-engine:
    rules: [_core, trade-engine/core]
    personas: [implementer, test-zealot]

# Output settings
output:
  clean_before_sync: true
  add_headers: true
  update_gitignore: true
```

---

## Generic Frontmatter Formats

### Rule Format

```yaml
---
name: database
description: Database schema, RLS, migrations
version: 1.0.0

always_apply: false
globs:
  - "apps/web/supabase/**"
  - "**/*.sql"

targets: [cursor, claude, factory]
requires: [_core]

category: infrastructure
priority: high
---

# Database Rules

[Content here...]
```

### Persona Format

```yaml
---
name: implementer
description: Pragmatic coding craftsman
version: 1.0.0

tools:
  - read
  - write
  - edit
  - execute
  - search

model: default
targets: [cursor, claude, factory]
---

# The Implementer

[Content here...]
```

### Command Format

```yaml
---
name: deploy
description: Deploy application to production
version: 1.0.0

execute: scripts/deploy.sh
args:
  - name: environment
    type: string
    default: staging
    choices: [staging, production]

targets: [cursor, claude, factory]
---

# Deploy Command

[Instructions here...]
```

### Hook Format

```yaml
---
name: pre-commit
description: Run checks before committing
version: 1.0.0

# Event names vary by platform (mapped automatically)
event: PreToolUse          # Claude/Factory: PreToolUse, Cursor: beforeShellExecution
tool_match: "Bash(git commit*)"
execute: scripts/pre-commit.sh

targets: [cursor, claude, factory]
---

# Pre-commit Hook

[Content here...]
```

**Event Mapping:**

| Generic Event | Cursor | Claude Code | Factory |
|---------------|--------|-------------|---------|
| `before_tool` | `beforeShellExecution` | `PreToolUse` | `PreToolUse` |
| `after_tool` | `afterFileEdit` | `PostToolUse` | `PostToolUse` |
| `before_prompt` | `beforeSubmitPrompt` | `UserPromptSubmit` | `UserPromptSubmit` |
| `on_stop` | `stop` | `Stop` | `Stop` |

### MCP Format (`.ai-tool-sync/mcp.yaml`)

```yaml
servers:
  filesystem:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    env:
      NODE_ENV: development
    targets: [cursor, claude]

  playwright:
    command: npx
    args: ["-y", "@playwright/mcp@latest"]
    targets: [cursor]
```

---

## Loader Architecture

The sync tool uses **loaders** to process different content sources and transform them to the generic format.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYNC PROCESS                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
     ┌────────────────────────────────┼────────────────────────────────┐
     │                                │                                │
     ▼                                ▼                                ▼
┌─────────────┐              ┌─────────────────┐              ┌─────────────┐
│ ai-tool-sync│              │ External Plugin │              │   Project   │
│  defaults/  │              │    Sources      │              │.ai-tool-sync│
└─────────────┘              └─────────────────┘              └─────────────┘
     │                                │                                │
     │ local                          │ loaders                        │ local
     │ loader                         │ (npm, pip, git, url, claude)   │ loader
     ▼                                ▼                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GENERIC FORMAT                                     │
│  (rules, personas, commands, hooks - all in unified schema)                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ generators
                                      ▼
     ┌────────────────────────────────┼────────────────────────────────┐
     │                                │                                │
     ▼                                ▼                                ▼
┌─────────────┐              ┌─────────────────┐              ┌─────────────┐
│   Cursor    │              │   Claude Code   │              │   Factory   │
│  .cursor/   │              │    .claude/     │              │  .factory/  │
└─────────────┘              └─────────────────┘              └─────────────┘
```

### Supported Loaders

| Loader | Source | Example |
|--------|--------|---------|
| `ai-tool-sync` | Built-in defaults | (automatic) |
| `local` | Local directory | `source: ../shared-rules/` |
| `npm` | npm package | `package: "@company/ai-rules"` |
| `pip` | pip package | `package: "ai-rules-django"` |
| `git` | Git repository | `source: "github:company/rules"` |
| `url` | Remote URL | `source: "https://example.com/rules.yaml"` |
| `claude-plugin` | Claude plugin format | `source: "./my-claude-plugin"` |

### Planned Loaders

| Loader | Source | Example | Status |
|--------|--------|---------|--------|
| `plugin` | Git-based plugins (Claude marketplace format) | `source: "github:owner/repo@1.0.0"` | T158 |

**Plugin Marketplace Support (Planned):**

```yaml
# config.yaml
plugins:
  - name: example-plugin
    source: github:anthropics/example-plugin@1.0.0
    enabled: true
    include: [rules, personas]
  
  - name: local-plugin
    source: ./plugins/my-plugin
    enabled: true
```

See [Claude Code Plugin Ecosystem](#claude-code-plugin-ecosystem-research-dec-2025) for full plugin specification.

---

## Target Mappings

Default mappings are in `targets/`. Projects can override in `.ai-tool-sync/targets/`.

### Example: `cursor.yaml`

```yaml
output:
  rules_dir: .cursor/rules
  rules_format: mdc
  personas_dir: .cursor/commands/roles
  commands_dir: .cursor/commands
  hooks_file: .cursor/hooks.json
  entry_point: null
  mcp_file: mcp.json

tool_mapping:
  read: Read
  write: Create
  edit: Edit
  execute: Execute
  search: Grep
  glob: Glob
  fetch: FetchUrl
  ls: LS

model_mapping:
  default: inherit
  fast: inherit
  powerful: inherit

frontmatter:
  rules:
    fields: [description, globs, alwaysApply]
    transforms:
      always_apply: alwaysApply
      globs: "join(',')"
  commands:
    fields: [description, allowedTools, globs]
```

---

## Generated Outputs

After running `ai-sync`:

```
# Root entry points
CLAUDE.md                           # For Claude Code
AGENTS.md                           # For Factory/Cursor
mcp.json                            # For Cursor MCP

# Cursor
.cursor/
├── rules/*.mdc                     # Rules with globs/alwaysApply
├── hooks.json                      # Lifecycle hooks (v1.7+)
└── commands/
    ├── *.md                        # Commands with allowedTools
    └── roles/*.md                  # Personas

# Claude Code
.claude/
├── skills/<name>/SKILL.md          # Skills (rules)
├── agents/<name>.md                # Agents (personas)
├── commands/<name>.md              # Commands with $ARGUMENTS
├── settings.json                   # Hooks, permissions, env
└── mcp_servers.json                # MCP configuration

# Factory
.factory/
├── skills/<name>/SKILL.md          # Skills (rules)
├── droids/<name>.md                # Droids (personas) with tools/model
├── commands/<name>.md              # Commands with $ARGUMENTS
└── mcp.json                        # MCP configuration (stdio/http)

# Subfolder contexts (if configured)
packages/trade-engine/CLAUDE.md
packages/trade-engine/AGENTS.md
```

---

## CLI Commands

```bash
# Install
npm i -g @anthropic/ai-tool-sync

# Initialize (creates .ai-tool-sync/ with templates)
ai-sync init
ai-sync init --force              # Overwrite existing

# Validate config without generating
ai-sync validate
ai-sync validate --verbose

# Generate outputs (main command)
ai-sync
ai-sync --dry-run                 # Preview without writing
ai-sync --verbose                 # Detailed output
ai-sync --project /path/to/project

# Migration wizard (detect existing configs)
ai-sync migrate
ai-sync migrate --backup          # Create backup first
```

---

## Configuration Directory

The configuration directory name is configurable (default: `.ai-tool-sync`):

| Method | Example | Priority |
|--------|---------|----------|
| CLI flag | `--config-dir=.ai` | Highest |
| Environment variable | `AI_TOOL_SYNC_DIR=.ai` | Medium |
| package.json | `"ai-tool-sync": { "configDir": ".ai" }` | Lowest |

---

## Gitignore Management

The tool automatically manages a section in `.gitignore`:

```gitignore
# >>> AI Tool Sync Generated (auto-managed) >>>
.cursor/rules/
.cursor/commands/
.claude/
.factory/
CLAUDE.md
AGENTS.md
mcp.json
# <<< AI Tool Sync Generated <<<
```

A manifest file `.ai-tool-sync-generated` tracks all generated files.

---

## FAQ

### Q: Why separate config folder and generated outputs?

- **`.ai-tool-sync/`** = Your source of truth (committed to git)
- **Generated outputs** = Tool-specific files (can be gitignored or committed)

This allows:
- Updating tool mappings without touching your config
- Sharing configurations across projects
- Project-specific customization without forking

### Q: Is it really language-agnostic?

Yes! The tool is distributed via npm but works with any project:
- The `.ai-tool-sync/` folder is just YAML and Markdown
- No runtime dependencies required in your project
- Works with Node.js, Python, Go, Rust, PHP, etc.

### Q: Can I use Claude plugins?

Yes! The `claude-plugin` loader transforms Claude-native plugins to our generic format, making them available to all targets (Cursor, Factory, etc.).

**Currently supported:**
- Skills → Rules
- Agents → Personas  
- Commands → Commands
- settings.json hooks → Hooks

**Planned (T155-T161):**
- `plugin.json` manifest parsing with all metadata fields
- `hooks/hooks.json` parsing (10 event types, matchers)
- `.mcp.json` extraction with auto-merge
- Git-based plugin marketplace integration (`github:owner/repo@version`)
- Plugin CLI: `ai-sync plugins add/remove/update`

### Q: What about existing configurations?

Use `ai-sync migrate` to:
- Detect existing `.cursor/rules/`, `CLAUDE.md`, etc.
- Analyze content for conversion
- Generate migration plan
- Optionally backup before migrating

---

## Design Principles

1. **Single Source of Truth** - One config, multiple outputs
2. **Tool-Agnostic Format** - Generic frontmatter uses snake_case naming conventions (`always_apply`, `tool_match`) and does NOT favor any particular tool's naming. Transformers convert to each tool's expected format (e.g., `always_apply` → `alwaysApply` for Cursor, globs array → comma-separated string).
3. **Extensibility** - Loader pattern for plugins, generator pattern for targets
4. **Error Handling** - Result types throughout, errors at CLI boundary only
5. **Testability** - 844+ tests, snapshot testing for outputs
6. **Backwards Compatibility** - Design for future targets without breaking changes

---

## Related Documentation

- [README.md](README.md) - Quick start and installation
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md) - Full config.yaml reference
- [docs/LOADERS.md](docs/LOADERS.md) - How to use each loader type
- [docs/GENERATORS.md](docs/GENERATORS.md) - Target-specific output details
- [CONTRIBUTING.md](CONTRIBUTING.md) - Development setup and guidelines
- [tasks.md](tasks.md) - Remaining development tasks
