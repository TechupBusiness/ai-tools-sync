# Platform Feature Matrix

This document tracks feature support across different AI coding assistant platforms that ai-tool-sync generates outputs for.

## Legend

- ✅ Supported - Feature is implemented and working
- ⚠️ Partial - Feature has limited support or requires workarounds
- ❌ Not Supported - Platform doesn't support this feature
- 🔄 Planned - Feature support is planned but not yet implemented

---

## Content Types

| Content Type | Cursor | Claude Code | Factory | Notes |
|--------------|--------|-------------|---------|-------|
| **Rules/Skills** | ✅ `.cursor/rules/*.mdc` | ✅ `.claude/skills/<name>/SKILL.md` | ✅ `.factory/skills/<name>/SKILL.md` | Different directory structures |
| **Personas/Agents** | ✅ `.cursor/commands/roles/*.md` | ✅ `.claude/agents/<name>.md` | ✅ `.factory/droids/<name>.md` | Cursor uses commands as workaround |
| **Commands** | ✅ `.cursor/commands/*.md` | ✅ `.claude/commands/*.md` | ✅ `.factory/commands/*.md` | |
| **Hooks** | ✅ `.cursor/hooks.json` | ✅ `.claude/settings.json` | 🔄 `~/.factory/settings.json` | Different config formats |
| **Entry Point** | ✅ `AGENTS.md` | ✅ `CLAUDE.md` | ✅ `AGENTS.md` | |
| **MCP Config** | ✅ `mcp.json` | ✅ `.claude/mcp_servers.json` | 🔄 `.factory/mcp.json` | |

---

## Rules Configuration

| Feature | Cursor | Claude Code | Factory |
|---------|--------|-------------|---------|
| **Frontmatter** | ✅ `description`, `globs`, `alwaysApply` | ✅ `name`, `description` | ✅ `name`, `description`, `allowed-tools` |
| **Glob Patterns** | ✅ Via `globs:` field | ❌ Skills loaded by relevance | ❌ Droids invoked explicitly |
| **Always Apply** | ✅ `alwaysApply: true` | ✅ Via `@import` in CLAUDE.md | ✅ Via AGENTS.md |
| **Priority** | ❌ Not supported | ❌ Not supported | ❌ Not supported |
| **Tool Restrictions** | ❌ Not for rules | ❌ Not for skills | ⚠️ Reserved `allowed-tools` field |

---

## Commands Configuration

| Feature | Cursor | Claude Code | Factory |
|---------|--------|-------------|---------|
| **Location** | `.cursor/commands/` | `.claude/commands/` | `.factory/commands/` |
| **Invocation** | `/command-name` | `/command-name` | `/command-name` |
| **Description** | ✅ Frontmatter | ✅ Frontmatter | ✅ Frontmatter |
| **Arguments** | ⚠️ Natural language | ✅ `$ARGUMENTS` placeholder | ✅ `$ARGUMENTS` placeholder |
| **Tool Restrictions** | ✅ `allowedTools: [Read, Edit]` | ❌ Use permissions instead | ✅ Via `tools` allowlist |
| **Globs** | ✅ `globs:` for context | ❌ Not supported | ❌ Not supported |

---

## Personas/Agents Configuration

| Feature | Cursor | Claude Code | Factory |
|---------|--------|-------------|---------|
| **Location** | `.cursor/commands/roles/` | `.claude/agents/` | `.factory/droids/` |
| **Name** | ✅ File name | ✅ Frontmatter | ✅ Frontmatter |
| **Description** | ✅ In content | ✅ Frontmatter | ✅ Frontmatter ≤500 chars |
| **Model Override** | ❌ Not supported | ✅ `model` field | ✅ `model` field |
| **Tool Restrictions** | ❌ Not supported | ✅ `tools` array | ✅ `tools` array/category |
| **Reasoning Effort** | ❌ Not supported | ❌ Not supported | ✅ `reasoningEffort` |

### Factory Tool Categories

Factory supports both individual tool IDs and categories:

| Category | Included Tools |
|----------|---------------|
| `read-only` | Read, LS, Grep, Glob |
| `edit` | read-only + Create, Edit, ApplyPatch |
| `execute` | edit + Execute |
| `web` | FetchUrl, WebSearch |
| `mcp` | MCP tool access |

---

## Hooks Configuration

| Feature | Cursor | Claude Code | Factory |
|---------|--------|-------------|---------|
| **Config File** | `.cursor/hooks.json` | `.claude/settings.json` | `~/.factory/settings.json` |
| **Format** | JSON hooks object | JSON settings object | JSON settings object |
| **Blocking** | ✅ `before*` events | ✅ `PreToolUse` | ✅ `PreToolUse` |
| **Matchers** | Per-event commands | Regex patterns | Regex patterns |

