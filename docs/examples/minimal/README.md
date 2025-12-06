# Minimal Example

This example shows the simplest possible ai-tool-sync configuration.

## Files

- `config.yaml` - Minimal configuration
- `_core.md` - Basic project context rule

## Usage

```bash
# Copy to your project
cp config.yaml /path/to/project/.ai/config.yaml
cp _core.md /path/to/project/.ai/rules/_core.md

# Generate configurations
cd /path/to/project
ai-sync
```

## What This Does

1. Enables the `implementer` persona from built-in defaults
2. Generates Cursor configuration only
3. Includes your `_core.md` rule as always-apply context

## Generated Output

```
.cursor/
├── rules/
│   └── _core.mdc
└── commands/
    └── roles/
        └── implementer.md
AGENTS.md
```

