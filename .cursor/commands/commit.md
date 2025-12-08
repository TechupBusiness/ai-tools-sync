# Git Commit Convention

This project uses **[Conventional Commits](https://www.conventionalcommits.org/)** for all git commits.

## Commit Message Format

```
<type>(<scope>): <description>

- bullet point 1
- bullet point 2
- bullet point 3
```

**Structure Rules:**
- **Line 1 (Header):** `<type>(<scope>): <description>` - imperative mood, lowercase, no period, max 72 chars
- **Line 2:** MUST be blank
- **Line 3+ (Body):** Bullet points starting with `- `, each describing a specific change

## Git Command Format

**CRITICAL:** Use a SINGLE `-m` flag with the ENTIRE message including newlines:

```bash
git commit -m "feat(loaders): add watch mode to sync command

- add native fs.watch watch flow with debounce, stats, and signal cleanup
- wire sync CLI watch flags and exports plus debounce utility
- cover watch and debounce behavior with unit tests and update learnings"
```

**DO NOT** use multiple `-m` flags (this creates unwanted blank lines):
```bash
# WRONG - creates extra blank lines between each -m
git commit -m "feat: add something" -m "- bullet 1" -m "- bullet 2"
```

## Commit Approval Flow (AI Assistants)

Before staging or committing, the AI must present the plan for approval:

```
Planned files to stage:
- path/to/file1
- path/to/file2

Proposed commit message:
<type>(<scope>): <description>

- bullet 1
- bullet 2
- bullet 3
```

Only after the user confirms should the AI run `git add ...` followed by the single `git commit -m "..."` command.

## Types

| Type | Description | Triggers Version Bump |
|------|-------------|----------------------|
| `feat` | New feature | Minor (0.X.0) |
| `fix` | Bug fix | Patch (0.0.X) |
| `docs` | Documentation only | None |
| `style` | Formatting, no code change | None |
| `refactor` | Code change, no new feature or fix | None |
| `perf` | Performance improvement | Patch |
| `test` | Adding/updating tests | None |
| `chore` | Maintenance, dependencies | None |
| `ci` | CI/CD changes | None |

## Scopes

Scopes are optional but encouraged. Use them to indicate the area of the codebase affected:

```bash
feat(loaders): add Claude plugin loader
fix(cli): resolve argument parsing issue
refactor(utils): simplify debounce logic
```

## Breaking Changes

For breaking changes, add an exclamation mark (!) after type/scope and explain in footer:

```
feat(api)!: change order response format

- information 1
- information 2

BREAKING CHANGE: Order response now includes `executedAt` timestamp.
Clients must update to handle new field.
```

## Complete Example

```bash
git commit -m "feat(loaders): add Claude plugin loader for native Claude format

- implement ClaudePluginLoader to transform Claude-native plugins to generic format
- transform Claude skills/ directory (SKILL.md files) to generic rules
- transform Claude agents/ directory to generic personas
- load hooks from settings.json with event type mapping
- support both subdirectory and flat formats
- map Claude tool names to generic names
- add comprehensive test suite with 26 tests
- export ClaudePluginLoader from main entry point"
```

## Commit Message Construction Rules (For AI Agents)

When constructing a commit message:

1. **Use SINGLE `-m` flag** with embedded newlines (not multiple `-m` flags)
2. **Header:** Choose appropriate type + optional scope + write concise description
3. **One blank line** after header
4. **Body bullets:** List ALL meaningful changes, one per line, starting with `- `
5. **Each bullet should:**
   - Start with a lowercase verb (add, fix, update, remove, implement, refactor)
   - Be specific about what changed
   - Be understandable without seeing the code

**DO NOT:**
- Use multiple `-m` flags
- End the header with a period
- Write vague bullets like "- various fixes"
- Add Co-authored-by lines

## Commit Checklist

Before committing, verify:
- [ ] Reflected on changes (best practice, test, lint, typecheck)
- [ ] Using single `-m` flag with embedded newlines
- [ ] Commit message follows convention exactly
- [ ] Changes are logically grouped
- [ ] **No Co-authored-by lines**
- [ ] Only committing your own changes
- [ ] User has reviewed the changes before final `git commit` !! WAIT BEFORE YOU COMMIT!!!!