### Hook Events Mapping

| Generic Event | Cursor | Claude Code | Factory |
|---------------|--------|-------------|---------|
| `before_prompt` | `beforeSubmitPrompt` | `UserPromptSubmit` | `UserPromptSubmit` |
| `before_tool` | `beforeShellExecution` | `PreToolUse` | `PreToolUse` |
| `after_tool` | `afterFileEdit` | `PostToolUse` | `PostToolUse` |
| `on_stop` | `stop` | `Stop` | `Stop` |
| `before_read` | `beforeReadFile` | ❌ | ❌ |
| `before_mcp` | `beforeMCPExecution` | ❌ | ❌ |
| `notification` | ❌ | `Notification` | `Notification` |
| `session_start` | ❌ | `SessionStart` | `SessionStart` |
| `session_end` | ❌ | `SessionEnd` | `SessionEnd` |
| `subagent_stop` | ❌ | `SubagentStop` | `SubagentStop` |
| `pre_compact` | ❌ | `PreCompact` | `PreCompact` |

---

## Claude Code Settings

Claude Code supports additional platform-specific settings through the `claude.settings` section in config.yaml:

### Permissions

Control which tools Claude can use automatically:

```yaml
claude:
  settings:
    permissions:
      - matcher: "Bash(*)"      # Allow all Bash commands
        action: allow
      - matcher: "Bash(rm*)"    # Block destructive commands
        action: deny
        message: "Destructive operations blocked"
      - matcher: "Read"         # Ask before reading
        action: ask
```

**Permission Actions:**
- `allow` - Tool can be used without prompting
- `deny` - Tool usage is blocked
- `ask` - User will be prompted before tool use

**Matcher Patterns:**
- Exact tool name: `"Read"`, `"Write"`, `"Bash"`
- Wildcards: `"Bash(*)"` matches all Bash commands
- Specific patterns: `"Bash(rm*)"` matches destructive Bash commands

### Environment Variables

Set environment variables for Claude sessions:

```yaml
claude:
  settings:
    env:
      NODE_ENV: development
      DEBUG: "true"
      API_KEY: "${API_KEY}"  # Can reference system env vars
```

These settings are written to `.claude/settings.json` alongside hooks and commands.

### Hooks

Claude Code supports event-based hooks that run shell commands at specific points in the workflow.

#### Configuration in config.yaml

```yaml
claude:
  settings:
    hooks:
      PreToolUse:
        - name: lint-on-commit
          matcher: "Bash(git commit*)"
          command: "npm run lint"
          action: warn
          message: "Running lint before commit"
      PostToolUse:
        - name: format-on-edit
          matcher: "Write|Edit"
          command: "npm run format"
```

#### Hook File Format

Hooks can also be defined as markdown files in `.ai-tool-sync/hooks/`:

```yaml
---
name: pre-commit-lint
event: PreToolUse
tool_match: "Bash(git commit*)"
execute: pnpm lint
targets:
  - claude
claude:
  action: warn
  message: "Running lint check"
---

# Pre-Commit Lint Hook

Automatically run linting checks before any git commit.
```

#### Supported Events

| Event | Description | Can Block |
|-------|-------------|-----------|
| `UserPromptSubmit` | Before user prompt processed | Yes |
| `PreToolUse` | Before tool execution | Yes |
| `PostToolUse` | After tool execution | No |
| `Notification` | When Claude notifies | No |
| `Stop` | Agent stops | No |
| `SubagentStop` | Subagent completes | No |
| `SessionStart` | Session begins | No |
| `SessionEnd` | Session ends | No |
| `PreCompact` | Before context compaction | No |

**Blocking Events:**
- `UserPromptSubmit` and `PreToolUse` can block execution if the hook returns non-zero
- Use `action: block` or `action: warn` to control behavior
- Other events are informational only

#### Matcher Patterns

| Pattern | Description |
|---------|-------------|
| Omitted or `*` | Match all tools |
| `ToolName` | Match specific tool (e.g., `Bash`, `Read`) |
| `ToolName(pattern)` | Match with argument (e.g., `Bash(*rm*)`) |
| `Tool1|Tool2` | Match multiple tools |

**Example Matchers:**
- `Bash(git commit*)` - Git commits
- `Bash(*rm*)` - Destructive rm commands
- `Write|Edit` - Any file modifications
- `Read` - File reads

#### Hook Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| `command` | Yes | Shell command to execute |
| `name` | No | Identifier for logging/debugging |
| `matcher` | No | Tool pattern to match (default: match all) |
| `type` | No | Hook type: `command`, `validation`, `notification` (default: `command`) |
| `action` | No | `warn` or `block` (PreToolUse only) |
| `message` | No | User-facing message |

