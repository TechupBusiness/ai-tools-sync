---
name: database
description: Database rules for SQL and migrations
version: 1.0.0
always_apply: false
globs:
  - "**/*.sql"
  - "db/**/*"
targets:
  - cursor
  - claude
category: infrastructure
priority: high
---

# Database Rules

Always validate SQL migrations before applying.

## Guidelines

1. Use transactions for all schema changes
2. Include rollback migrations
3. Test on staging before production

