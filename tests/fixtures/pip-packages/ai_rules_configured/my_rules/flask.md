---
name: flask
description: Flask microframework standards
version: 1.0.0
always_apply: false
globs:
  - "**/app.py"
  - "**/routes/**/*.py"
targets:
  - cursor
  - claude
category: infrastructure
priority: medium
---

# Flask Standards

## Application Structure
- Use application factory pattern
- Organize blueprints by feature

## Extensions
- Use Flask-SQLAlchemy for database
- Use Flask-Login for authentication

