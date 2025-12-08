## Self-Review

### 1. Run Verification !!
```bash
pnpm typecheck
pnpm lint
pnpm test
```
Run each separately. Fix all errors before proceeding.

### 2. Check Against Project Standards

IMPORTANT!!! Review your work against:
- .ai-flow/project.md - Project plan & Architecture
- .ai-flow/learnings.md - Past mistakes
- .ai-flow/tasks/Txxx.md - Task requirements

**Code Quality:**
- [ ] File structure matches spec
- [ ] Copied patterns from referenced "Prior Art" files
- [ ] Uses `Result<T, E>` for errors (no throwing)
- [ ] No `any` types, no `@ts-ignore`

**Completeness:**
- [ ] All edge cases from task spec handled
- [ ] Error messages are actionable (what + how to fix)
- [ ] Exports added to barrel `index.ts`
- [ ] README updated (if public API changed)

**Tests:**
- [ ] Each error path has a test
- [ ] Tests verify root cause, not symptoms
- [ ] No `test.skip` or `test.todo` left behind

**Documentation:**
- [ ] !!! IMPORTANT !!! Update `.ai-flow/plan.md` if task status changed or new tasks identified
- [ ] Update `.ai-flow/project.md` if architecture, patterns, or conventions changed

### 3. Report

```markdown
**Implemented:** [1-2 sentences]
**Deviations from spec:** [List or "None"]
**Uncertain about:** [List or "None"]
**Commands:** typecheck ✅/❌ | lint ✅/❌ | test ✅/❌
**Docs updated:** plan.md ✅/N/A | project.md ✅/N/A
```

### 4. Action

- **All pass** → "✅ Ready for review"
- **Issues found** → Fix if quick (<5min), otherwise flag and ask

---

**🚫 Common Mistakes to Catch:**
| Mistake | How to Detect |
|---------|---------------|
| Symptom fix | Test passes even without your core fix |
| Missing edge case | Spec lists it, but no test exists |
| New pattern | Doesn't match existing similar files |
| Over-engineering | Added abstraction not in spec |
| Stale docs | plan.md/project.md don't reflect current state |