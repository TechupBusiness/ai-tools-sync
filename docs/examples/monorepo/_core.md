---
name: _core
description: Monorepo-wide context and guidelines
version: 1.0.0

always_apply: true
targets: [cursor, claude, factory]
priority: high
category: core
---

# Monorepo Project

## Repository Structure

```
monorepo/
├── apps/
│   ├── api/           # Backend API service
│   ├── web/           # Web frontend
│   └── mobile/        # React Native mobile app
│
├── packages/
│   ├── ui/            # Shared UI components
│   ├── shared/        # Shared utilities and types
│   └── config/        # Shared configuration
│
├── infra/
│   ├── terraform/     # Infrastructure as code
│   └── k8s/           # Kubernetes manifests
│
└── tools/
    └── scripts/       # Build and deployment scripts
```

## Technology Stack

### Languages
- TypeScript 5.x (strict mode everywhere)
- Node.js 20 LTS

### Package Management
- pnpm workspaces
- Turborepo for build orchestration

### Core Frameworks
- Backend: Express + tRPC
- Web: React 18 + Vite
- Mobile: React Native (Expo)

### Database
- PostgreSQL 15
- Prisma ORM

## Cross-Package Guidelines

### Dependencies
1. Use workspace protocol (`workspace:*`) for internal packages
2. Hoist common dev dependencies to root
3. Pin versions for critical dependencies
4. Audit dependencies regularly

### Imports
- Use package names for cross-package imports
- Never use relative paths across package boundaries
- Prefer barrel exports from packages

```typescript
// Good
import { Button } from '@repo/ui';
import { formatDate } from '@repo/shared';

// Bad
import { Button } from '../../packages/ui/src/Button';
```

### TypeScript
- All packages use the same tsconfig base
- Strict mode is non-negotiable
- Path aliases defined at package level

### Testing
- Jest for unit tests
- Playwright for E2E tests
- Test utilities in @repo/shared/testing
- CI runs tests for affected packages only

## Versioning and Releases

- Semantic versioning for all packages
- Changesets for version management
- Main branch is always deployable
- Feature branches for development

## CI/CD Pipeline

1. PR checks run on affected packages
2. Main branch triggers staging deployment
3. Release tags trigger production deployment
4. Canary releases for testing

