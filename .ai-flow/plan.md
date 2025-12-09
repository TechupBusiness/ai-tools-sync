# AI Tool Sync - Development Tasks

Based on the architecture defined in `plan.md`, this document tracks remaining tasks and summarizes completed work.

---

## Legend

- **Priority**: P0 (MVP), P1 (Important), P2 (Nice to have)
- **Status**: `[ ]` Todo, `[~]` In Progress, `[x]` Done
- **Wave**: Execution order (Wave 1 first, then Wave 2, etc.)

---

## Completed Work Summary ✅ (844+ tests passing)

### Core MVP (Phases 1-14)

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

### Post-MVP Features

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

### Plugin & Platform Features

| Feature | Tasks | Status |
|---------|-------|--------|
| Plugin caching | T150 | ✅ `.ai-tool-sync/plugins/` with version-aware caching |
| Plugin manifest support | T155 | ✅ `plugin.json` parsing with component paths |
| Plugin update mechanism | T151 | ✅ `ai-sync plugins update [name]` command |
| Plugin hooks.json parsing | T156 | ✅ All events, match patterns, hook types |
| Plugin MCP extraction | T157 | ✅ Parse `.mcp.json`, variable substitution |
| CLI --merge command | T153 | ✅ Process `.ai/input/` files, compare, report |
| CLI --watch flag | T154 | ✅ Watch for changes, auto-regenerate, debounce |

### Claude Code Platform

| Feature | Tasks | Status |
|---------|-------|--------|
| Settings.json generation | T202 | ✅ Permissions, env vars, hooks configuration |
| Commands support | T204 | ✅ `.claude/commands/*.md` with `$ARGUMENTS` |
| Agent tool restrictions | T205 | ✅ `claude.tools`, `claude.model` frontmatter |
| Hooks support | T203 | ✅ PreToolUse, PostToolUse events, matcher patterns |

### Factory Platform

| Feature | Tasks | Status |
|---------|-------|--------|
| Command variables | T200 | ✅ `$ARGUMENTS`, `$FACTORY_PROJECT_DIR` |
| Droids support | T206 | ✅ Personas → droids with tools, model, reasoningEffort |
| Hooks support | T207 | ✅ Factory hook events, matcher patterns |
| MCP generation | T208 | ✅ `.factory/mcp.json` with stdio/http types |
| Skills support | T209 | ✅ Rules → skills in `.factory/skills/*/SKILL.md` |
| Factory tests | T210 | ✅ Droids, hooks, MCP, skills generation |

### Pre-Release Cleanup

| Feature | Tasks | Status |
|---------|-------|--------|
| Remove backward compat | T212 | ✅ Legacy events, settings.json fallback, field mappings |

---

## Remaining Work - Execution Plan

### Wave 1: Plugin System Core (No Dependencies)

#### Track A: Plugin Infrastructure (P2)

- [x] **T158** - Implement Git-based plugin loader
  - Support GitHub URLs: `github:owner/repo[@version]`
  - Support GitLab URLs: `gitlab:owner/repo[@version]`
  - Support full Git URLs: `git:https://...`
  - Clone/fetch to cache directory
  - Checkout specific tags for versioning
  - Added plugin fixture + unit tests, lint/typecheck/test passing
  - **Deps: T150 ✅**

---

### Wave 2: Plugin System Extended (Depends on Wave 1)

#### Track A: Plugin Configuration (P2)

- [x] **T159** - Add marketplace-style plugin configuration support
  - Load `use.plugins` entries (git + local) via unified PluginLoader (git→claude-plugin)
  - Config version overrides source ref; include/exclude filtering; enabled=false returns empty
  - Respects plugin cache; cache invalidation on version mismatch; metadata surfaced
  - Tests added for local load, include/exclude, disabled, cached version override, invalid/missing sources
  - **Deps: T158**

- [x] **T161** - Write tests for plugin system
  - Test plugin.json parsing
  - Test hooks.json transformation
  - Test MCP extraction
  - Test Git-based loading
  - Test version caching
  - Added fixtures + unit/integration coverage for manifest, hooks, MCP
  - **Deps: T155 ✅, T156 ✅, T157 ✅, T158**

---

### Wave 3: Plugin CLI (Depends on Wave 2)

#### Track A: Plugin Management (P2)

- [x] **T160** - Add plugin CLI commands
  - `ai-sync plugins list` - List installed plugins
  - `ai-sync plugins add <source>` - Add plugin from Git URL
  - `ai-sync plugins remove <name>` - Remove plugin
  - `ai-sync plugins update [name]` - Update plugin(s)
  - **Deps: T158, T159**

