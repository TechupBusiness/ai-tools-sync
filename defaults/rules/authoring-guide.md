---
name: authoring-guide
description: Guide for drafting ai-tool-sync rules, personas, commands, and hooks
version: 1.0.0
always_apply: false
globs:
  - ".ai-tool-sync/**/*.md"
  - ".ai-tool-sync/**/*.yaml"
  - ".ai-tool-sync/config.yaml"
targets:
  - cursor
  - claude
  - factory
category: documentation
priority: medium
---

# AI Tool Sync Authoring Guide

Guide for drafting rules, personas, commands, and hooks using the generic ai-tool-sync format. This skill provides a single source of truth for creating AI assistant configurations that work across multiple platforms.

## Quick Reference

| Kind | Location | Required Fields | Primary Use |
|------|----------|-----------------|-------------|
| rule | `.ai-tool-sync/rules/` | `name` | Guidelines, skills, context |
| persona | `.ai-tool-sync/personas/` | `name` | Agent personalities |
| command | `.ai-tool-sync/commands/` | `name` | Slash commands |
| hook | `.ai-tool-sync/hooks/` | `name`, `event` | Lifecycle automation |

## File Structure

All content files use Markdown with YAML frontmatter:

```markdown
---
name: my-content
description: Human-readable description
version: 1.0.0
# ... additional fields ...
---

# Markdown Body

Content goes here...
```

## Creating Rules

Rules provide guidelines, skills, and context that AI assistants reference when working on specific files or tasks.

### Rule Schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | - | Unique identifier (becomes slug) |
| `description` | string | No | - | Human-readable description |
| `version` | string | No | - | Semver version (e.g., `1.0.0`) |
| `always_apply` | boolean | No | `false` | Always load regardless of context |
| `globs` | string[] | No | - | File patterns to trigger this rule |
| `targets` | string[] | No | `[cursor, claude, factory]` | Platforms to generate for |
| `requires` | string[] | No | - | Dependent rules to load together |
| `category` | string | No | - | Organization category |
| `priority` | string | No | `medium` | Priority level (`low`, `medium`, `high`) |

### Rule Categories

- `core` - Fundamental project rules
- `infrastructure` - Deployment, CI/CD, environment
- `testing` - Test patterns and requirements
- `security` - Security guidelines
- `documentation` - Documentation standards
- `tooling` - Development tools and workflows
- `other` - Uncategorized

### Rule Example

```yaml
---
name: database
description: Database schema and query patterns
version: 1.0.0
always_apply: false
globs:
  - "**/*.sql"
  - "**/migrations/**"
  - "**/supabase/**"
targets:
  - cursor
  - claude
  - factory
category: infrastructure
priority: high
---

# Database Guidelines

[Rule content here...]
```

## Creating Personas

Personas define agent personalities with specific capabilities, tools, and communication styles.

### Persona Schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | - | Unique identifier |
| `description` | string | No | - | Human-readable description |
| `version` | string | No | - | Semver version |
| `tools` | string[] | No | - | Available tools (see Tool Mappings) |
| `model` | string | No | `default` | Model to use (see Model Mappings) |
| `targets` | string[] | No | `[cursor, claude, factory]` | Target platforms |
| `traits` | object | No | - | Additional characteristics |

### Persona Example

```yaml
---
name: code-reviewer
description: Thorough code reviewer focused on quality
version: 1.0.0
tools:
  - read
  - search
  - glob
model: default
targets:
  - cursor
  - claude
  - factory
---

# Code Reviewer

You are a meticulous code reviewer...

## Review Focus Areas

- Correctness and logic errors
- Security vulnerabilities
- Performance implications
- Code maintainability
```

## Creating Commands

Commands define slash commands that users can invoke to trigger specific actions.

### Command Schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | - | Command name (invoked as `/name`) |
| `description` | string | No | - | Human-readable description |
| `version` | string | No | - | Semver version |
| `execute` | string | No | - | Script or command to run |
| `args` | object[] | No | - | Command arguments |
| `globs` | string[] | No | - | File patterns where relevant |
| `allowedTools` | string[] | No | - | Tool restrictions |
| `variables` | object[] | No | - | Variable placeholders |
| `targets` | string[] | No | `[cursor, claude, factory]` | Target platforms |

