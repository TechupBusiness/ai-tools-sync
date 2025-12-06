---
name: frontend
description: Frontend development guidelines
version: 1.0.0

always_apply: false
globs:
  - "apps/web/**"
  - "apps/mobile/**"
  - "packages/ui/**"
  - "**/*.tsx"
targets: [cursor, claude, factory]
priority: high
category: other
requires: [_core]
---

# Frontend Development

## Component Architecture

### Component Types
1. **UI Components** - Reusable, presentational (`packages/ui/`)
2. **Feature Components** - Business logic, app-specific
3. **Page Components** - Route-level containers
4. **Layout Components** - Structural wrappers

### File Structure

```
components/
├── Button/
│   ├── Button.tsx       # Component
│   ├── Button.test.tsx  # Tests
│   ├── Button.stories.tsx # Storybook
│   └── index.ts         # Barrel export
```

## React Best Practices

### Hooks
- Custom hooks for reusable logic
- Use `use` prefix for custom hooks
- Keep hooks pure and side-effect free where possible

```typescript
// Good: Focused hook
function useUserData(userId: string) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
  });
}

// Good: Composable hooks
function useAuth() {
  const user = useUserData(getCurrentUserId());
  const permissions = usePermissions(user?.roles);
  return { user, permissions, isAuthenticated: !!user };
}
```

### State Management
- Local state for component-specific data
- TanStack Query for server state
- Zustand for global client state
- URL state for shareable/bookmarkable state

### Memoization
- Use `useMemo` for expensive computations
- Use `useCallback` for callback props
- Don't prematurely optimize

## Styling with Tailwind

### Conventions
- Use utility classes for most styling
- Extract components for repeated patterns
- Use CSS variables for theme values
- Responsive-first approach

```tsx
// Good: Clear responsive design
<div className="flex flex-col md:flex-row gap-4 p-4 md:p-6">
  <aside className="w-full md:w-64 shrink-0">
    <Navigation />
  </aside>
  <main className="flex-1">
    {children}
  </main>
</div>
```

### Component Variants

```typescript
// Use cva for variant management
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-lg',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);
```

## Forms

### Form Library
- React Hook Form for form state
- Zod for validation schemas
- Controlled inputs for complex logic

```typescript
const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Minimum 8 characters'),
});

function LoginForm() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });

  const onSubmit = form.handleSubmit(async (data) => {
    await login(data);
  });

  return (
    <form onSubmit={onSubmit}>
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <Input {...field} type="email" placeholder="Email" />
        )}
      />
      {/* ... */}
    </form>
  );
}
```

## Accessibility

### Requirements
- All interactive elements are keyboard accessible
- Color contrast meets WCAG AA
- Form inputs have associated labels
- Images have alt text
- Focus states are visible

### Testing
- Use axe-core for automated testing
- Manual keyboard navigation testing
- Screen reader testing for critical flows

