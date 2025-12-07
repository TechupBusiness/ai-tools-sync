# AI Tool Sync - Development Tasks

Based on the architecture defined in `plan.md`, this document tracks remaining tasks and summarizes completed work.

---

## Legend

- **Priority**: P0 (MVP), P1 (Important), P2 (Nice to have)
- **Status**: `[ ]` Todo, `[~]` In Progress, `[x]` Done
- **Wave**: Execution order (Wave 1 first, then Wave 2, etc.)

---

## Completed Work Summary

### MVP Complete ✅ (844+ tests passing)

| Phase | Description | Tasks | Status |
|-------|-------------|-------|--------|
| **Phase 1** | Project Foundation | T001-T006 | ✅ Repository, TypeScript, build tooling, testing |
| **Phase 2** | Core Infrastructure | T010-T033 | ✅ JSON schemas, utilities, config system |
| **Phase 3** | Parsers | T040-T046 | ✅ Frontmatter, rule, persona, command, hook parsers |
| **Phase 4** | Transformers | T050-T054 | ✅ Tool/model mappers, frontmatter transforms, glob matching |
| **Phase 5** | Loaders | T060-T069 | ✅ Local, npm, pip, Claude plugin, URL, git loaders |
| **Phase 6** | Generators | T070-T078 | ✅ Cursor, Claude, Factory, subfolder context generators |
| **Phase 7** | Target Mappings | T080-T083 | ✅ cursor.yaml, claude.yaml, factory.yaml |
| **Phase 8** | CLI | T090-T096 | ✅ sync, init, validate commands |
| **Phase 9** | Default Content | T100-T116 | ✅ 11 personas, 3 commands, 1 hook, 2 rules |
| **Phase 10** | Integration & E2E | T120-T123 | ✅ Pipeline, config resolution, snapshots |
| **Phase 11** | Documentation | T130-T135 | ✅ README, docs/, examples/ |
| **Phase 12** | CI/CD | T140-T143 | ✅ GitHub Actions workflows |
| **Phase 14** | Code Quality | T160-T171 | ✅ ESLint, TypeScript strict mode fixes |

### Post-MVP Complete ✅

| Feature | Tasks | Status |
|---------|-------|--------|
| Configurable folder name | T180-T182 | ✅ `.ai-tool-sync` default, env/CLI/package.json override |
| Migration wizard | T183-T187 | ✅ `ai-sync migrate` command (24 tests) |
| Generated files tracking | T188-T190 | ✅ Manifest + gitignore auto-update (52 tests) |
| MCP configuration | T191-T196 | ✅ Parser + all generators (49 tests) |
| Platform feature matrix | T197 | ✅ `docs/PLATFORM_FEATURES.md` |
| Platform-specific frontmatter | T198 | ✅ Per-platform overrides in frontmatter |
| Cursor tool restrictions | T199 | ✅ `allowedTools` support for commands |
| Platform parity tests | T201 | ✅ Frontmatter, tool restrictions, variables |
| Cursor hooks | T211 | ✅ `.cursor/hooks.json` generation |
| Claude Code settings.json | T202 | ✅ Permissions, env vars, hooks configuration |
| Plugin caching | T150 | ✅ `.ai-tool-sync/plugins/` with version-aware caching |

---

## Remaining Work - Execution Plan

### Wave 1: Foundation (No Dependencies on Remaining Tasks)

All Wave 1 tasks can be started immediately. Tasks within the same track should be worked sequentially to avoid merge conflicts. Different tracks can be worked in parallel.

#### Track A: Plugin Infrastructure (P2)

- [x] **T150** - Implement plugin caching in `.ai-tool-sync/plugins/`
  - Cache downloaded plugins from Git sources
  - Version-aware caching (semantic versioning, exact pins only)
  - Cache invalidation on version change
  - Support `${CLAUDE_PLUGIN_ROOT}` path resolution

- [x] **T155** - Add plugin.json manifest support to claude-plugin loader
  - Parse `.claude-plugin/plugin.json` manifest (required field: `name`)
  - Support optional fields: `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`
  - Support component paths: `commands`, `agents`, `hooks`, `mcpServers`
  - Resolve `${CLAUDE_PLUGIN_ROOT}` variable in paths

