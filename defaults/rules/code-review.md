---
name: code-review
description: Guidelines for conducting thorough and constructive code reviews
version: 1.0.0
always_apply: false
globs:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.py"
  - "**/*.go"
  - "**/*.rs"
targets:
  - cursor
  - claude
  - factory
category: documentation
priority: medium
---

# Code Review Guidelines

Guidelines for conducting thorough, constructive code reviews that improve code quality and share knowledge.

## Review Mindset

### As a Reviewer

- **Be Kind**: Remember there's a human behind the code
- **Be Specific**: Point to exact lines and explain why something is an issue
- **Be Constructive**: Suggest improvements, don't just criticize
- **Be Humble**: Ask questions when you don't understand - maybe you're missing context
- **Be Timely**: Review promptly to avoid blocking teammates

### As an Author

- **Be Open**: Accept feedback gracefully and learn from it
- **Be Responsive**: Address comments or explain why you disagree
- **Be Proactive**: Write good descriptions to help reviewers understand

## What to Review

### 1. Correctness

- Does the code do what it's supposed to do?
- Are edge cases handled appropriately?
- Are error conditions handled?
- Are there any obvious bugs or logic errors?

### 2. Design

- Does this change fit well with the existing architecture?
- Is the code modular and reusable where appropriate?
- Are dependencies reasonable and necessary?
- Is there unnecessary complexity?

### 3. Readability

- Can you understand the code without excessive effort?
- Are names (variables, functions, classes) clear and descriptive?
- Is the code well-organized and easy to follow?
- Are complex sections commented?

### 4. Maintainability

- Will this code be easy to modify in the future?
- Is there duplicated code that should be extracted?
- Are there hardcoded values that should be configurable?
- Is the code consistent with project conventions?

### 5. Testing

- Are there appropriate tests for new functionality?
- Do tests cover edge cases and error conditions?
- Are tests readable and maintainable?
- Do tests actually verify the behavior, not just cover lines?

### 6. Security

- Is user input validated and sanitized?
- Are there potential injection vulnerabilities?
- Is sensitive data handled appropriately?
- Are authentication and authorization correct?

### 7. Performance

- Are there obvious performance issues?
- Are database queries efficient?
- Is there unnecessary computation or memory usage?
- Are there potential scalability concerns?

## Comment Categories

Use prefixes to clarify the nature of your comments:

- **`[required]`**: Must be addressed before merging
- **`[suggestion]`**: Recommendation, but not blocking
- **`[question]`**: Seeking clarification or understanding
- **`[nit]`**: Minor style or preference issue
- **`[praise]`**: Something done well worth highlighting

## Example Comments

### Good Comments

```
[required] This query could cause N+1 issues. Consider using a JOIN or 
eager loading to fetch related records in a single query.

[suggestion] This function is doing two things - validating and saving. 
Consider splitting into separate functions for clarity.

[question] I'm not sure I understand why we need this null check here. 
Could you help me understand when `user` could be null at this point?

[praise] Nice use of the strategy pattern here! This makes it easy to 
add new payment methods in the future.
```

### Poor Comments

```
❌ "This is wrong"  (not specific or helpful)
❌ "I wouldn't do it this way"  (doesn't explain why or suggest alternative)
❌ "..."  (passive-aggressive or unclear)
```

## Review Checklist

Before approving, verify:

- [ ] Code compiles and runs without errors
- [ ] Tests pass and cover new functionality
- [ ] Documentation is updated if needed
- [ ] No obvious security vulnerabilities
- [ ] Code follows project conventions
- [ ] Commit messages are clear and follow conventions
- [ ] No debugging code or console.logs left in

## When to Request Changes vs Approve

**Request Changes When:**
- There are bugs or incorrect logic
- Security vulnerabilities exist
- Tests are missing for critical functionality
- Code doesn't meet project standards

**Approve With Comments When:**
- Issues are minor and can be fixed in follow-up
- Suggestions are improvements, not requirements
- Author has addressed all required feedback

## Review Etiquette

1. **Avoid Bikeshedding**: Don't spend disproportionate time on trivial issues
2. **Pick Your Battles**: Focus on important issues, not every minor preference
3. **Use Automation**: Let linters and formatters handle style issues
4. **Review the Change, Not the Person**: Focus on the code, not the author
5. **Acknowledge Good Work**: Don't only point out problems

