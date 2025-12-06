# Loaders Guide

Loaders are responsible for fetching rules, personas, commands, and hooks from various sources. ai-tool-sync supports multiple loader types to accommodate different workflows and distribution methods.

## Table of Contents

- [Overview](#overview)
- [Loader Types](#loader-types)
  - [ai-tool-sync](#ai-tool-sync-loader)
  - [local](#local-loader)
  - [npm](#npm-loader)
  - [pip](#pip-loader)
  - [git](#git-loader)
  - [url](#url-loader)
  - [claude-plugin](#claude-plugin-loader)
- [Content Structure](#content-structure)
- [Creating Shareable Packages](#creating-shareable-packages)

## Overview

Loaders are configured in the `loaders` section of `.ai/config.yaml`:

```yaml
loaders:
  - type: ai-tool-sync      # Built-in defaults
  - type: local
    source: ../shared-rules
  - type: npm
    package: "@company/ai-rules"
```

Each loader:
1. Fetches content from its source
2. Parses rules, personas, commands, and hooks
3. Validates against schemas
4. Returns content in a generic format

The sync process merges content from all loaders, then generates target-specific outputs.

## Loader Types

### ai-tool-sync Loader

Loads built-in defaults from the ai-tool-sync package itself. This is the most common loader and provides pre-built personas and commands.

**Configuration:**

```yaml
loaders:
  - type: ai-tool-sync
```

**What's Included:**

| Type | Items |
|------|-------|
| Personas | architect, implementer, security-hacker, test-zealot, data-specialist, devops-specialist, hyper-critic, performance-optimizer, ux-psychologist, growth-hacker, coordinator |
| Commands | lint-fix, type-check, format |
| Hooks | pre-commit-lint |
| Rules | code-review, documentation |

**Selecting Specific Content:**

Use the `use` configuration to select which defaults to enable:

```yaml
use:
  personas:
    - architect
    - implementer
  commands:
    - lint-fix
```

---

### local Loader

Loads content from a local directory. Useful for:
- Monorepo shared rules
- Company-wide configuration
- Local development

**Configuration:**

```yaml
loaders:
  - type: local
    source: ../shared-rules      # Relative path
  
  - type: local
    source: /absolute/path       # Absolute path
  
  - type: local
    source: ./my-rules           # Relative to project root
```

**Expected Directory Structure:**

```
source/
├── rules/           # Rule markdown files
│   ├── core.md
│   └── database.md
├── personas/        # Persona markdown files
│   └── custom.md
├── commands/        # Command markdown files
│   └── deploy.md
└── hooks/           # Hook markdown files
    └── safety.md
```

**Options:**

| Option | Description |
|--------|-------------|
| `source` | Path to the content directory |

---

### npm Loader

Loads content from npm packages. Ideal for:
- Distributing company-wide rules
- Publishing reusable configurations
- Version-controlled dependencies

**Configuration:**

```yaml
loaders:
  # Basic usage
  - type: npm
    package: "ai-rules-typescript"
  
  # Scoped package
  - type: npm
    package: "@company/ai-rules-react"
  
  # With version constraint
  - type: npm
    package: "@company/ai-rules"
    version: "^2.0.0"
```

**Version Constraints:**

| Format | Meaning |
|--------|---------|
| `^1.0.0` | Compatible with 1.x.x |
| `~1.0.0` | Compatible with 1.0.x |
| `>=1.0.0` | 1.0.0 or higher |
| `1.0.0` | Exactly 1.0.0 |

**Package Structure:**

npm packages can specify their ai-tool-sync content in `package.json`:

```json
{
  "name": "@company/ai-rules",
  "version": "1.0.0",
  "aiContentPath": "content",
  "aiToolSync": {
    "rules": "rules",
    "personas": "personas",
    "commands": "commands",
    "hooks": "hooks"
  }
}
```

**Search Locations:**

1. `package/defaults/`
2. `package/ai-content/`
3. `package/content/`
4. `package/` (if has rules/personas/commands/hooks subdirs)
5. Custom path from `aiContentPath`

---

### pip Loader

Loads content from Python pip packages. Useful for:
- Python projects
- Django/Flask rule distributions
- Cross-language team sharing

**Configuration:**

```yaml
loaders:
  # Basic usage
  - type: pip
    package: "ai-rules-django"
  
  # With version constraint
  - type: pip
    package: "ai-rules-django"
    version: ">=1.0.0"
```

**Version Constraints (PEP 440):**

| Format | Meaning |
|--------|---------|
| `>=1.0.0` | 1.0.0 or higher |
| `~=1.0.0` | Compatible release (>=1.0.0, <1.1.0) |
| `==1.0.0` | Exactly 1.0.0 |
| `>=1.0,<2.0` | Range constraint |

**Package Configuration:**

Configure in `pyproject.toml`:

```toml
[project]
name = "ai-rules-django"
version = "1.0.0"

[tool.ai-tool-sync]
content_path = "content"
rules = "rules"
personas = "personas"
commands = "commands"
hooks = "hooks"
```

**Virtual Environment Support:**

The pip loader automatically detects:
- `VIRTUAL_ENV` environment variable
- `CONDA_PREFIX` for conda environments
- `.venv`, `venv`, `.env`, `env` directories

---

### git Loader

Loads content directly from Git repositories. Perfect for:
- Sharing without package registries
- Private repositories
- Specific version pinning

**Configuration:**

```yaml
loaders:
  # GitHub shorthand
  - type: git
    source: github:company/ai-rules
  
  # GitLab shorthand
  - type: git
    source: gitlab:company/ai-rules
  
  # Bitbucket shorthand
  - type: git
    source: bitbucket:company/ai-rules
  
  # With branch/tag/commit
  - type: git
    source: github:company/ai-rules#v1.0.0
  
  # With subpath
  - type: git
    source: github:company/monorepo/packages/ai-rules#main
  
  # Full git URL
  - type: git
    source: git:https://github.com/company/ai-rules.git#main
  
  # SSH URL
  - type: git
    source: git@github.com:company/ai-rules.git#main
```

**Source Formats:**

| Format | Example |
|--------|---------|
| GitHub shorthand | `github:user/repo` |
| GitLab shorthand | `gitlab:user/repo` |
| Bitbucket shorthand | `bitbucket:user/repo` |
| Full git URL | `git:https://github.com/user/repo.git` |
| SSH URL | `git@github.com:user/repo.git` |

**References:**

Add `#ref` to specify a branch, tag, or commit:

```yaml
source: github:company/rules#v1.0.0      # Tag
source: github:company/rules#main        # Branch
source: github:company/rules#abc123      # Commit SHA
```

**Caching:**

Repositories are cached in `.ai/plugins/git/`:

- Default TTL: 24 hours
- Use `--force-refresh` to bypass cache
- Cache includes commit SHA for verification

**Private Repositories:**

For private repositories, use SSH:

```yaml
source: git@github.com:company/private-rules.git
```

Or configure a token in your environment.

---

### url Loader

Loads content from remote HTTP/HTTPS URLs. Useful for:
- Simple hosting without package managers
- Static file servers
- CDN distribution

**Configuration:**

```yaml
loaders:
  # Single file
  - type: url
    source: "https://example.com/rules/typescript.md"
  
  # Directory with index
  - type: url
    source: "https://example.com/ai-rules/"
```

**Single File:**

For single files, the type is detected from the URL path:
- `/rules/` → rule
- `/personas/` or `/agents/` → persona
- `/commands/` → command
- `/hooks/` → hook

**Directory-Style:**

For directories, provide an `index.json`:

```json
{
  "rules": ["core.md", "database.md"],
  "personas": ["architect.md"],
  "commands": ["deploy.md"],
  "hooks": []
}
```

**Caching:**

- Default TTL: 1 hour
- Supports ETag and If-None-Match headers
- File cache in `.ai/plugins/url/`

**Timeouts:**

Default timeout is 30 seconds. For slow connections, content is cached aggressively.

---

### claude-plugin Loader

Loads and transforms Claude-native plugin format. Enables using Claude plugins with other tools.

**Configuration:**

```yaml
loaders:
  # npm package
  - type: claude-plugin
    source: "@anthropic/web-dev"
  
  # Local path
  - type: claude-plugin
    source: ./my-claude-plugin
  
  # Full npm reference
  - type: claude-plugin
    source: npm:@company/claude-plugin
```

**Claude Plugin Structure:**

```
plugin/
├── skills/              # Become rules
│   ├── typescript/
│   │   └── SKILL.md
│   └── react.md
├── agents/              # Become personas
│   └── developer.md
├── commands/            # Remain commands
│   └── lint.md
└── settings.json        # Hooks extracted
```

**Transformation:**

| Claude Term | Generic Term |
|-------------|--------------|
| skill | rule |
| agent | persona |
| command | command |
| settings.json hooks | hooks |

**Settings.json Hooks:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "name": "safety-check",
        "match": "Bash(*rm*)",
        "action": "warn",
        "message": "Destructive command detected"
      }
    ]
  }
}
```

---

## Content Structure

All loaders expect content to follow this structure:

### Rules (`rules/*.md`)

```yaml
---
name: my-rule
description: Description of the rule
version: 1.0.0

always_apply: false
globs:
  - "**/*.ts"
  - "**/*.tsx"

targets: [cursor, claude, factory]
priority: high
category: infrastructure
requires: [_core]
---

# Rule Content

Your rule content here...
```

### Personas (`personas/*.md`)

```yaml
---
name: my-persona
description: Description of the persona
version: 1.0.0

tools:
  - read
  - write
  - edit
  - execute
  - search
  - glob

model: default

targets: [cursor, claude, factory]
---

# Persona Content

Your persona content here...
```

### Commands (`commands/*.md`)

```yaml
---
name: my-command
description: Description of the command
version: 1.0.0

execute: scripts/my-command.sh
args:
  - name: environment
    type: string
    default: dev
    choices: [dev, staging, production]

targets: [cursor, claude, factory]
---

# Command Content

Your command documentation here...
```

### Hooks (`hooks/*.md`)

```yaml
---
name: my-hook
description: Description of the hook
version: 1.0.0

event: PreToolUse
tool_match: "Bash(*deploy*)"
execute: scripts/check-deploy.sh

targets: [claude]
---

# Hook Content

Your hook content here...
```

---

## Creating Shareable Packages

### npm Package

1. **Create package structure:**

```
my-ai-rules/
├── package.json
├── defaults/
│   ├── rules/
│   │   └── typescript.md
│   ├── personas/
│   │   └── ts-expert.md
│   └── commands/
│       └── compile.md
└── README.md
```

2. **Configure package.json:**

```json
{
  "name": "@company/ai-rules-typescript",
  "version": "1.0.0",
  "description": "TypeScript rules for ai-tool-sync",
  "files": ["defaults"],
  "keywords": ["ai-tool-sync", "rules"],
  "aiContentPath": "defaults"
}
```

3. **Publish:**

```bash
npm publish
```

4. **Use:**

```yaml
loaders:
  - type: npm
    package: "@company/ai-rules-typescript"
```

### pip Package

1. **Create package structure:**

```
ai_rules_django/
├── pyproject.toml
├── ai_rules_django/
│   ├── __init__.py
│   └── content/
│       ├── rules/
│       ├── personas/
│       └── commands/
└── README.md
```

2. **Configure pyproject.toml:**

```toml
[project]
name = "ai-rules-django"
version = "1.0.0"
description = "Django rules for ai-tool-sync"

[tool.ai-tool-sync]
content_path = "ai_rules_django/content"
```

3. **Publish:**

```bash
pip install build twine
python -m build
twine upload dist/*
```

4. **Use:**

```yaml
loaders:
  - type: pip
    package: "ai-rules-django"
```

### Git Repository

1. **Create repository structure:**

```
ai-rules/
├── rules/
│   ├── core.md
│   └── security.md
├── personas/
│   └── security-expert.md
└── README.md
```

2. **Push to Git:**

```bash
git init
git add .
git commit -m "Initial ai-tool-sync content"
git remote add origin git@github.com:company/ai-rules.git
git push -u origin main
git tag v1.0.0
git push --tags
```

3. **Use:**

```yaml
loaders:
  - type: git
    source: github:company/ai-rules#v1.0.0
```

---

## Loader Priority

When multiple loaders provide content with the same name, later loaders override earlier ones:

```yaml
loaders:
  - type: ai-tool-sync        # Base defaults
  - type: npm
    package: "@company/rules" # Company overrides
  - type: local
    source: ./.ai             # Project-specific (highest priority)
```

Use `.ai/overrides/` for targeted overrides without replacing entire content.

