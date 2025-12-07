# Lessons Learned

> Patterns and insights to prevent rework in future tasks.
> Format: `[Txxx] 🔴|🟡|🟢 **Category**: Problem → Solution`

---

## Architecture & Patterns

<!-- Architecture & Patterns lessons learned -->

## Code Quality

- [T002] 🟢 **Imports**: Relative paths broke on restructure → Use `@/` path aliases from start
- [T004] 🟡 **Types**: `any` usage hid bugs → Prefer `unknown` + type guards
- [T205] 🟡 **Lint hygiene**: Updated tests left unused `result` vars and triggered `no-unused-vars` → Drop the assignment or prefix with `_result` whenever adding snapshots/tests; rerun `npm run lint`
- [T154] 🟡 **Watch tests & mocks**: Vitest hoisted mocks and fake timers caused worker stack overflows and missing callbacks → Use `vi.hoisted` for shared spies, avoid mocking full `fs` (mock only `watch`), and prefer real timers with small delays for `fs.watch`-driven flows

## Tooling & Config

- [T001] 🟢 **Linting**: ESLint errors after commit → Run `npm run lint` before completing task
- [T005] 🟡 **Testing**: Tests fail inside sandboxed shells (e.g., `vite test`, `npm test`) → Run test commands without sandbox

## Project-Specific

<!-- Domain knowledge, business logic gotchas, external API quirks -->

---

*Last updated: 2025-12-08*