---

## Future Feature Ideas (Backlog)

### Wave 4: Generated File Tracking & Cleanup (Depends on Wave 3)

**Current State**: Manifest v2 with hashes and history in place; cleanup/status consume hashed entries.

**Problem**: Completed with schema enforcement; no remaining gap for v2 format.

#### Track A: Manifest Infrastructure (P2)

- [x] **T220** - Implement per-run manifest with file hashes
  - Store manifest snapshots: `.ai-tool-sync/history/<timestamp>.json`
  - Contents: File paths + SHA256 content hashes at generation time
  - Cleanup workflow: compare current hash vs last-generated hash
  - If hash matches: safe to delete (unchanged since generation)
  - If hash differs: warn user, skip deletion (user edited the file)
  - **Deps: T188-T190 ✅**

- [x] **T221** - Implement manifest schema v2
  - JSON schema added for v2 with strict version, hash pattern, trailing-slash directories
  - Ajv validation; V1 parsing/formatting removed; read/write validate against schema
  - Tests updated for V2-only flows and edge cases (missing file, bad hash, bad version, directories)
  - **Deps: T220**

#### Track B: CLI Commands (P2)

- [x] **T222** - Add cleanup CLI commands
  - `ai-sync clean` - Remove generated files (with hash-based safety)
  - `ai-sync clean --force` - Remove even modified files (with warnings)
  - `ai-sync status` - Show which generated files have been modified
  - **Deps: T221**

---

### Wave 5: Distributed Gitignore Generation (Depends on Wave 4)

**Current State**: Single root `.gitignore` with auto-managed section containing all generated paths.

**Problem**: Users must look at root gitignore to understand what's generated. Tool-specific ignores are mixed together.

#### Track A: Per-Tool Gitignores (P2)

- [x] **T223** - Implement per-tool-folder gitignores
  - Generate `.cursor/.gitignore`, `.claude/.gitignore`, `.factory/.gitignore`
  - Each uses inline auto-managed section (preserves user additions)
  - Contents: Relative paths within that tool folder
  - Reuse existing `updateGitignore()` with target path parameter
  - **Deps: T188-T190 ✅**

- [x] **T224** - Simplify root gitignore
  - Only contains non-tool-folder files: `CLAUDE.md`, `AGENTS.md`, `mcp.json`
  - Contains manifest file: `.ai-tool-sync-generated`
  - NOT the tool folders (per-folder gitignores handle those)
  - No configuration flag; this is the default behavior post-T223
  - **Deps: T223**

---

### Wave 6: Content Composition (Depends on Wave 5)

#### Track A: Rule Composition (P2)

- [x] **T225** - Implement import/include syntax in rules
  - Syntax: `@include shared/base-rules.md`
  - Resolve relative paths from rule file location
  - Detect circular includes
  - **Deps: T040-T046 ✅**

- [x] **T226** - Implement conditional rules
  - Implemented namespaced `when:` evaluation (deps, files, dirs, vars)
  - Support basic operators: `==`, `!=`, `&&`, `||`
  - **Deps: T225**

#### Track B: Persona Composition (P2)

- [x] **T227** - Implement persona inheritance
  - Syntax: `extends: base-implementer`
  - Merge frontmatter fields (child overrides parent)
  - Concatenate content sections
  - **Deps: T040-T046 ✅**

---

### Wave 7: Platform-Conditional Content (Depends on Wave 6)

#### Track A: Conditional Blocks (P2)

- [x] **T228** - Implement platform-conditional inline content
  - Allow platform-specific blocks in markdown body
  - Custom Mustache-inspired syntax (no external dependency)
  - Syntax:
    ```
    {{#claude}}Claude-only content{{/claude}}
    {{#!cursor}}Excluded from Cursor{{/!cursor}}
    {{#claude|factory}}Either platform{{/claude|factory}}
    {{#claude&!cursor}}Claude but not Cursor{{/claude&!cursor}}
    ```
  - Operators: `|` (OR), `&` (AND), `!` (NOT/negation)
  - Implementation: Add `transformConditionalContent(content, target)` in `src/transformers/`
  - **Deps: T050-T054 ✅**

---

### Wave 8: Template Variables (Depends on Wave 7)

#### Track A: Variable Substitution (P2)

- [ ] **T229** - Implement template variable substitution
  - Syntax: `{{project_name}}`, `{{date}}`, `{{version}}`, `{{author}}`
  - Sources: package.json, git, config.yaml, environment
  - Implementation: Regex-based substitution, ~50 lines
  - **Deps: T228**

---

### Wave 9: Developer Experience (Depends on Wave 8)

