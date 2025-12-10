# Installation Guide

ai-tool-sync is distributed as an npm package but works with **any** programming language or framework. The `.ai-tool-sync/` configuration folder is plain YAML and Markdown—no Node.js code runs inside your project.

## Quick Install

```bash
# Option 1: Global npm install (recommended for frequent use)
npm install -g @techupbusiness/ai-tool-sync

# Option 2: npx (no install required, runs latest version)
npx @techupbusiness/ai-tool-sync init
```

> Homebrew support is planned (T246-T247). A Docker image is not published yet; use npm/npx or a local checkout in the meantime.

## Requirements

- Node.js 18+ for npm/npx usage
- No Docker image published yet (container support planned)
- No runtime dependencies are added to your project

## Using a local checkout (development)

If you're developing `ai-tool-sync` and want to use that build in other projects on your machine:

1. Install dependencies in this repo: `npm install`
2. Build once (or watch): `npm run build` (or `npm run build:watch`)
3. Use it elsewhere:
   - Option A: Global link  
     - In this repo: `npm link`  
     - In the target project: `npm link @techupbusiness/ai-tool-sync`
   - Option B: Install from the local path  
     - In the target project: `npm install /path/to/ai-tools-sync`
4. After code changes, re-run `npm run build` so the `dist/` output stays in sync (the CLI entry loads from `dist/`).

## Node.js / TypeScript / JavaScript

The native environment with multiple installation options.

### Global Install (Recommended)

```bash
npm install -g @techupbusiness/ai-tool-sync
```

### npx (One-Off)

```bash
npx @techupbusiness/ai-tool-sync init
```

### Project Dev Dependency

```bash
npm install --save-dev @techupbusiness/ai-tool-sync
# or
yarn add -D @techupbusiness/ai-tool-sync
# or
pnpm add -D @techupbusiness/ai-tool-sync
# or
bun add -d @techupbusiness/ai-tool-sync
```

### package.json Scripts

```json
{
  "scripts": {
    "ai-sync": "ai-sync",
    "ai-sync:watch": "ai-sync --watch",
    "postinstall": "ai-sync"
  }
}
```

### When Condition Example

```yaml
# .ai-tool-sync/rules/react.md
---
name: react
description: React app guidelines
when: npm:react
globs: ["src/**/*.{ts,tsx,js,jsx}"]
---
```

## Python

No Python package required—install via npm globally or use npx.

### Installation

```bash
# Option 1: Global npm (if Node.js available)
npm install -g @techupbusiness/ai-tool-sync

# Option 2: npx (no install)
npx @techupbusiness/ai-tool-sync init
```

### When Condition Example

```yaml
# .ai-tool-sync/rules/django.md
---
name: django
description: Django project guidelines
when: pip:django
globs: ["**/*.py", "**/templates/**/*.html"]
---
```

## PHP (Laravel, Symfony, WordPress, etc.)

No Composer package required—install via npm globally or use npx.

### Installation

```bash
# Option 1: Global npm
npm install -g @techupbusiness/ai-tool-sync

# Option 2: npx (no install)
npx @techupbusiness/ai-tool-sync init
```

### When Condition Example

```yaml
# .ai-tool-sync/rules/laravel.md
---
name: laravel
description: Laravel framework guidelines
when: composer:laravel/framework
globs: ["app/**/*.php", "routes/**/*.php"]
---
```

## Go

No Go module required—install via npm globally or use npx.

### Installation

```bash
npm install -g @techupbusiness/ai-tool-sync
# or npx
npx @techupbusiness/ai-tool-sync init
```

### When Condition Example

```yaml
# .ai-tool-sync/rules/gin.md
---
name: gin
description: Gin web framework guidelines
when: go:github.com/gin-gonic/gin
globs: ["**/*.go"]
---
```

## Rust

No Cargo crate required—install via npm globally or use npx.

### Installation

```bash
npm install -g @techupbusiness/ai-tool-sync
# or npx
npx @techupbusiness/ai-tool-sync init
```

### When Condition Example

```yaml
# .ai-tool-sync/rules/tokio.md
---
name: tokio
description: Tokio async runtime guidelines
when: cargo:tokio
globs: ["src/**/*.rs"]
---
```

## Ruby

No gem required—install via npm globally or use npx.

### Installation

```bash
npm install -g @techupbusiness/ai-tool-sync
# or npx
npx @techupbusiness/ai-tool-sync init
```

### When Condition Example

```yaml
# .ai-tool-sync/rules/rails.md
---
name: rails
description: Ruby on Rails guidelines
when: gem:rails
globs: ["app/**/*.rb", "config/**/*.rb"]
---
```

### Rake Task (Optional)

```ruby
# Rakefile
namespace :ai do
  desc "Sync AI tool configurations"
  task :sync do
    sh "npx @techupbusiness/ai-tool-sync"
  end
end
```

## Java / Kotlin

No Maven/Gradle plugin required—install via npm globally or use npx.

### Installation

```bash
npm install -g @techupbusiness/ai-tool-sync
# or npx
npx @techupbusiness/ai-tool-sync init
```

### When Condition Examples

```yaml
# .ai-tool-sync/rules/spring-boot.md
---
name: spring-boot
description: Spring Boot guidelines
when: maven:spring-boot-starter-web
globs: ["src/**/*.java", "src/**/*.kt"]
---
```

```yaml
# .ai-tool-sync/rules/kotlin.md
---
name: kotlin
when: gradle:org.jetbrains.kotlin:kotlin-stdlib
globs: ["**/*.kt"]
---
```

## .NET / C#

No NuGet package required—install via npm globally or use npx.

### Installation

```bash
npm install -g @techupbusiness/ai-tool-sync
# or npx
npx @techupbusiness/ai-tool-sync init
```

### When Condition Example

```yaml
# .ai-tool-sync/rules/aspnet.md
---
name: aspnet
description: ASP.NET Core guidelines
when: nuget:Microsoft.AspNetCore.App
globs: ["**/*.cs"]
---
```

## Dart / Flutter

No pub package required—install via npm globally or use npx.

### Installation

```bash
npm install -g @techupbusiness/ai-tool-sync
# or npx
npx @techupbusiness/ai-tool-sync init
```

### When Condition Example

```yaml
# .ai-tool-sync/rules/flutter.md
---
name: flutter
description: Flutter app guidelines
when: pub:flutter
globs: ["lib/**/*.dart"]
---
```

## CI/CD Integration

### GitHub Actions

```yaml
name: AI Tool Sync Validation
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx @techupbusiness/ai-tool-sync validate
```

### GitLab CI

```yaml
ai-sync:
  image: node:20-alpine
  script:
    - npx @techupbusiness/ai-tool-sync validate
  rules:
    - changes:
        - .ai-tool-sync/**/*
```

### Pre-commit Hook

```bash
#!/bin/sh
# .git/hooks/pre-commit
npx @techupbusiness/ai-tool-sync validate || exit 1
```

## Verifying Installation

```bash
# Check version
ai-sync --version

# Validate your configuration
ai-sync validate

# Preview what would be generated
ai-sync --dry-run --verbose

# Generate configurations
ai-sync
```

## Troubleshooting

### "command not found: ai-sync"

Global npm packages may not be in your PATH. Try:

```bash
# Use npx instead
npx @techupbusiness/ai-tool-sync --version

# Or find npm global bin directory
npm config get prefix
# Add <prefix>/bin to your PATH
```

### Permission errors on global install

```bash
# Option 1: Use npx (no global install needed)
npx @techupbusiness/ai-tool-sync init

# Option 2: Fix npm permissions
# See: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally
```
