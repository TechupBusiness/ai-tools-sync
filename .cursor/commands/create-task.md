## Task: Create Implementation Specification

### Context Files (Read First)
- @.ai-flow/project.md - Project overview, architecture
- @.ai-flow/plan.md - Tasks, completed work
- @.ai-flow/learnings.md - Critical lessons from past implementations
- Optional if important for the current task: @.ai-flow/tasks/Txxx.md - Related task specs for pattern reference & details

### Your Job
Create a detailed implementation spec that enables a less-skilled AI to produce senior-level code without additional guidance.

### Output: `.ai-flow/tasks/Txxx.md`

Use this structure:

```md
# Txxx: [Task Title]

> **Priority**: P0/P1/P2 | **Wave**: X | **Track**: Y
> **Depends on**: Txxx, Txxx (or "None")
> **Estimated complexity**: Low/Medium/High

## 1. Objective
One paragraph: What this task achieves and why it matters.

## 2. Prior Art (IMPORTANT)
Reference existing implementations to copy patterns from:
- `src/path/to/similar.ts` - Copy X pattern from here
- `src/path/to/another.ts` - Use same error handling approach

## 3. File Structure
\`\`\`
src/
├── feature/
│   ├── index.ts          # Public exports only
│   ├── feature.ts        # Main implementation
│   ├── feature.types.ts  # Types/interfaces
│   └── feature.test.ts   # Tests (same patterns as T0xx)
\`\`\`

## 4. Interfaces & Types
Define ALL public interfaces. This is the contract:
\`\`\`typescript
// Only show non-obvious types, reference existing for common patterns
interface FeatureOptions {
  // Document each field's purpose
}
\`\`\`

## 5. Implementation Requirements

### 5.1 Must Follow (Project Patterns)
- [ ] Use `Result<T, E>` for errors (see `src/utils/result.ts`)
- [ ] Use `XxxError` class extending `BaseError`
- [ ] Export only from `index.ts`
- [ ] [Add project-specific patterns from learnings.md]

### 5.2 Critical Logic (Pitfall Prevention)
Only document non-obvious logic or where past mistakes occurred:
\`\`\`typescript
// ❌ WRONG - This caused bug in T0xx
const data = await fetch(url);

// ✅ CORRECT - Always wrap with timeout
const data = await withTimeout(fetch(url), 5000);
\`\`\`

### 5.3 Edge Cases to Handle
- [ ] Empty input → Return `Result.ok([])`
- [ ] Invalid format → Return `Result.err(ParseError)`
- [ ] [List all edge cases explicitly]

## 6. Test Requirements

### 6.1 Test File Structure
\`\`\`typescript
describe('FeatureName', () => {
  describe('happy path', () => { /* ... */ });
  describe('error handling', () => { /* ... */ });
  describe('edge cases', () => { /* ... */ });
});
\`\`\`

### 6.2 Required Test Cases
- [ ] Basic functionality with valid input
- [ ] Each error condition from 5.3
- [ ] Integration with dependent modules
- [ ] [Reference similar test file: `src/x/x.test.ts`]

## 7. Integration Points
- **Imports from**: `src/x/y.ts` (use `functionName`)
- **Exports to**: Will be used by Txxx
- **Config**: Add to `config.schema.ts` if needed

## 8. Acceptance Criteria
- [ ] Format check pass (`npm run format:check`, if not `npm run format`)
- [ ] All tests pass (`npm test -- feature.test.ts`)
- [ ] No lint errors (`npm run lint`)
- [ ] Types are strict (no `any`)
- [ ] Exports added to barrel file
- [ ] plan.md is updated

## 9. Out of Scope
- Feature X (handled in Txxx)
- Optimization Y (future task)

## 10. Guidelines for Writing Specs

DO Include:

- Exact interface definitions (the contract)
- References to existing code to copy patterns from
- Specific pitfalls from learnings.md relevant to this task
- Non-obvious logic with code snippets
- All edge cases as a checklist

DO NOT Include:

- Obvious boilerplate code
- Full function implementations (unless tricky)
- Explanations of basic TypeScript/patterns
- Code that follows established patterns without deviation
- Quality Check Before Saving
- Could a junior dev implement this without asking questions?
- Are all project patterns explicitly referenced?
- Are relevant lessons from learnings.md incorporated?
- Is every edge case listed?
- Are test cases specific enough to verify correctness?
