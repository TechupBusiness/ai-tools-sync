# Monorepo Configuration Example

This example demonstrates how to configure ai-tool-sync for a monorepo with multiple packages, each with focused AI context.

## Files

- `config.yaml` - Main configuration with subfolder contexts
- `_core.md` - Root-level monorepo guidelines
- `backend.md` - Backend-specific rules
- `frontend.md` - Frontend-specific rules

## Key Features

### 1. Subfolder Contexts

Each package gets its own `CLAUDE.md` and `AGENTS.md`:

```yaml
subfolder_contexts:
  apps/api:
    rules: [_core, backend, database]
    personas: [implementer, data-specialist]
    
  apps/web:
    rules: [_core, frontend]
    personas: [implementer, ux-psychologist]
```

### 2. Glob-Based Rule Activation

Rules activate based on file paths:

```yaml
rules:
  backend:
    globs:
      - "apps/api/**"
      - "packages/backend-*/**"
      
  frontend:
    globs:
      - "apps/web/**"
      - "**/*.tsx"
```

### 3. Focused Persona Selection

Different packages get different personas:

- **API**: implementer, data-specialist, test-zealot
- **Web**: implementer, ux-psychologist
- **Infra**: devops-specialist, architect

## Generated Output

```
monorepo/
├── .ai/
│   ├── config.yaml
│   └── rules/
│       ├── _core.md
│       ├── backend.md
│       └── frontend.md
│
├── apps/
│   ├── api/
│   │   ├── CLAUDE.md      # Backend-focused context
│   │   └── AGENTS.md
│   └── web/
│       ├── CLAUDE.md      # Frontend-focused context
│       └── AGENTS.md
│
├── packages/
│   ├── ui/
│   │   ├── CLAUDE.md
│   │   └── AGENTS.md
│   └── shared/
│       ├── CLAUDE.md
│       └── AGENTS.md
│
├── infra/
│   ├── CLAUDE.md          # Infrastructure-focused context
│   └── AGENTS.md
│
├── .cursor/
│   ├── rules/
│   │   ├── _core.mdc
│   │   ├── backend.mdc
│   │   └── frontend.mdc
│   └── commands/roles/
│       └── ... (personas)
│
├── .claude/
│   ├── skills/
│   │   ├── _core/SKILL.md
│   │   ├── backend/SKILL.md
│   │   └── frontend/SKILL.md
│   └── agents/
│       └── ... (personas)
│
├── CLAUDE.md              # Root-level context
└── AGENTS.md
```

## Benefits

1. **Focused Context**: AI gets relevant rules based on where you're working
2. **Reduced Token Usage**: Only load applicable rules per package
3. **Team Optimization**: Different teams use different persona combinations
4. **Clear Boundaries**: Rules are scoped to their relevant domains

## Usage

```bash
# Copy example to your monorepo
cp -r . /path/to/monorepo/.ai/

# Generate all configurations
cd /path/to/monorepo
ai-sync

# AI tools now use focused context per package
# e.g., editing apps/api/ uses backend rules and data-specialist persona
```

