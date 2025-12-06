---
name: _core
description: Core project context and architectural guidelines
version: 1.0.0

always_apply: true
targets: [cursor, claude, factory]
priority: high
category: core
---

# Enterprise Application

## Project Overview

This is an enterprise-grade web application with the following characteristics:

- **Architecture**: Monolithic backend with React frontend
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT-based with refresh tokens
- **Deployment**: Kubernetes on AWS

## Technology Stack

### Backend
- Node.js 20 LTS
- TypeScript 5.x (strict mode)
- Express.js with tRPC
- Prisma ORM
- PostgreSQL 15
- Redis for caching

### Frontend
- React 18
- TypeScript 5.x
- TanStack Query
- Tailwind CSS
- Vite

### Infrastructure
- Docker containers
- Kubernetes (EKS)
- Terraform for IaC
- GitHub Actions for CI/CD

## Architectural Principles

### 1. Clean Architecture
- Separate concerns into layers
- Dependencies point inward
- Business logic is framework-agnostic

### 2. Domain-Driven Design
- Rich domain models
- Ubiquitous language
- Bounded contexts

### 3. SOLID Principles
- Single Responsibility
- Open/Closed
- Liskov Substitution
- Interface Segregation
- Dependency Inversion

## Code Conventions

### TypeScript
- Use strict mode
- Prefer `interface` over `type` for object shapes
- Use `const` assertions where appropriate
- Avoid `any` - use `unknown` if type is truly unknown

### Naming
- PascalCase for types, interfaces, classes
- camelCase for functions, variables
- SCREAMING_SNAKE_CASE for constants
- kebab-case for file names

### Error Handling
- Use custom error classes
- Always include error context
- Log errors with correlation IDs
- Never swallow errors silently

## Development Guidelines

### Before Writing Code
1. Understand the requirements fully
2. Check for existing patterns to follow
3. Consider edge cases upfront
4. Plan for testability

### Code Review Checklist
- [ ] Types are correct and specific
- [ ] Error handling is comprehensive
- [ ] Tests cover happy path and edge cases
- [ ] Documentation is updated
- [ ] No security vulnerabilities
- [ ] Performance is acceptable

### Testing Requirements
- Unit test coverage: 80% minimum
- Integration tests for API endpoints
- E2E tests for critical user flows
- Performance tests for high-traffic endpoints

## Security Requirements

- All endpoints require authentication unless explicitly public
- Input validation on all user data
- SQL injection prevention via parameterized queries
- XSS prevention via output encoding
- CSRF protection on state-changing requests
- Rate limiting on public endpoints
- Audit logging for sensitive operations

## Performance Guidelines

- Database queries must use indexes
- N+1 queries are not allowed
- Cache frequently accessed data
- Lazy load components when possible
- Image optimization is required
- Bundle size monitoring in CI

