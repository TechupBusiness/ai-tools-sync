---
name: deploy
description: Deploy the application
execute: ./scripts/deploy.sh
args:
  - name: environment
    type: string
    default: staging
---

# Deploy Command

This command deploys the application to the specified environment.

