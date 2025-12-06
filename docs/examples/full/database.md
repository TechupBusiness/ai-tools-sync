---
name: database
description: Database schema, migrations, and query guidelines
version: 1.0.0

always_apply: false
globs:
  - "**/*.sql"
  - "**/migrations/**"
  - "**/prisma/**"
  - "**/supabase/**"
targets: [cursor, claude, factory]
priority: high
category: infrastructure
requires: [_core]
---

# Database Guidelines

## Schema Design

### Tables
- Use plural names (e.g., `users`, `orders`)
- Primary keys are always `id` (UUID by default)
- Include `created_at` and `updated_at` timestamps
- Use soft deletes (`deleted_at`) for recoverable data

### Columns
- Use snake_case naming
- Foreign keys end with `_id`
- Boolean columns start with `is_` or `has_`
- JSON columns end with `_data` or `_metadata`

### Example Schema

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
```

## Migrations

### Rules
1. Migrations must be reversible (up and down)
2. Never modify existing migrations
3. Test migrations on a copy of production data
4. Keep migrations atomic and focused

### Naming Convention
```
YYYYMMDDHHMMSS_description.sql
20240101120000_create_users_table.sql
20240101120001_add_email_index.sql
```

## Prisma Specifics

### Schema Organization
- One model per logical entity
- Use `@map` for snake_case column names
- Define indexes explicitly
- Document with `///` comments

### Example Model

```prisma
/// User account information
model User {
  id          String   @id @default(uuid())
  email       String   @unique
  passwordHash String  @map("password_hash")
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")

  orders Order[]

  @@map("users")
  @@index([email])
}
```

## Query Guidelines

### Performance
- Always use indexes for filtered columns
- Avoid `SELECT *` - specify columns
- Use pagination for large result sets
- Prefer `EXISTS` over `COUNT` for existence checks

### Security
- Never concatenate user input into queries
- Use parameterized queries always
- Validate inputs before querying
- Use row-level security where appropriate

### Example Safe Query

```typescript
// Good: Parameterized query
const user = await prisma.user.findFirst({
  where: { 
    email: userInput,
    deletedAt: null 
  },
  select: {
    id: true,
    email: true,
    isActive: true
  }
});

// Bad: String concatenation (SQL injection risk!)
// const user = await prisma.$queryRaw`SELECT * FROM users WHERE email = '${userInput}'`
```

## Row-Level Security (RLS)

For multi-tenant applications:

```sql
-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Policy for users to see only their orders
CREATE POLICY user_orders ON orders
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid());
```

