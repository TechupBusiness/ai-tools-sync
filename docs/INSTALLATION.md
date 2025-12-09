# Installation Guide

ai-tool-sync is distributed as an npm package but works with **any** programming language or framework. The `.ai-tool-sync/` configuration folder is plain YAML and Markdown—no Node.js code runs inside your project.

## Quick Install

```bash
# Option 1: Global npm install (recommended for frequent use)
npm install -g @anthropic/ai-tool-sync

# Option 2: npx (no install required, runs latest version)
npx @anthropic/ai-tool-sync init

# Option 3: Docker (no Node.js required, image publishing in progress)
docker run -v $(pwd):/workspace ghcr.io/anthropic/ai-tool-sync init
```

> Homebrew support is planned (T246-T247). Docker image publishing is in progress (T248); use the Docker commands above once the image is available.

## Requirements

- Node.js 18+ for npm/npx usage
- OR Docker for containerized usage
- No runtime dependencies are added to your project

## Node.js / TypeScript / JavaScript

The native environment with multiple installation options.

### Global Install (Recommended)

```bash
npm install -g @anthropic/ai-tool-sync
```

### npx (One-Off)

```bash
npx @anthropic/ai-tool-sync init
```

### Project Dev Dependency

```bash
npm install --save-dev @anthropic/ai-tool-sync
# or
yarn add -D @anthropic/ai-tool-sync
# or
pnpm add -D @anthropic/ai-tool-sync
# or
bun add -d @anthropic/ai-tool-sync
```

### Docker (No Node.js Required)

```bash
docker run -v $(pwd):/workspace ghcr.io/anthropic/ai-tool-sync init
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

No Python package required—install via npm globally, use npx, or run via Docker.

### Installation

```bash
# Option 1: Global npm (if Node.js available)
npm install -g @anthropic/ai-tool-sync

# Option 2: npx (no install)
npx @anthropic/ai-tool-sync init

# Option 3: Docker (no Node.js required, image publishing in progress)
docker run -v $(pwd):/workspace ghcr.io/anthropic/ai-tool-sync init
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

No Composer package required—install via npm globally or use Docker.

### Installation

```bash
# Option 1: Global npm
npm install -g @anthropic/ai-tool-sync

# Option 2: Docker (image publishing in progress)
docker run -v $(pwd):/workspace ghcr.io/anthropic/ai-tool-sync init
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

No Go module required—install via npm globally or use Docker.

### Installation

```bash
npm install -g @anthropic/ai-tool-sync
# or
docker run -v $(pwd):/workspace ghcr.io/anthropic/ai-tool-sync init
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

No Cargo crate required—install via npm globally or use Docker.

### Installation

```bash
npm install -g @anthropic/ai-tool-sync
# or
docker run -v $(pwd):/workspace ghcr.io/anthropic/ai-tool-sync init
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

No gem required—install via npm globally or use Docker.

### Installation

```bash
npm install -g @anthropic/ai-tool-sync
# or
docker run -v $(pwd):/workspace ghcr.io/anthropic/ai-tool-sync init
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
    sh "npx @anthropic/ai-tool-sync"
  end
end
```

## Java / Kotlin

No Maven/Gradle plugin required—install via npm globally or use Docker.

### Installation

```bash
npm install -g @anthropic/ai-tool-sync
# or
docker run -v $(pwd):/workspace ghcr.io/anthropic/ai-tool-sync init
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

No NuGet package required—install via npm globally or use Docker.

### Installation

```bash
npm install -g @anthropic/ai-tool-sync
# or
docker run -v $(pwd):/workspace ghcr.io/anthropic/ai-tool-sync init
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

No pub package required—install via npm globally or use Docker.

### Installation

```bash
npm install -g @anthropic/ai-tool-sync
# or
docker run -v $(pwd):/workspace ghcr.io/anthropic/ai-tool-sync init
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

## Docker Usage

For teams that prefer not to install Node.js locally.

### Basic Commands

```bash
# Initialize
docker run -v $(pwd):/workspace ghcr.io/anthropic/ai-tool-sync init

# Sync
docker run -v $(pwd):/workspace ghcr.io/anthropic/ai-tool-sync

# Validate
docker run -v $(pwd):/workspace ghcr.io/anthropic/ai-tool-sync validate

# With options
docker run -v $(pwd):/workspace ghcr.io/anthropic/ai-tool-sync --dry-run --verbose
```

### Shell Alias

```bash
# Add to ~/.bashrc or ~/.zshrc
alias ai-sync='docker run -v $(pwd):/workspace ghcr.io/anthropic/ai-tool-sync'
```

Then use: `ai-sync init`, `ai-sync --dry-run`, etc.

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
      - run: npx @anthropic/ai-tool-sync validate
```

### GitLab CI

```yaml
ai-sync:
  image: node:20-alpine
  script:
    - npx @anthropic/ai-tool-sync validate
  rules:
    - changes:
        - .ai-tool-sync/**/*
```

### Pre-commit Hook

```bash
#!/bin/sh
# .git/hooks/pre-commit
npx @anthropic/ai-tool-sync validate || exit 1
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
npx @anthropic/ai-tool-sync --version

# Or find npm global bin directory
npm config get prefix
# Add <prefix>/bin to your PATH
```

### Permission errors on global install

```bash
# Option 1: Use npx (no global install needed)
npx @anthropic/ai-tool-sync init

# Option 2: Fix npm permissions
# See: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally
```
