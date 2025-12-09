# AI Tool Sync - Development Tasks

Based on the architecture defined in `plan.md`, this document tracks remaining tasks and summarizes completed work.

---

## Legend

- **Priority**: P0 (MVP), P1 (Important), P2 (Nice to have)
- **Status**: `[ ]` Todo, `[~]` In Progress, `[x]` Done
- **Wave**: Execution order (Wave 1 first, then Wave 2, etc.)

---

## Completed Work Summary ✅ (900+ tests passing)

| Category | Tasks | Description |
|----------|-------|-------------|
| **Phase 1: Foundation** | T001-T006 | Repository, TypeScript, build tooling, testing |
| **Phase 2: Infrastructure** | T010-T033 | JSON schemas, utilities, config system |
| **Phase 3: Parsers** | T040-T046 | Frontmatter, rule, persona, command, hook parsers |
| **Phase 4: Transformers** | T050-T054 | Tool/model mappers, frontmatter transforms, glob matching |
| **Phase 5: Loaders** | T060-T069 | Local, npm, pip, Claude plugin, URL, git loaders |
| **Phase 6: Generators** | T070-T078 | Cursor, Claude, Factory, subfolder context generators |
| **Phase 7: Target Mappings** | T080-T083 | cursor.yaml, claude.yaml, factory.yaml |
| **Phase 8: CLI Core** | T090-T096 | sync, init, validate commands |
| **Phase 9: Default Content** | T100-T116 | 11 personas, 3 commands, 1 hook, 2 rules |
| **Phase 10: Integration** | T120-T123 | Pipeline, config resolution, E2E snapshots |
| **Phase 11: Documentation** | T130-T135 | README, docs/, examples/ |
| **Phase 12: CI/CD** | T140-T143 | GitHub Actions workflows |
| **Phase 14: Code Quality** | T160-T171 | ESLint, TypeScript strict mode fixes |
| **Configurable Folder** | T180-T182 | `.ai-tool-sync` default, env/CLI/package.json override |
| **Migration Wizard** | T183-T187 | `ai-sync migrate` command |
| **Generated Files Tracking** | T188-T190 | Manifest + gitignore auto-update |
| **MCP Configuration** | T191-T196 | Parser + all generators |
| **Platform Docs** | T197 | `docs/PLATFORM_FEATURES.md` |
| **Platform Frontmatter** | T198 | Per-platform overrides in frontmatter |
| **Cursor Tool Restrictions** | T199 | `allowedTools` support for commands |
| **Command Variables** | T200 | `$ARGUMENTS`, `$FACTORY_PROJECT_DIR` |
| **Platform Parity Tests** | T201 | Frontmatter, tool restrictions, variables |
| **Claude Settings** | T202 | Permissions, env vars, hooks configuration |
| **Claude Hooks** | T203 | PreToolUse, PostToolUse events, matcher patterns |
| **Claude Commands** | T204 | `.claude/commands/*.md` with `$ARGUMENTS` |
| **Claude Agents** | T205 | `claude.tools`, `claude.model` frontmatter |
| **Factory Droids** | T206 | Personas → droids with tools, model, reasoningEffort |
| **Factory Hooks** | T207 | Factory hook events, matcher patterns |
| **Factory MCP** | T208 | `.factory/mcp.json` with stdio/http types |
| **Factory Skills** | T209 | Rules → skills in `.factory/skills/*/SKILL.md` |
| **Factory Tests** | T210 | Droids, hooks, MCP, skills generation |
| **Cursor Hooks** | T211 | `.cursor/hooks.json` generation |
| **Backward Compat Removal** | T212 | Legacy events, settings.json fallback, field mappings |
| **Plugin Caching** | T150 | `.ai-tool-sync/plugins/` with version-aware caching |
| **Plugin Update** | T151 | `ai-sync plugins update [name]` command |
| **CLI --merge** | T153 | Process `.ai/input/` files, compare, report |
| **CLI --watch** | T154 | Watch for changes, auto-regenerate, debounce |
| **Plugin Manifest** | T155 | `plugin.json` parsing with component paths |
| **Plugin Hooks Parsing** | T156 | All events, match patterns, hook types |
| **Plugin MCP Extraction** | T157 | Parse `.mcp.json`, variable substitution |
| **Git Plugin Loader** | T158 | GitHub/GitLab/Git URL support, tag versioning |
| **Plugin Configuration** | T159 | Marketplace-style plugin loading, include/exclude filtering |
| **Plugin CLI** | T160 | `ai-sync plugins list/add/remove/update` commands |
| **Plugin Tests** | T161 | Manifest, hooks, MCP, git loading coverage |
| **Manifest Hashes** | T220 | Per-run manifest with SHA256 content hashes |
| **Manifest Schema v2** | T221 | Strict version, hash pattern, directories |
| **Cleanup CLI** | T222 | `ai-sync clean`, `ai-sync status` commands |
| **Per-Tool Gitignores** | T223 | `.cursor/.gitignore`, `.claude/.gitignore`, `.factory/.gitignore` |
| **Root Gitignore Simplify** | T224 | Only root-level generated files |
| **Include Syntax** | T225 | `@include shared/base-rules.md` with circular detection |
| **Conditional Rules** | T226 | `when:` evaluation with deps, files, dirs, vars namespaces |
| **Persona Inheritance** | T227 | `extends:` with frontmatter merge, content concatenation |
| **Platform Conditionals** | T228 | `{{#claude}}...{{/claude}}` blocks with AND/OR/NOT operators |

