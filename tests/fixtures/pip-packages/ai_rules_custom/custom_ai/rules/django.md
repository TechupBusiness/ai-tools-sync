---
name: django
description: Django web framework standards
version: 1.0.0
always_apply: false
globs:
  - "**/views.py"
  - "**/models.py"
  - "**/urls.py"
targets:
  - cursor
  - claude
  - factory
category: infrastructure
priority: high
---

# Django Standards

## Models
- Use verbose_name on all fields
- Always define __str__ method
- Use django-model-utils for common patterns

## Views
- Prefer class-based views for complex logic
- Use function-based views for simple endpoints