#### Track A: Remote Content (P2)

- [ ] **T230** - Implement remote rule sources
  - Fetch rules from URLs during sync
  - Cache fetched content with TTL
  - Support authentication headers
  - **Deps: T060-T069 ✅**

#### Track B: Validation & Preview (P2)

- [ ] **T231** - Implement rule linting
  - Validate rules for common issues
  - Check frontmatter schema compliance
  - Warn on deprecated fields
  - **Deps: T090-T096 ✅**

- [ ] **T232** - Implement diff mode
  - `ai-sync --diff` to preview changes
  - Show unified diff output
  - Exit code indicates changes needed
  - **Deps: T090-T096 ✅**

#### Track C: Sharing & Templates (P2)

- [ ] **T233** - Implement export/import
  - Share configs between projects
  - Export to portable format
  - Import with conflict resolution
  - **Deps: T090-T096 ✅**

- [ ] **T234** - Implement template gallery
  - `ai-sync init --template react-typescript`
  - Fetch templates from remote registry
  - List available templates
  - **Deps: T233**

#### Track D: Monorepo Support (P2)

- [ ] **T235** - Implement multi-project support
  - Better monorepo handling
  - Shared config inheritance
  - Per-package overrides
  - **Deps: T120-T123 ✅**

#### Track E: Custom Variables (P2)

- [ ] **T236** - Implement custom variable providers
  - Static variables in config.yaml: `variables: { custom_key: "value" }`
  - Script-based resolution: `variables: { build_info: { command: "node scripts/build-info.js" } }`
  - Cache script results per-sync (not per-file) for performance
  - Timeout handling (default 5s) and graceful failure (preserve placeholder or use fallback)
  - Security: Only execute scripts from project root, no shell expansion
  - **Deps: T229**

- [ ] **T237** - Implement file content variables
  - Syntax: `{{file:path/to/file.txt}}` - inline file contents
  - Syntax: `{{file:path/to/file.txt:1-10}}` - specific line range
  - Complement to `@include` for inline snippets vs full file inclusion
  - Strip trailing newlines, respect max length limit
  - **Deps: T236**

---

### Wave 10: Release & Distribution (P0 - Go-Live)

**Goal**: Publish `ai-tool-sync` to package managers and ensure comprehensive documentation for all programming language ecosystems.

#### Track A: Documentation Updates (P0)

- [ ] **T240** - Update README.md with all latest features
  - Document `ai-sync clean` and `ai-sync status` commands
  - Document `ai-sync plugins list/add/remove/update` commands
  - Document `@include` syntax for rule composition
  - Document `extends:` persona inheritance
  - Document platform-conditional content blocks (`{{#claude}}...{{/claude}}`)
  - Document template variables (`{{project_name}}`, etc.)
  - Add badges: npm downloads, GitHub stars, test coverage
  - Add animated GIF/demo showing workflow
  - **Deps: All previous features ✅**

- [ ] **T241** - Create CHANGELOG.md
  - Document all features from 0.1.0
  - Follow Keep a Changelog format
  - Include migration notes from tool-specific configs
  - **Deps: None**

- [ ] **T242** - Create language-specific installation guides
  - **Node.js/TypeScript**: npm/yarn/pnpm/bun installation
  - **Python**: `npx ai-tool-sync` (via npm) or Docker
  - **PHP**: Same approach - npm global or Docker (works with Laravel, Symfony, etc.)
  - **Go**: Instructions to install via npm globally or use Docker
  - **Rust**: Same as Go, npm global or Docker
  - **Ruby**: Same approach with bundler exec workaround
  - **Java/Kotlin**: Same approach, recommend global npm install
  - Add to `docs/INSTALLATION.md` with language tabs/sections
  - **Deps: T240**

#### Track B: npm Publishing (P0)

- [ ] **T243** - Prepare npm package for publishing
  - Verify `package.json` metadata (name, version, description, keywords)
  - Verify repository, bugs, homepage URLs point to real GitHub repo
  - Ensure `files` array includes all necessary files
  - Add `funding` field if applicable
  - Review `engines` field (Node.js version support)
  - **Deps: T240**

- [ ] **T244** - Create GitHub Release workflow
  - Add `.github/workflows/release.yml`
  - Trigger on version tags (v*)
  - Automated npm publish with `NPM_TOKEN`
  - Generate GitHub release notes
  - Attach build artifacts if applicable
  - **Deps: T243**

- [ ] **T245** - First npm publish
  - Run full test suite: `npm test`
  - Build production artifacts: `npm run build`
  - Publish with `npm publish --access public`
  - Verify installation: `npm install -g @anthropic/ai-tool-sync`
  - Test CLI commands on fresh install
  - **Deps: T244**

