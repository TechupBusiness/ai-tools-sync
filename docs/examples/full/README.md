# Full Configuration Example

This example demonstrates a comprehensive ai-tool-sync configuration suitable for enterprise projects.

## Files

- `config.yaml` - Full configuration with all features
- `_core.md` - Comprehensive project context
- `database.md` - Database-specific rules (activated by globs)

## Features Demonstrated

1. **All personas enabled** - Full suite of AI personas
2. **All commands enabled** - lint-fix, type-check, format
3. **Multiple targets** - Cursor, Claude, Factory
4. **Rule overrides** - Glob-based activation
5. **Hooks** - Safety checks for Claude Code
6. **Loader examples** - Comments showing npm and git loaders

## Usage

```bash
# Create .ai directory
mkdir -p your-project/.ai/rules

# Copy configuration
cp config.yaml your-project/.ai/config.yaml
cp _core.md your-project/.ai/rules/_core.md
cp database.md your-project/.ai/rules/database.md

# Generate configurations
cd your-project
ai-sync
```

## Generated Output

```
your-project/
├── .ai/
│   ├── config.yaml
│   └── rules/
│       ├── _core.md
│       └── database.md
│
├── .cursor/
│   ├── rules/
│   │   ├── _core.mdc
│   │   └── database.mdc
│   └── commands/
│       └── roles/
│           ├── architect.md
│           ├── implementer.md
│           └── ... (10 more)
│
├── .claude/
│   ├── skills/
│   │   ├── _core/SKILL.md
│   │   └── database/SKILL.md
│   ├── agents/
│   │   ├── architect.md
│   │   └── ... (10 more)
│   └── settings.json    # Contains hooks
│
├── .factory/
│   ├── skills/
│   │   ├── _core/SKILL.md
│   │   └── database/SKILL.md
│   ├── droids/
│   │   └── ... (10 droids)
│   └── commands/
│       └── ... (3 commands)
│
├── CLAUDE.md
└── AGENTS.md
```

## Rule Activation

- `_core.md` → Always loaded (core context)
- `database.md` → Loaded when editing `.sql` files or migration directories

## Hook Behavior (Claude Only)

- Production deployments show warning
- Destructive commands (rm -rf, drop) show warning
- Potential secrets operations show warning