#### Legacy Event Mapping

For backwards compatibility, legacy event names are automatically mapped:

| Legacy Event | Maps To | Notes |
|--------------|---------|-------|
| `PreMessage` | `UserPromptSubmit` | Renamed to match Claude's naming |
| `PostMessage` | `PostToolUse` | Best approximation |
| `PreCommit` | `PreToolUse` | With default `Bash(git commit*)` matcher |

**Generated settings.json Format:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "npm run lint",
        "matcher": "Bash(git commit*)",
        "action": "warn",
        "message": "Running lint check"
      }
    ],
    "PostToolUse": [
      {
        "type": "command",
        "command": "npm run format",
        "matcher": "Write|Edit"
      }
    ]
  }
}
```

---

## MCP Configuration

| Feature | Cursor | Claude Code | Factory |
|---------|--------|-------------|---------|
| **Project Config** | `mcp.json` (root) | `.claude/mcp_servers.json` | `.factory/mcp.json` |
| **User Config** | UI / Settings | `~/.claude.json` | `~/.factory/mcp.json` |
| **stdio Servers** | ✅ `command`, `args`, `env` | ✅ `command`, `args`, `env` | ✅ `command`, `args`, `env` |
| **HTTP Servers** | ⚠️ Limited | ✅ `url`, `headers` | ✅ `url`, `headers` |
| **SSE Servers** | ❌ Not supported | ✅ Supported | ✅ Supported |

---

## Tool Name Mappings

Different platforms use different names for the same tool capabilities:

| Generic (ai-tool-sync) | Cursor | Claude Code | Factory |
|------------------------|--------|-------------|---------|
| `read` | Read | Read | read |
| `write` | Create | Write | write |
| `edit` | Edit | Edit | edit |
| `execute` | Execute | Bash | execute |
| `search` | Grep | Search | search |
| `glob` | Glob | Glob | glob |
| `fetch` | FetchUrl | WebFetch | fetch |
| `ls` | LS | ListDir | list |

---

## Platform-Specific Frontmatter Extensions

ai-tool-sync supports platform-specific overrides in frontmatter using the platform name as a key:

```yaml
---
name: my-rule
description: A cross-platform rule

# Platform-specific overrides
cursor:
  alwaysApply: true
  globs: ["**/*.ts"]

claude:
  import_as_skill: true

factory:
  allowed-tools: ["read", "edit"]
---
```

### Supported Extensions

| Platform | Extension Fields | Applied To |
|----------|-----------------|------------|
| **Cursor** | `alwaysApply`, `globs`, `allowedTools`, `description` | Rules, Commands |
| **Claude** | `import_as_skill`, `tools`, `model`, `action`, `message`, `type` | Rules, Personas, Hooks |
| **Factory** | `allowed-tools`, `tools`, `model`, `reasoningEffort` | Rules, Personas, Droids |

---

## Variables

| Variable | Cursor | Claude Code | Factory |
|----------|--------|-------------|---------|
| `$ARGUMENTS` | ❌ (natural language) | ✅ Commands | ✅ Commands |
| `$FACTORY_PROJECT_DIR` | ❌ | ❌ | ✅ Hooks |
| `${CLAUDE_PLUGIN_ROOT}` | ❌ | ✅ Plugins | ❌ |
| `@Selection` | ✅ Context symbol | ❌ | ❌ |
| `@File` | ✅ Context symbol | ❌ | ❌ |
| `@Diff` | ✅ Context symbol | ❌ | ❌ |

---

## Implementation Status

| Task | Description | Status |
|------|-------------|--------|
| T197 | Platform feature matrix (this doc) | ✅ Done |
| T198 | Platform-specific frontmatter extensions | ✅ Done |
| T199 | Cursor `allowedTools` support | ✅ Done |
| T200 | Factory command variables | ❌ Pending |
| T201 | Tests for platform feature parity | ✅ Done |
| T202 | Claude Code settings.json generation | ✅ Done |
| T203 | Claude Code hooks support | ✅ Done |
| T204 | Claude Code commands support | ❌ Pending |
| T205 | Claude Code agent tool restrictions | ❌ Pending |
| T206 | Factory droids support | ❌ Pending |
| T207 | Factory hooks support | ❌ Pending |
| T208 | Factory MCP generation | ❌ Pending |
| T209 | Factory skills support | ❌ Pending |
| T210 | Factory feature tests | ❌ Pending |
| T211 | Cursor hooks.json support | ✅ Done |

---

## Related Documentation

- [CONFIGURATION.md](./CONFIGURATION.md) - Full configuration reference
- [GENERATORS.md](./GENERATORS.md) - Generator-specific output details
- [LOADERS.md](./LOADERS.md) - Content loader documentation