### Argument Schema

```yaml
args:
  - name: environment
    type: string          # string, number, boolean
    description: Target environment
    default: staging
    choices: [staging, production]
    required: false
```

### Variable Placeholders

Commands support these built-in variables:
- `$ARGUMENTS` - User-provided arguments after the command name

### Command Example

```yaml
---
name: deploy
description: Deploy to specified environment
version: 1.0.0
execute: scripts/deploy.sh
args:
  - name: environment
    type: string
    default: staging
    choices: [staging, production]
targets:
  - cursor
  - claude
  - factory
---

# Deploy Command

Deploy the application to the specified environment.

Usage: `/deploy [environment]`

The command will:
1. Run pre-deployment checks
2. Build the application
3. Deploy to $ARGUMENTS (default: staging)
4. Run smoke tests
```

## Creating Hooks

Hooks automate actions based on lifecycle events during AI assistant sessions.

### Hook Schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | - | Unique identifier |
| `description` | string | No | - | Human-readable description |
| `version` | string | No | - | Semver version |
| `event` | string | Yes | - | Trigger event (see Event Mappings) |
| `tool_match` | string | No | - | Pattern to match tools |
| `execute` | string | No | - | Script to execute |
| `targets` | string[] | No | `[cursor, claude, factory]` | Target platforms |

### Generic Events

| Event | Description | Can Block |
|-------|-------------|-----------|
| `PreToolUse` | Before any tool execution | Yes |
| `PostToolUse` | After tool execution | No |
| `PreMessage` | Before processing user message | Yes |
| `PostMessage` | After generating response | No |
| `PreCommit` | Before git commit | Yes |

### Tool Match Patterns

```yaml
# Match specific tool
tool_match: "Bash"

# Match tool with arguments
tool_match: "Bash(git commit*)"

# Match multiple tools
tool_match: "Write|Edit"
```

### Hook Example

```yaml
---
name: pre-commit-lint
description: Run linting before commits
version: 1.0.0
event: PreToolUse
tool_match: "Bash(git commit*)"
execute: npm run lint
targets:
  - cursor
  - claude
  - factory
---

# Pre-commit Lint Hook

Automatically runs linting before git commits to ensure code quality.
```

## Tool Mappings

Generic tool names map to platform-specific equivalents:

| Generic | Cursor | Claude | Factory | Description |
|---------|--------|--------|---------|-------------|
| `read` | Read | Read | Read | Read file contents |
| `write` | Create | Write | Write | Create new files |
| `edit` | Edit | Edit | Edit | Modify existing files |
| `execute` | Execute | Bash | Bash | Run shell commands |
| `search` | Grep | Search | Search | Search file contents |
| `glob` | Glob | Glob | Glob | Find files by pattern |
| `fetch` | FetchUrl | Fetch | Fetch | HTTP requests |
| `ls` | LS | LS | LS | List directory contents |

## Model Mappings

Generic model values for the `model` field:

| Value | Description |
|-------|-------------|
| `default` | Platform's default model |
| `fast` | Optimized for speed (lower latency) |
| `powerful` | Highest capability model |
| `inherit` | Use the current session's model |

## Platform Extensions

Override generic settings for specific platforms using extension objects:

```yaml
---
name: my-rule
description: Rule with platform overrides
version: 1.0.0
always_apply: false
globs:
  - "**/*.ts"
targets:
  - cursor
  - claude
  - factory
# Platform-specific overrides
cursor:
  alwaysApply: true           # Cursor uses camelCase
  globs: ["src/**/*.ts"]      # Different globs for Cursor
claude:
  import_as_skill: true       # Claude-specific option
factory:
  reasoningEffort: high       # Factory-specific option
---
```

### Cursor Extensions

| Field | Type | Description |
|-------|------|-------------|
| `alwaysApply` | boolean | Override always_apply (camelCase) |
| `globs` | string[] | Override glob patterns |
| `description` | string | Override description |
| `allowedTools` | string[] | Tool restrictions for commands |

### Claude Extensions

| Field | Type | Description |
|-------|------|-------------|
| `import_as_skill` | boolean | Import as a skill in CLAUDE.md |
| `tools` | string[] | Tool restrictions |
| `model` | string | Model override |

