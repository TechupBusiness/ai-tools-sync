---
name: deploy
description: Deploy application to environment
version: 1.0.0
execute: scripts/deploy.sh
args:
  - name: environment
    type: string
    default: staging
    choices:
      - staging
      - production
  - name: force
    type: boolean
    default: false
targets:
  - cursor
  - claude
  - factory
---

# Deploy Command

Deploy the application to the specified environment.

## Usage

Run this command to deploy changes.

