# {{PROJECT_NAME}} - Development Tasks

Based on the architecture defined in `{{ARCHITECTURE_PATH}}`, this document tracks remaining tasks and summarizes completed work.
Completed Task details can be found in `{{TASKS_PATH}}`.
Lessons learned from these tasks can be found in `{{LEARNINGS_PATH}}`.

---

## Legend

- **Priority**: 🟢 P0 (MVP), 🟠 P1 (Important), 🔴 P2 (Nice to have)
- **Status**: `[ ]` Todo, `[~]` In Progress, `[x]` Done
- **Wave**: Execution order (Wave 1 first, then Wave 2, etc.)
- **Task ID Format**: `W{wave}-{track}-{counter}` (e.g., W001-A-01)

---

## Completed Work Summary

### Overview

| Phase | Description | Tasks | Status |
|-------|-------------|-------|--------|
| **Phase 1** | {{PHASE_1_DESCRIPTION}} | {{PHASE_1_TASK_RANGE}} | ✅ {{PHASE_1_SUMMARY}} |
| **Phase 2** | {{PHASE_2_DESCRIPTION}} | {{PHASE_2_TASK_RANGE}} | ✅ {{PHASE_2_SUMMARY}} |
| **Phase 3** | {{PHASE_3_DESCRIPTION}} | {{PHASE_3_TASK_RANGE}} | ✅ {{PHASE_3_SUMMARY}} |
<!-- Add more phases as needed -->

---

## Remaining Work - Execution Plan

### Wave 1: Foundation (No Dependencies on Remaining Tasks)

All Wave 1 tasks can be started immediately. Tasks within the same track should be worked sequentially to avoid merge conflicts. Different tracks can be worked in parallel.

#### Track A: {{TRACK_A_NAME}} ({{TRACK_A_PRIORITY_EMOJI}} {{TRACK_A_PRIORITY}})

- [ ] **W001-A-01** - {{TASK_TITLE}}
  - {{TASK_DETAIL_1}}
  - {{TASK_DETAIL_2}}
  - {{TASK_DETAIL_3}}

- [ ] **W001-A-02** - {{TASK_TITLE}}
  - {{TASK_DETAIL_1}}
  - {{TASK_DETAIL_2}}

#### Track B: {{TRACK_B_NAME}} ({{TRACK_B_PRIORITY_EMOJI}} {{TRACK_B_PRIORITY}})

- [ ] **W001-B-01** - {{TASK_TITLE}}
  - {{TASK_DETAIL_1}}
  - {{TASK_DETAIL_2}}

- [ ] **W001-B-02** - {{TASK_TITLE}}
  - {{TASK_DETAIL_1}}
  - {{TASK_DETAIL_2}}

#### Track C: {{TRACK_C_NAME}} ({{TRACK_C_PRIORITY_EMOJI}} {{TRACK_C_PRIORITY}})

- [ ] **W001-C-01** - {{TASK_TITLE}}
  - {{TASK_DETAIL_1}}
  - {{TASK_DETAIL_2}}

---

### Wave 2: Depends on Wave 1

Start these after their dependencies from Wave 1 are complete.

#### Track A: {{TRACK_A_NAME}} (continued)

- [ ] **W002-A-01** - {{TASK_TITLE}}
  - {{TASK_DETAIL_1}}
  - {{TASK_DETAIL_2}}
  - **Deps: W001-A-01, W001-A-02**

#### Track B: {{TRACK_B_NAME}} (continued)

- [ ] **W002-B-01** - {{TASK_TITLE}}
  - {{TASK_DETAIL_1}}
  - **Deps: W001-B-01**

---

### Wave 3: Depends on Wave 2

#### Track A: {{TRACK_A_NAME}} (continued)

- [ ] **W003-A-01** - {{TASK_TITLE}}
  - {{TASK_DETAIL_1}}
  - **Deps: W002-A-01**

---

## Future Feature Ideas (Backlog)

1. {{BACKLOG_IDEA_1}}
2. {{BACKLOG_IDEA_2}}
3. {{BACKLOG_IDEA_3}}

---

## Notes

1. {{NOTE_1}}
2. {{NOTE_2}}
3. {{NOTE_3}}
