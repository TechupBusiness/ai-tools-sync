---
name: documentation
description: Standards for writing clear, maintainable documentation
version: 1.0.0
always_apply: false
globs:
  - "**/*.md"
  - "**/README*"
  - "**/CHANGELOG*"
  - "**/CONTRIBUTING*"
  - "**/docs/**"
targets:
  - cursor
  - claude
  - factory
category: documentation
priority: medium
---

# Documentation Standards

Guidelines for writing clear, useful, and maintainable documentation.

## Core Principles

### 1. Write for Your Audience

- **New Developers**: Need getting started guides, setup instructions
- **Experienced Users**: Need API references, advanced configurations
- **Contributors**: Need architecture docs, development guidelines
- **End Users**: Need user guides, tutorials, FAQs

### 2. Keep It Current

- Update docs when code changes
- Remove outdated information promptly
- Date-stamp time-sensitive content
- Review docs during code reviews

### 3. Make It Findable

- Use clear, descriptive titles
- Organize logically with good navigation
- Include a table of contents for long docs
- Cross-reference related documentation

## Documentation Types

### README Files

Every project should have a README that includes:

```markdown
# Project Name

Brief description of what this project does.

## Quick Start

Minimal steps to get running:

1. Install dependencies
2. Configure environment
3. Run the application

## Features

- Feature 1
- Feature 2
- Feature 3

## Documentation

Links to more detailed documentation.

## Contributing

How to contribute to this project.

## License

License information.
```

### API Documentation

For APIs, document:

- **Endpoint**: HTTP method and path
- **Description**: What the endpoint does
- **Parameters**: Required and optional parameters with types
- **Request Body**: Schema with examples
- **Response**: Success and error responses with examples
- **Authentication**: Required permissions or tokens

Example:

```markdown
## Create User

Creates a new user account.

**POST** `/api/users`

### Request Body

| Field    | Type   | Required | Description        |
|----------|--------|----------|--------------------|
| email    | string | Yes      | User email address |
| password | string | Yes      | Min 8 characters   |
| name     | string | No       | Display name       |

### Response

**201 Created**
```json
{
  "id": "usr_123",
  "email": "user@example.com",
  "name": "John Doe"
}
```

**400 Bad Request**
```json
{
  "error": "validation_error",
  "message": "Email already exists"
}
```
```

### Code Comments

**When to Comment:**
- Complex algorithms or business logic
- Non-obvious decisions with rationale
- Public APIs and interfaces
- Workarounds for bugs or limitations

**When NOT to Comment:**
- Self-explanatory code
- Restating what the code does
- Commented-out code (delete it)
- TODO comments without tracking

**Good Comments:**

```typescript
// Use binary search because the array is sorted and can have
// millions of items. Linear search was causing timeouts.
function findUser(users: User[], id: string): User | undefined {
  // ... binary search implementation
}

/**
 * Calculates the compound interest for a given principal.
 * 
 * @param principal - Initial investment amount
 * @param rate - Annual interest rate (as decimal, e.g., 0.05 for 5%)
 * @param years - Number of years to compound
 * @returns The total value after compounding
 * 
 * @example
 * calculateInterest(1000, 0.05, 10) // Returns 1628.89
 */
function calculateInterest(principal: number, rate: number, years: number): number {
  return principal * Math.pow(1 + rate, years);
}
```

### Architecture Documentation

For complex systems, document:

- **System Overview**: High-level architecture diagram
- **Components**: What each component does and why
- **Data Flow**: How data moves through the system
- **Decisions**: Key architectural decisions and rationale
- **Trade-offs**: What was sacrificed and why

## Formatting Guidelines

### Markdown Best Practices

- Use headings hierarchically (`#`, `##`, `###`)
- Keep line length reasonable (80-120 characters)
- Use code blocks with language hints for syntax highlighting
- Use tables for structured data
- Use lists for sequential steps or related items

### Code Examples

- Make examples self-contained and runnable
- Include expected output where helpful
- Show both successful and error cases
- Use realistic (but not real) data

```typescript
// ✅ Good example - complete and realistic
const user = await createUser({
  email: 'jane@example.com',
  password: 'securePassword123',
  name: 'Jane Smith'
});

console.log(user.id); // 'usr_abc123'

// ❌ Bad example - incomplete and unclear
const u = createUser(data);
```

## What NOT to Document

Avoid documenting these in permanent docs:

- **Volatile Metrics**: Test counts, coverage percentages, line counts
- **Temporary Workarounds**: Without issue tracker links
- **Internal Implementation Details**: That may change
- **Duplicate Information**: Available elsewhere
- **Obvious Information**: That code already explains

Instead:
- Let CI report current metrics
- Link to issue trackers for known issues
- Document interfaces, not implementations

## Review Checklist

Before publishing documentation:

- [ ] Accurate and up-to-date
- [ ] Free of spelling and grammar errors
- [ ] Code examples tested and working
- [ ] Links verified and working
- [ ] Appropriate for target audience
- [ ] Consistent with project style
- [ ] No sensitive information exposed

