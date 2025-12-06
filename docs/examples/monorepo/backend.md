---
name: backend
description: Backend API development guidelines
version: 1.0.0

always_apply: false
globs:
  - "apps/api/**"
  - "packages/backend-*/**"
targets: [cursor, claude, factory]
priority: high
category: infrastructure
requires: [_core]
---

# Backend Development

## API Architecture

### Layers
1. **Routes** - HTTP endpoint definitions
2. **Controllers** - Request handling and validation
3. **Services** - Business logic
4. **Repositories** - Data access
5. **Models** - Data structures

### Directory Structure

```
apps/api/
├── src/
│   ├── routes/        # Route definitions
│   ├── controllers/   # Request handlers
│   ├── services/      # Business logic
│   ├── repositories/  # Data access
│   ├── models/        # Type definitions
│   ├── middleware/    # Express middleware
│   ├── utils/         # Helper functions
│   └── index.ts       # Entry point
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── prisma/
    └── schema.prisma
```

## API Design

### RESTful Conventions
- Use plural nouns for resources
- HTTP methods for actions (GET, POST, PUT, DELETE)
- Proper status codes (200, 201, 400, 401, 404, 500)
- Consistent error response format

### Request/Response Format

```typescript
// Success response
{
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}

// Error response
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  }
}
```

## Error Handling

### Custom Error Classes

```typescript
export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
  }
}

export class ValidationError extends AppError {
  constructor(details: ValidationDetail[]) {
    super('VALIDATION_ERROR', 'Validation failed', 400, details);
  }
}
```

### Error Middleware

```typescript
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      }
    });
  }

  // Log unexpected errors
  logger.error('Unexpected error', { error: err, requestId: req.id });

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    }
  });
});
```

## Authentication & Authorization

### JWT Flow
1. User logs in with credentials
2. Server validates and returns access + refresh tokens
3. Client sends access token in Authorization header
4. Server validates token on each request

### Authorization Patterns

```typescript
// Role-based
@Authorized(['admin', 'manager'])
async updateUser(userId: string, data: UpdateUserDto) { ... }

// Resource-based
@Authorized()
async getOrder(userId: string, orderId: string) {
  const order = await this.orderRepository.findById(orderId);
  if (order.userId !== userId && !user.isAdmin) {
    throw new ForbiddenError();
  }
  return order;
}
```

## Performance Guidelines

1. Database queries use indexes
2. N+1 queries are forbidden
3. Paginate all list endpoints
4. Cache frequently accessed data
5. Use connection pooling
6. Implement request timeouts

