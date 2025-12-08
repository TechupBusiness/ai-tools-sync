# Git Commit Convention

This project uses **[Conventional Commits](https://www.conventionalcommits.org/)** for all git commits.

## Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

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

Dont use scopes

## Breaking Changes

For breaking changes, add `!` after type/scope and explain in footer:

```bash
feat(api)!: change order response format

BREAKING CHANGE: Order response now includes `executedAt` timestamp.
Clients must update to handle new field.
```

## Example

```
feat: add Claude Code hooks support with correct output format

- Fix incorrect hook JSON structure (was {matcher, hooks[]}, now {type, command, matcher})
- Add support for all 9 Claude hook events (UserPromptSubmit, PreToolUse, PostToolUse, Notification, Stop, SubagentStop, SessionStart, SessionEnd, PreCompact)
- Map legacy events for backwards compatibility (PreMessage→UserPromptSubmit, PreCommit→PreToolUse)
- Support dual hook sources (markdown files + config.yaml)
- Add claude: frontmatter extension for action, message, type
- Add 14 new tests (10 generator + 4 parser)
- Update documentation in PLATFORM_FEATURES.md
```

## Agent Behavior: Proactive Commit Suggestions

**Important**: When working on tasks, the agent should:

1. **Suggest logical commits** at natural breakpoints:
   - After completing a discrete feature or fix
   - Before switching to a different area of code
   - When changes form a cohesive, atomic unit

2. **Remind the user** with a message like:
   > "This is a good point to commit. Suggested message:
   > `feat: implement strictest-wins rate limiting`
   > Would you like me to stage and commit these changes?"

3. **Group changes logically**:
   - One commit per logical change
   - Don't mix unrelated changes
   - Tests can be in same commit as the feature they test
   - Documentation updates can be separate or bundled

4. **Never commit without asking** - always suggest and wait for approval

## Commit Checklist

Before committing, verify:
- [ ] Make sure you reflected (best practice, test, lint, typecheck) your changes already
- [ ] Commit message follows convention
- [ ] Changes are logically grouped
- [ ] **Never add Co-authored-by lines** - keep commits clean
- [ ] Only commit your changes
- [ ] Never commit files from .ai-flow directory (even if you created them), if not instructed explicitely otherwise
- [ ] Let user review the changes before you do the final `git commit`

Please commit your changes made now.