# T151 Result - Implement Plugin Update Mechanism

## Summary
- Added plugin update utilities with remote tag detection, version comparison, and update execution that preserves local overrides and uses existing Git loader/cache patterns.
- Wired `ai-sync plugins update` CLI subcommand with dry-run/apply/force options and summary output; exported new APIs.
- Added unit and integration coverage for update logic and CLI behavior.

## Checks
- `npm run typecheck`
- `npm run lint`
- `npm test -- tests/unit/utils/plugin-update.test.ts tests/integration/plugin-update.test.ts`

## Notes
- Vitest previously raised tinypool teardown errors; resolved by rerunning after import-order fixes. All tests now pass cleanly.
