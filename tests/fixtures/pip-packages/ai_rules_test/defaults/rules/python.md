---
name: python
description: Python coding standards
version: 1.0.0
always_apply: false
globs:
  - "**/*.py"
targets:
  - cursor
  - claude
category: core
priority: high
---

# Python Coding Standards

## Type Hints
- Use type hints for all function parameters and return values
- Prefer `Optional[X]` over `X | None` for Python 3.9 compatibility

## Docstrings
- Use Google style docstrings
- Document all public functions and classes

## Imports
- Use absolute imports
- Group imports: stdlib, third-party, local