#### Track C: Homebrew Distribution (P1)

- [ ] **T246** - Create Homebrew formula
  - Create `Formula/ai-tool-sync.rb` for homebrew-core or custom tap
  - Define bottle configurations for macOS (arm64, x86_64)
  - Include Linux support if possible
  - Test formula locally: `brew install --build-from-source ./Formula/ai-tool-sync.rb`
  - **Deps: T245**

- [ ] **T247** - Set up Homebrew tap (optional, if not in homebrew-core)
  - Create `homebrew-ai-tool-sync` repository
  - Add auto-release workflow to update formula on npm publish
  - Document `brew tap YOUR_USERNAME/ai-tool-sync && brew install ai-tool-sync`
  - **Deps: T246**

#### Track D: Cross-Platform Wrappers (P2)

- [ ] **T248** - Create Docker image
  - Multi-stage Dockerfile for minimal image size
  - Include Node.js runtime and ai-tool-sync
  - Publish to Docker Hub: `YOUR_USERNAME/ai-tool-sync`
  - Publish to GitHub Container Registry: `ghcr.io/YOUR_USERNAME/ai-tool-sync`
  - Document usage: `docker run -v $(pwd):/app YOUR_USERNAME/ai-tool-sync sync`
  - **Deps: T245**

- [ ] **T249** - Create npx-compatible standalone
  - Verify `npx YOUR_PACKAGE_NAME` works without global install
  - Ensure fast startup time
  - Document in README for one-off usage
  - **Deps: T245**

- [ ] **T250** - Create installation script
  - `curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/ai-tool-sync/main/install.sh | bash`
  - Auto-detect OS and package manager
  - Fallback to npm if no better option
  - Verify Node.js installed or prompt to install
  - **Deps: T245**

#### Track E: Community & Ecosystem (P2)

- [ ] **T251** - Create example repositories
  - `ai-tool-sync-examples/react-typescript` - React app with TypeScript
  - `ai-tool-sync-examples/python-django` - Django project
  - `ai-tool-sync-examples/php-laravel` - Laravel PHP project
  - `ai-tool-sync-examples/go-api` - Go REST API
  - `ai-tool-sync-examples/rust-cli` - Rust CLI application
  - Each includes `.ai-tool-sync/` config and demonstrates features
  - **Deps: T245**

- [ ] **T252** - Add to Awesome lists and package registries
  - Submit to awesome-ai-coding-tools
  - Add to npm categories
  - Write announcement blog post
  - Create Twitter/X thread
  - Post on Hacker News
  - **Deps: T245**

- [ ] **T253** - Create publishing guide document
  - Create `docs/PUBLISHING.md` with step-by-step instructions
  - npm account setup and authentication
  - GitHub Actions workflow setup
  - Homebrew formula creation
  - Docker image publishing
  - Version bumping and release workflow
  - Pre-release checklist
  - **Deps: T244**

---

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

## Notes

1. **Test-First Approach**: Write tests alongside implementation
2. **Error Handling**: Use Result types throughout, only throw at CLI boundary
3. **Documentation**: Keep docs in sync with implementation
4. **Backwards Compatibility**: Design for extensibility from the start

---

## Publishing Instructions Reference

### Prerequisites

1. **npm Account**: Create account at https://www.npmjs.com/signup
2. **npm Organization**: Either use personal scope or create org at https://www.npmjs.com/org/create
3. **GitHub Repository**: Ensure repo is public and URLs in package.json are correct
4. **2FA**: Enable 2FA on npm account (required for publishing to public packages)

### Step-by-Step: npm Publishing

> **Note**: Replace `YOUR_PACKAGE_NAME` with your actual package name.
> - Scoped: `@your-org/ai-tool-sync` (requires npm org)
> - Unscoped: `ai-tool-sync` (simpler, if name is available)

```bash
# 1. Verify you're logged into npm
npm whoami
# If not logged in:
npm login

# 2. Update package.json with YOUR namespace/name
# - Change "name" field to your package name
# - Update repository, homepage, bugs URLs to your GitHub repo

# 3. Verify package.json metadata
cat package.json | jq '{name, version, description, repository, homepage}'

# 4. Run full test suite
npm test

# 5. Build production artifacts
npm run build

# 6. Check what files will be published
npm pack --dry-run

# 7. Publish (first time - creates package)
# For scoped packages (@your-org/...):
npm publish --access public
# For unscoped packages:
npm publish

# 8. Verify the published package
npm view YOUR_PACKAGE_NAME

# 9. Test installation
npm install -g YOUR_PACKAGE_NAME
ai-sync --version
```

