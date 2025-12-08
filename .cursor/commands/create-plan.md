# Project Plan Generation Prompt

Create a development task plan in markdown format for the following project:

**Project Name:** [Your project name]
**Project plan template:** [Path to the important template that you should use, `.ai-flow/template/plan-template.md`]
**Project plan target document:** [Path to architecture doc, e.g., `.ai-flow/plan.md`]
**Architecture Document:** [Path to architecture doc, e.g., `.ai-flow/project.md`]
**Tasks Directory:** [Path to task files, e.g., `.ai-flow/tasks/`]
**Learnings Document:** [Path to learnings, e.g., `.ai-flow/learnings.md`]

**Project Description:**
[Brief description of what the project does]

**Completed Work:**
[List completed phases/features, or say "None yet" for new projects]

**Remaining Features to Implement:**
[List the features/components that need to be built]

---

## Format Requirements

1. **Task ID Format:** Use `W{wave}-{track}-{counter}` format
   - Wave number (W001, W002, W003...)
   - Track letter (A, B, C, D...)
   - Counter starting at 01 within each track per wave (01, 02, 03...)
   - Example: W001-A-01, W001-A-02, W001-B-01, W002-A-01

2. **Priority Indicators:** Use colored emoji balls
   - 🟢 P0 (MVP/Critical)
   - 🟠 P1 (Important)
   - 🔴 P2 (Nice to have)

3. **Status Markers:**
   - `[ ]` Todo
   - `[~]` In Progress
   - `[x]` Done

4. **Wave Organization:**
   - Wave 1: No dependencies on other remaining tasks (can start immediately)
   - Wave 2+: Tasks that depend on previous waves
   - Tasks within the same track should be sequential
   - Different tracks can be worked in parallel

5. **Track Organization:**
   - Group related tasks into tracks (A, B, C, D...)
   - Each track should have a descriptive name
   - Show track priority with emoji

6. **Task Structure:**
   - Task ID in bold
   - Clear task title
   - Bullet points for implementation details
   - Dependencies listed with `**Deps: W1-A-01**` format

7. **Include Sections:**
   - Legend explaining symbols
   - Completed Work Summary (table format)
   - Remaining Work organized by Waves and Tracks
   - Future Feature Ideas (backlog)
   - Notes for development guidelines

---

Replace all `{{PLACEHOLDER}}` values with actual content. Do not leave any placeholders in the final document.


## Example Output:

```
# My Project - Development Tasks

## Legend
- **Priority**: 🟢 P0 (MVP), 🟠 P1 (Important), 🔴 P2 (Nice to have)
- **Status**: `[ ]` Todo, `[~]` In Progress, `[x]` Done

## Remaining Work - Execution Plan

### Wave 1: Foundation

#### Track A: Core Features (🟢 P0)

- [ ] **W001-A-01** - Implement user authentication
  - Add login/logout endpoints
  - JWT token generation
  - Session management

- [ ] **W001-A-02** - Add user profile management
  - CRUD operations for profiles
  - Avatar upload support

#### Track B: API Layer (🟠 P1)

- [ ] **W001-B-01** - Create REST API structure
  - Define route handlers
  - Add request validation

### Wave 2: Depends on Wave 1

#### Track A: Core Features (continued)

- [ ] **W002-A-01** - Add role-based permissions
  - Define permission levels
  - Middleware for access control
  - **Deps: W001-A-01**
```