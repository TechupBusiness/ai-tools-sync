---
name: testing
description: Testing best practices
version: 1.0.0
always_apply: true
globs:
  - "**/*.test.ts"
  - "**/*.spec.ts"
targets:
  - cursor
  - claude
  - factory
category: testing
priority: medium
---

# Testing Rules

Ensure comprehensive test coverage.

## Guidelines

1. Write unit tests for all functions
2. Use meaningful test names
3. Mock external dependencies

