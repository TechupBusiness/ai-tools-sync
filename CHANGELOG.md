# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - YYYY-MM-DD
### Added
#### Core
- Add single source of truth for AI tool configurations (Cursor, Claude Code, Factory).
- Add generic format with snake_case frontmatter that auto-transforms to each tool's format.
- Add configurable config directory (`.ai-tool-sync` by default, `--config-dir`, `AI_TOOL_SYNC_DIR` env, or package.json override).
- Deliver language-agnostic design that works with any project type.

#### CLI Commands
- Add `ai-sync` — main sync command with `--dry-run`, `--verbose`, `--no-clean` modes.
- Add `ai-sync init` — initialize configuration with templates.
- Add `ai-sync validate` — validate configuration without generating outputs.
- Add `ai-sync migrate` — discover and migrate existing tool configs with `--backup`.
- Add `ai-sync merge` — process and integrate files from `input/` folder.
- Add `ai-sync clean` — remove generated files with safety checks and optional `--force`.
- Add `ai-sync status` — show status of generated files (unchanged, modified, missing).
- Add `ai-sync plugins list` — list installed plugins with `--json` output.
- Add `ai-sync plugins add` — add plugins from Git with version pinning.
- Add `ai-sync plugins remove` — remove plugins with optional `--keep-cache`.
- Add `ai-sync plugins update` — check and apply plugin updates with `--apply`.

#### Loaders
- Add `ai-tool-sync` built-in defaults loader (11 personas, 3 commands, 2 rules).
- Add `local` loader for monorepo shared content.
- Add `npm` loader with version constraints.
- Add `pip` loader for Python packages.
- Add `git` loader for GitHub, GitLab, and generic Git URLs with `@version`.
- Add `url` loader for remote sources.
- Add `claude-plugin` loader for Claude Code plugin format.
- Add plugin caching in `.ai-tool-sync/plugins/` with version-aware invalidation.

#### Content Authoring
- Add `@include` syntax for composing rules from shared markdown files.
- Add `extends:` persona inheritance with frontmatter merge and content concatenation.
- Add `{{#platform}}...{{/platform}}` conditional content blocks with AND/OR/NOT operators.
- Add `when:` conditional rule inclusion supporting npm, pip, go, cargo, composer, gem, pub, maven, gradle, nuget, file/dir existence checks, `pkg:` and `var:` value comparisons.
- Add glob-based rule triggering via `globs:` frontmatter.
- Add platform-specific frontmatter extensions (`cursor:`, `claude:`, `factory:`).
- Add rule dependencies via `requires:` field.
- Add rule categories and priorities for organization.

#### Generators
- Add Cursor generator for `.cursor/rules/*.mdc`, `.cursor/commands/roles/*.md`, `AGENTS.md`, `.cursor/hooks.json`.
- Add Claude Code generator for `.claude/skills/*/SKILL.md`, `.claude/agents/*.md`, `.claude/commands/*.md`, `CLAUDE.md`, `.claude/settings.json`.
- Add Factory generator for `.factory/skills/*/SKILL.md`, `.factory/droids/*.md`, `.factory/commands/*.md`, `AGENTS.md`, `.factory/mcp.json`.
- Add subfolder context generation for monorepos via `subfolder_contexts:` config.
- Add MCP configuration generation for all platforms.
- Add per-tool `.gitignore` files (`.cursor/.gitignore`, `.claude/.gitignore`, `.factory/.gitignore`).

#### Built-in Content
- Add 11 personas: architect, implementer, security-hacker, test-zealot, data-specialist, devops-specialist, hyper-critic, performance-optimizer, ux-psychologist, growth-hacker, coordinator.
- Add 3 commands: lint-fix, type-check, format.
- Add 2 rules: code-review, documentation.
- Add 1 hook: pre-commit-lint.

#### Infrastructure
- Add manifest v2 with SHA256 content hashes for change detection.
- Add watch mode (`--watch`) for auto-regeneration on file changes.
- Add generated files tracking via `.ai-tool-sync-generated.json`.
- Add automatic root `.gitignore` management for generated files.
- Add result types for comprehensive error handling.
- Add 900+ tests (unit, integration, E2E).

#### Migration from Existing Configs
- Run `ai-sync migrate --discovery-only` to see what will be migrated.
- Run `ai-sync migrate --backup` to migrate with safety backup.
- Review migrated files in `.ai-tool-sync/input/`.
- Run `ai-sync merge` to integrate them into your configuration.
- Run `ai-sync` to generate updated outputs.

[Unreleased]: https://github.com/anthropic/ai-tool-sync/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/anthropic/ai-tool-sync/releases/tag/v0.1.0