---

## Remaining Work - Execution Plan

### Wave 1: Release & Distribution (P0 - Go-Live)

**Goal**: Publish `ai-tool-sync` to package managers and ensure comprehensive documentation for all programming language ecosystems.

#### Track A: Documentation Updates (P0)

- [x] **T240** - Update README.md with all latest features
  - Document `ai-sync clean` and `ai-sync status` commands
  - Document `ai-sync plugins list/add/remove/update` commands
  - Document `@include` syntax for rule composition
  - Document `extends:` persona inheritance
  - Document platform-conditional content blocks (`{{#claude}}...{{/claude}}`)
  - Document template variables (`{{project_name}}`, etc.)
  - Add badges: npm downloads, GitHub stars, test coverage
  - Add animated GIF/demo showing workflow
  - **Deps: All previous features ✅**

- [x] **T241** - Create CHANGELOG.md
  - Document all features from 0.1.0
  - Follow Keep a Changelog format
  - Include migration notes from tool-specific configs
  - **Deps: None**

- [x] **T242** - Create language-specific installation guides
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

- [x] **T243** - Prepare npm package for publishing
  - Verify `package.json` metadata (name, version, description, keywords)
  - Verify repository, bugs, homepage URLs point to real GitHub repo
  - Ensure `files` array includes all necessary files
  - Add `funding` field if applicable
  - Review `engines` field (Node.js version support)
  - **Deps: T240**

- [x] **T244** - Create GitHub Release workflow
  - Add `.github/workflows/release.yml`
  - Trigger on version tags (v*)
  - Automated npm publish with `NPM_TOKEN`
  - Generate GitHub release notes
  - Attach build artifacts (`npm pack` tarball)
  - `publish.yml` disabled to avoid double publish; manual input for dry-run
  - **Deps: T243**

- [ ] **T245** - First npm publish
  - Run full test suite: `npm test`
  - Build production artifacts: `npm run build`
  - Publish with `npm publish --access public`
  - Verify installation: `npm install -g YOUR_USERNAME/ai-tool-sync`
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

#### Track F: Codebase Quality (P0)

- [ ] **T254** - Resolve Prettier drift and enforce formatting
  - Run `npm run format` to fix existing style drift
  - Ensure `npm run format:check` passes locally and in CI
  - Document formatting command in contributor docs/README if missing
  - **Deps: None**

#### Track G: Windows Compatibility (P0)

- [x] **T255** - Fix Windows `npm test` `NODE_OPTIONS` usage
  - Added `scripts/run-tests.ts` wrapper that merges existing `NODE_OPTIONS` and ensures `--max-old-space-size=4096` before invoking Vitest via Node.
  - `package.json` `test` now runs the wrapper (`tsx scripts/run-tests.ts`); CI continues to call `npm test` across the matrix.
  - **Deps: None**

---

## Future Feature Ideas (Backlog)

### Wave 2: Template Variables

#### Track A: Variable Substitution (P2)

- [ ] **T229** - Implement template variable substitution
  - Syntax: `{{project_name}}`, `{{date}}`, `{{version}}`, `{{author}}`
  - Sources: package.json, git, config.yaml, environment
  - Implementation: Regex-based substitution, ~50 lines
  - **Deps: T228 ✅**

---

### Wave 3: Developer Experience

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

#### Track F: Generic Format Skills (P2)

- [ ] **T238** - Skill to convert platform files to generic format
  - Convert existing `.cursor/`, `.factory/`, `.claude/` files into generic format equivalents
  - Run existing parser validation (frontmatter + field checks) as a basic syntax gate; upgrade to lint flow once **T231** lands
  - **Deps: T231** for full lint; parser validation available now

- [ ] **T239** - Skill to generate new generic format files
  - Create new generic format files from scratch with platform-aware defaults
  - Use existing parser validation as baseline syntax check; add lint flow when **T231** rule linting is available
  - **Deps: T231** for lint; parser validation available now

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