#### Track B: CLI Features (P2)

- [x] **T153** - Implement `--merge` command
  - Process `.ai/input/` files
  - Compare with existing content
  - Report differences

- [x] **T154** - Implement `--watch` flag
  - Watch for changes in `.ai/`
  - Auto-regenerate on change
  - Debounce rapid changes

#### Track C: Claude Code Platform (P1)

- [x] **T202** - Add Claude Code settings.json generation
  - Generate `.claude/settings.json` from config
  - Support permissions (allow/deny/ask) mapping
  - Support environment variables mapping
  - Support hooks configuration (combined from hook files and config.yaml)

- [x] **T204** - Add Claude Code commands support
  - Generate `.claude/commands/*.md` files
  - Support `$ARGUMENTS` variable syntax
  - Distinct from agents (commands are prompt templates)

- [x] **T205** - Add Claude Code agent tool restrictions
  - Add `claude.tools` frontmatter extension for personas → agents
  - Add `claude.model` for per-agent model override
  - Available tools: `Bash`, `Read`, `Grep`, `Edit`, etc.

#### Track D: Factory Platform (P1)

- [x] **T200** - Add Factory command variables support
  - Variables expand to everything typed after command name
  - Built-in: `$ARGUMENTS`, `$FACTORY_PROJECT_DIR` (in hooks)
  - Add `variables` to command schema

- [x] **T206** - Add Factory droids support
  - Map personas → droids with frontmatter: `name`, `description`, `model`, `tools`, `reasoningEffort`
  - Add `factory.tools` extension for tool restrictions
  - Add `factory.model` for per-droid model override
  - Add `factory.reasoningEffort` for reasoning control (`low`, `medium`, `high`)

- [ ] **T207** - Add Factory hooks support
  - Map our hooks to Factory hook events in `~/.factory/settings.json`
  - Events: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Notification`, `Stop`, etc.
  - Support `matcher` regex patterns for tool scoping

- [ ] **T208** - Add Factory MCP generation
  - Generate `.factory/mcp.json` from config MCP servers section
  - Support both `stdio` (command, args, env) and `http` (url, headers) types

- [ ] **T209** - Add Factory skills support
  - Map rules → skills in `.factory/skills/<skill-name>/SKILL.md`
  - Frontmatter: `name`, `description`, `allowed-tools` (reserved)
  - Support optional files: `references.md`, `schemas/`, `checklists.md`

---

### Wave 2: Depends on Wave 1

Start these after their dependencies from Wave 1 are complete.

#### Track A: Plugin System (continued)

- [x] **T151** - Implement plugin update mechanism
  - Detect outdated plugins via Git tags
  - Update to latest versions (no range support, exact pins)
  - Preserve local configuration
  - CLI: `ai-sync plugins update [name]`
  - **Deps: T150**

- [ ] **T156** - Add plugin hooks.json parsing
  - Parse `hooks/hooks.json` from Claude plugins
  - Support all events: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SubagentStop`, `SessionStart`, `SessionEnd`, `PreCompact`
  - Support `match` patterns for tool filtering (e.g., `"Bash(*rm*)"`, `"Write|Edit"`)
  - Support hook types: `command`, `validation`, `notification`
  - Transform to generic hook format
  - **Deps: T155**

- [ ] **T157** - Add plugin MCP server extraction
  - Parse `.mcp.json` from Claude plugins
  - Support stdio, HTTP, SSE transport types
  - Handle `${CLAUDE_PLUGIN_ROOT}` and env variable substitution
  - Merge with project MCP config
  - **Deps: T155**

- [ ] **T158** - Implement Git-based plugin loader
  - Support GitHub URLs: `github:owner/repo[@version]`
  - Support GitLab URLs: `gitlab:owner/repo[@version]`
  - Support full Git URLs: `git:https://...`
  - Clone/fetch to cache directory
  - Checkout specific tags for versioning
  - **Deps: T150**

#### Track C: Claude Code (continued)