### Factory Extensions

| Field | Type | Description |
|-------|------|-------------|
| `allowed-tools` | string[] | Tool allowlist |
| `tools` | string[] | Tool restrictions |
| `model` | string | Model override |
| `reasoningEffort` | string | Reasoning effort (`low`, `medium`, `high`) |

## Naming Conventions

### Slugification Rules

Names are converted to slugs for filenames and identifiers:

- Lowercase all characters
- Replace spaces with hyphens
- Replace underscores with hyphens
- Remove special characters
- Collapse multiple hyphens

**Examples:**
- `Database Rules` → `database-rules`
- `API_Gateway` → `api-gateway`
- `My Cool Feature!` → `my-cool-feature`

### File Naming

- All content files use `.md` extension
- Filename should match the `name` field slug
- Use lowercase with hyphens (kebab-case)

```
.ai-tool-sync/
├── rules/
│   ├── database-rules.md      # name: database-rules
│   └── api-guidelines.md      # name: api-guidelines
├── personas/
│   └── code-reviewer.md       # name: code-reviewer
├── commands/
│   └── deploy.md              # name: deploy
└── hooks/
    └── pre-commit-lint.md     # name: pre-commit-lint
```

## Validation Workflow

Before committing new content, follow this checklist:

### 1. Dry-run Preview

Preview what will be generated without writing files:

```bash
ai-sync create <kind> "<name>" --dry-run
```

### 2. Lint Validation (Rules Only)

For rules, verify linting passes:

```bash
ai-sync create rule "<name>" --dry-run --run-lint
```

### 3. Full Sync Test

Test the complete sync process:

```bash
ai-sync --dry-run
```

### 4. Validate Configuration

Check for schema and configuration errors:

```bash
ai-sync validate --verbose
```

### 5. Warning Checklist

Review output for warnings about:
- Unknown tool names (not in mapping)
- Unmapped model values
- Missing required fields
- Invalid glob patterns
- Schema validation errors

## Collision and Overwrite Guidance

### File Collisions

Files with matching names will collide during sync:
- Project files in `.ai-tool-sync/` override defaults
- Use `overrides/` folder to customize default content

### Avoiding Conflicts

1. Check existing files: `ai-sync status`
2. Use unique names for project-specific content
3. Override defaults explicitly in `overrides/` folder

### Force Overwrite

When intentionally replacing files:

```bash
ai-sync --force
```

Or in configuration:

```yaml
output:
  overwrite: true
```

## Common Pitfalls

### Frontmatter Mistakes

| Mistake | Correct |
|---------|---------|
| `alwaysApply: true` | `always_apply: true` (snake_case in generic) |
| `toolMatch: "..."` | `tool_match: "..."` (snake_case) |
| Missing `name` field | Always include `name` |
| Invalid `version` format | Use semver: `1.0.0` |

### Glob Pattern Issues

| Issue | Solution |
|-------|----------|
| Pattern doesn't match | Test with `ai-sync validate --verbose` |
| Too broad patterns | Be specific: `src/**/*.ts` not `**/*` |
| Missing quotes | Quote patterns with special chars |

### Platform-Specific Gotchas

- **Cursor**: Uses camelCase in frontmatter (`alwaysApply`, `allowedTools`)
- **Claude**: Skills are auto-invoked based on relevance, not globs
- **Factory**: Droids are invoked explicitly, not auto-triggered

## Output Locations

After running `ai-sync`, content is generated to:

| Kind | Cursor | Claude | Factory |
|------|--------|--------|---------|
| Rules | `.cursor/rules/*.mdc` | `.claude/skills/<name>/SKILL.md` | `.factory/skills/<name>/SKILL.md` |
| Personas | `.cursor/commands/roles/*.md` | `.claude/agents/<name>.md` | `.factory/droids/<name>.md` |
| Commands | `.cursor/commands/*.md` | `.claude/commands/*.md` | `.factory/commands/*.md` |
| Hooks | `.cursor/hooks.json` | `.claude/settings.json` | `~/.factory/settings.json` |

## Further Reading

- `docs/CONFIGURATION.md` - Full configuration reference
- `docs/LOADERS.md` - External content loaders
- `docs/GENERATORS.md` - Target-specific output details
