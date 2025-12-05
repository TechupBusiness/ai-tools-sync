---
name: typescript
description: TypeScript coding standards
version: 1.0.0
always_apply: false
globs:
  - "**/*.ts"
  - "**/*.tsx"
targets: [cursor, claude]
category: tooling
priority: high
---

# TypeScript Rules

## Strict Mode

Always enable strict mode in tsconfig.json.

## Type Annotations

- Prefer explicit type annotations for function parameters
- Use inference for local variables when obvious
- Always annotate function return types for public APIs