- [ ] **T203** - Add Claude Code hooks support
  - Map our hooks to Claude Code's hook events (PreToolUse, PostToolUse, etc.)
  - Generate hooks config in settings.json
  - Support matcher patterns for tool scoping
  - **Deps: T202**

#### Track D: Factory (continued)

- [ ] **T210** - Write tests for Factory features
  - Test droids generation with tool restrictions
  - Test hooks configuration output
  - Test MCP config generation (stdio and http)
  - Test skills generation
  - **Deps: T206, T207, T208, T209**

---

### Wave 3: Depends on Wave 2

#### Track A: Plugin System (continued)

- [ ] **T159** - Add marketplace.yaml support
  - Define plugin sources in config:
    ```yaml
    plugins:
      - name: my-plugin
        source: github:anthropics/example-plugin@1.0.0
        enabled: true
        include: [rules, personas]
    ```
  - Auto-discovery of plugins from marketplace repos
  - **Deps: T158**

- [ ] **T161** - Write tests for plugin system
  - Test plugin.json parsing
  - Test hooks.json transformation
  - Test MCP extraction
  - Test Git-based loading
  - Test version caching
  - **Deps: T155, T156, T157, T158**

---

### Wave 4: Depends on Wave 3

#### Track A: Plugin System (final)

- [ ] **T160** - Add plugin CLI commands
  - `ai-sync plugins list` - List installed plugins
  - `ai-sync plugins add <source>` - Add plugin from Git URL
  - `ai-sync plugins remove <name>` - Remove plugin
  - `ai-sync plugins update [name]` - Update plugin(s)
  - **Deps: T158, T159**

-----

## Platform Research Reference

### Cursor (v1.7+)

| Feature | Format | Notes |
|---------|--------|-------|
| Commands | `.cursor/commands/*.md` | YAML frontmatter with `description`, `allowedTools`, `globs` |
| Hooks | `.cursor/hooks.json` | Events: `beforeSubmitPrompt`, `beforeShellExecution`, `beforeMCPExecution`, `beforeReadFile`, `afterFileEdit`, `stop` |
| MCP | `.cursor/mcp.json` | Standard MCP config |

### Claude Code (Dec 2025)

| Feature | Format | Notes |
|---------|--------|-------|
| Settings | `.claude/settings.json` | Permissions, env vars, hooks |
| Commands | `.claude/commands/*.md` | `$ARGUMENTS` variable support |
| Agents | `.claude/agents/*.md` | `name`, `description`, `model`, `tools` frontmatter |
| MCP | `.mcp.json` | Project-level MCP config |
| Hooks | In settings.json | `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, etc. |

### Factory (Dec 2025)

| Feature | Format | Notes |
|---------|--------|-------|
| Commands | `.factory/commands/*.md` | `$ARGUMENTS`, `$FACTORY_PROJECT_DIR` |
| Droids | `.factory/droids/*.md` | `name`, `description`, `model`, `tools`, `reasoningEffort` |
| Skills | `.factory/skills/*/SKILL.md` | Auto-invoked by context |
| MCP | `.factory/mcp.json` | `stdio` and `http` types |
| Hooks | In settings | Same events as Claude Code |

---

## Future Feature Ideas (Backlog)

1. Import/include syntax in rules - `@include shared/base-rules.md`
2. Conditional rules - `when: typescript_project == true`
3. Template variables - `{{project_name}}`, `{{date}}`, `{{version}}`
4. Persona inheritance - `extends: base-implementer`
5. Remote rule sources - Fetch rules from URLs during sync
6. Rule linting - Validate rules for common issues
7. Diff mode - `ai-sync --diff` to preview changes
8. Export/import - Share configs between projects
9. Template gallery - `ai-sync init --template react-typescript`
10. Multi-project support - Better monorepo handling

---

## Notes

1. **Test-First Approach**: Write tests alongside implementation
2. **Error Handling**: Use Result types throughout, only throw at CLI boundary
3. **Documentation**: Keep docs in sync with implementation
4. **Backwards Compatibility**: Design for extensibility from the start
