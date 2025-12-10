# transfer-worktree

Transfer changes from a Cursor worktree back to the main workspace.

---

## Context

When running in a Cursor worktree, you have two relevant paths:
- **Worktree path**: Where you currently are (e.g., `~/.cursor/worktrees/{project}/{worktree-id}`)
- **Workspace path**: The original/main workspace (e.g., `~/Sources/{project}`)

Use `git worktree list` to see both paths if needed.

---

## Phase 1: Discovery & Summary

### 1.1 Gather information

Run these commands to understand the current state:

```bash
git worktree list                    # shows worktree and main workspace paths
git status -sb                       # current worktree status
git log --oneline main..HEAD         # commits ahead of main (if any)
```

### 1.2 Present summary and wait for confirmation

**⏸️ STOP - Present this summary to the user:**

```
## Transfer Summary

**From:** {worktree-path}
**To:**   {workspace-path}

### Worktree state:
- Commits ahead of main: {count}
- Uncommitted changes: {yes/no - list files if yes}
- Clean: {yes/no}

### Recommended approach:
- {If has commits}: **Merge** - cleanest, preserves history
- {If only uncommitted changes}: **Patch** - quick transfer of WIP
- {If nothing to transfer}: Nothing to do

**Options:**
1. **Merge** - Commit all changes, merge branch into main (recommended)
2. **Patch** - Transfer uncommitted changes only (for WIP)
3. **Discard** - Delete worktree without transferring
4. **Abort** - Cancel

Which option?
```

**Wait for user to choose before proceeding.**

---

## Phase 2: Transfer Methods

### Option 1: Merge (recommended)

The cleanest approach. Commit everything in worktree, then merge into main.

#### Step 1: Commit uncommitted changes (if any)

```bash
git add -A
git status -sb
```

**⏸️ STOP - If there are staged changes, ask user for commit message before committing.**

```bash
git commit -m "{user's message}"
```

#### Step 2: Show commits to be merged

```bash
git log --oneline main..HEAD
```

**⏸️ STOP - Ask user:**
```
Commits to merge:
{list}

Options:
1. Regular merge - preserves all commits
2. Squash merge - combine into single commit

Which option?
```

#### Step 3: Merge into main workspace

```bash
cd {workspace-path}

# Regular merge:
git merge {worktree-branch} --no-commit

# Or squash merge:
git merge {worktree-branch} --squash
```

The `--no-commit` / `--squash` flags stage changes without committing, so user can review first.

#### Step 4: Review and finalize

```bash
git status -sb
git diff --cached --stat
```

**⏸️ STOP - Let user review. Ask if ready to commit or needs adjustments.**

---

### Option 2: Patch (for uncommitted WIP)

Use when transferring work-in-progress without creating commits in the worktree.

#### Step 1: Create patch

```bash
cd {worktree-path}
git add -A
git diff --cached --binary -- . ':!node_modules' > /tmp/{worktree-id}-transfer.patch
```

#### Step 2: Preview in target

```bash
cd {workspace-path}
git apply --stat /tmp/{worktree-id}-transfer.patch
```

**⏸️ STOP - Show preview, ask user to confirm apply.**

#### Step 3: Apply patch

```bash
git apply --3way /tmp/{worktree-id}-transfer.patch
```

If conflicts occur, help user resolve them.

#### Step 4: Cleanup

```bash
rm /tmp/{worktree-id}-transfer.patch
```

---

## Phase 3: Verification

After transfer, run verification in the main workspace:

```bash
cd {workspace-path}
git status -sb
npm run typecheck
npm run lint
npm test
```

Report results to user.

---

## Phase 4: Cleanup

**⏸️ STOP - Ask user:**

```
Transfer complete. Cleanup options:

1. **Delete worktree** - Remove entirely (recommended after merge)
2. **Keep worktree** - Leave for further work
3. **Force delete** - Remove even if dirty (discards remaining changes)

Which option?
```

### Delete commands:

```bash
# Clean worktree (after merge):
git worktree remove {worktree-path}

# Dirty worktree or don't care about remaining changes:
git worktree remove --force {worktree-path}

# Also delete the branch (optional):
git branch -d {worktree-branch}   # safe - only if merged
git branch -D {worktree-branch}   # force delete
```

---

## Quick Reference

| State | Meaning | Can delete without --force? |
|-------|---------|----------------------------|
| **Clean** | All changes committed | Yes |
| **Dirty** | Has uncommitted changes | No (use --force) |

| Action | Command |
|--------|---------|
| List worktrees | `git worktree list` |
| Remove worktree | `git worktree remove {path}` |
| Force remove | `git worktree remove --force {path}` |
| Prune stale | `git worktree prune` |

---

## Notes

- **Merge is preferred** - clean history, leaves worktree clean for easy deletion
- **Patch is for WIP** - when you don't want commits in the worktree
- **`--force` is safe** if you've already transferred changes or don't need them
- `':!node_modules'` in the diff command excludes node_modules
- `--3way` enables conflict markers instead of silent failure