### Version Bumping

```bash
# Patch release (0.1.0 → 0.1.1) - bug fixes
npm version patch

# Minor release (0.1.0 → 0.2.0) - new features, backward compatible
npm version minor

# Major release (0.1.0 → 1.0.0) - breaking changes
npm version major

# After version bump, push with tags
git push origin main --tags
```

### Setting Up GitHub Actions for Auto-Publish

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      
      - run: npm ci
      - run: npm test
      - run: npm run build
      
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
```

**Setup required secrets:**
1. Go to npm → Access Tokens → Generate New Token (Automation)
2. Go to GitHub repo → Settings → Secrets → Actions → New secret
3. Name: `NPM_TOKEN`, Value: your npm token

### Homebrew Formula (After npm Publish)

Create `Formula/ai-tool-sync.rb`:

```ruby
class AiToolSync < Formula
  desc "Unified AI tool configuration - single source of truth for Cursor, Claude Code, Factory"
  homepage "https://github.com/YOUR_USERNAME/ai-tool-sync"
  # Update URL to your published npm package
  url "https://registry.npmjs.org/YOUR_PACKAGE_NAME/-/ai-tool-sync-VERSION.tgz"
  sha256 "CHECKSUM_HERE"  # Get with: curl -sL URL | shasum -a 256
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    system "#{bin}/ai-sync", "--version"
  end
end
```

To get the checksum (after publishing):
```bash
# For scoped package:
curl -sL "https://registry.npmjs.org/@your-org/ai-tool-sync/-/ai-tool-sync-0.1.0.tgz" | shasum -a 256

# For unscoped package:
curl -sL "https://registry.npmjs.org/ai-tool-sync/-/ai-tool-sync-0.1.0.tgz" | shasum -a 256
```

### Docker Image Publishing

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY bin ./bin
COPY defaults ./defaults
COPY targets ./targets

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app ./
RUN npm link
WORKDIR /workspace
ENTRYPOINT ["ai-sync"]
CMD ["--help"]
```

Build and publish (replace `YOUR_USERNAME` with your Docker Hub/GitHub username):
```bash
# Build
docker build -t YOUR_USERNAME/ai-tool-sync:0.1.0 -t YOUR_USERNAME/ai-tool-sync:latest .

# Test
docker run -v $(pwd):/workspace YOUR_USERNAME/ai-tool-sync sync --dry-run

# Publish to Docker Hub
docker login
docker push YOUR_USERNAME/ai-tool-sync:0.1.0
docker push YOUR_USERNAME/ai-tool-sync:latest

# Publish to GitHub Container Registry
docker login ghcr.io -u YOUR_USERNAME -p GITHUB_TOKEN
docker tag YOUR_USERNAME/ai-tool-sync:0.1.0 ghcr.io/YOUR_USERNAME/ai-tool-sync:0.1.0
docker push ghcr.io/YOUR_USERNAME/ai-tool-sync:0.1.0
```

### Language-Specific Installation Commands

Add these to README and docs (replace `YOUR_PACKAGE_NAME` and `YOUR_USERNAME`):

**Node.js / JavaScript / TypeScript:**
```bash
npm install -g YOUR_PACKAGE_NAME
# or without installing:
npx YOUR_PACKAGE_NAME init
```

**Python / PHP / Ruby:**
```bash
# Option 1: Global npm (recommended)
npm install -g YOUR_PACKAGE_NAME

# Option 2: npx (no install required)
npx YOUR_PACKAGE_NAME init

# Option 3: Docker
docker run -v $(pwd):/workspace YOUR_USERNAME/ai-tool-sync init
```

**Go / Rust / Java / Kotlin / C# / Other:**
```bash
# Global npm install
npm install -g YOUR_PACKAGE_NAME

# Or use npx for one-off usage
npx YOUR_PACKAGE_NAME init

# Or Docker for isolated environment
docker run -v $(pwd):/workspace YOUR_USERNAME/ai-tool-sync init
```

**macOS (Homebrew):**
```bash
brew tap YOUR_USERNAME/ai-tool-sync
brew install ai-tool-sync
```

### Pre-Release Checklist

- [ ] All tests passing (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Version number updated in `package.json`
- [ ] CHANGELOG.md updated
- [ ] README.md up to date with all features
- [ ] Repository URLs correct in package.json
- [ ] License file present
- [ ] .npmignore or `files` in package.json configured
- [ ] Keywords relevant and complete
- [ ] `npm pack --dry-run` shows expected files
- [ ] Local test: `npm link && ai-sync --version`
