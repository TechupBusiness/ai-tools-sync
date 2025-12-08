# Lessons Learned

> Patterns and insights to prevent rework in future tasks.
> Format: `[Txxx] 🔴|🟡|🟢 **Category**: Problem → Solution`

---

## Architecture & Patterns

- [T209] 🟢 **Existing interfaces**: Check `src/parsers/types.ts` for existing extension interfaces before creating new ones → `FactoryExtension` already had `allowed-tools` and `tools` fields; avoided duplicate type definitions

## Code Quality

- [T002] 🟢 **Imports**: Relative paths broke on restructure → Use `@/` path aliases from start
- [T004] 🟡 **Types**: `any` usage hid bugs → Prefer `unknown` + type guards
- [T205] 🟡 **Lint hygiene**: Updated tests left unused `result` vars and triggered `no-unused-vars` → Drop the assignment or prefix with `_result` whenever adding snapshots/tests; rerun `npm run lint`
- [T206] 🟢 **Import order**: Added new imports and tripped `import/order` → Insert new imports respecting group order or run `eslint --fix` after adding imports
- [T154] 🟡 **Watch tests & mocks**: Vitest hoisted mocks and fake timers caused worker stack overflows and missing callbacks → Use `vi.hoisted` for shared spies, avoid mocking full `fs` (mock only `watch`), and prefer real timers with small delays for `fs.watch`-driven flows
- [T156] 🟡 **Types**: Expanded hook `action` union in loader but forgot generator union → Keep action/type/timeout unions aligned across parser/loader/generator before typecheck; rerun `npm run typecheck`
- [T159] 🟡 **Exact optional props**: `exactOptionalPropertyTypes` rejects `undefined` in Result payloads and options objects → When passing optional fields through wrappers (cache metadata, loader options), strip or conditionally include keys and return non-optional types (e.g., `NonNullable<T>`) for metadata helpers before assigning.
- [T161] 🟡 **Manifest precedence**: Loader manifest search order matters (`.claude-plugin/plugin.json` should win over root `plugin.json`) → Explicitly order possible manifest paths by priority and add tests that assert the chosen metadata matches the preferred location.

## Tooling & Config

- [T001] 🟢 **Linting**: ESLint errors after commit → Run `npm run lint` before completing task
- [T005] 🟡 **Testing**: Tests fail inside sandboxed shells (e.g., `vite test`, `npm test`) → Run test commands without sandbox
- [T210] 🟡 **Sandbox tooling**: `pnpm lint`/tests hit `EPERM` on `node_modules` and temp dirs when sandboxed → Re-run typecheck/lint/tests outside sandbox or with broader permissions before concluding review
- [T210] 🟢 **Spec vs impl gap**: Factory hooks not implemented yet; keep new hook tests `it.skip` with a TODO to the task so CI stays green until the feature lands
- [T157] 🟡 **Vitest cache permissions**: Vitest writes to `node_modules/.vite/vitest/results.json`; sandboxed runs can throw `EPERM` even when tests pass → rerun with broader permissions (`required_permissions: ['all']`) or outside sandbox before trusting results
- [T158] 🟡 **Use lint --fix option**: Whenever there are automatically fixable lint errors → Use `npm run lint --fix`
- [T160] 🟡 **Exact optional props with loader options**: `exactOptionalPropertyTypes` rejects passing `undefined` through spreaded options; include optional keys only when defined (e.g., `...(timeoutMs !== undefined ? { timeout: timeoutMs } : {})`) to satisfy typecheck.

## Project-Specific

- [T207] 🟡 **Factory hooks parity**: Factory hooks mirror Claude events (including legacy `PreMessage`/`PreCommit`) and need merged sources (files + config) with default `Bash(git commit*)` matcher for `PreCommit` → Copy Claude's mapping/build pattern, run hooks through `sortHooksByEvent`, and include env/settings in `.factory/settings.json`
- [T212] 🟢 **Generic format is tool-agnostic**: The generic format (`.ai-tool-sync/`) should NOT favor any particular tool's naming convention. Use snake_case (`always_apply`, `tool_match`) in the generic format; transformers exist to convert to each tool's expected format (e.g., `always_apply` → `alwaysApply` for Cursor). This separation keeps the generic format neutral and makes adding new targets straightforward.

## Manifest V2

- [T220] 🟡 **Manifest v1/v2 interop**: Updating manifest to v2 while reusing v1 helpers (e.g., gitignore) breaks types and runtime shape expectations. Convert v2 entries to v1 shape where needed (`files.map(entry => entry.path)`) and narrow to v2 before passing to history to avoid `Manifest | ManifestV2` type errors and inconsistent content.

---

*Last updated: 2025-12-08*
