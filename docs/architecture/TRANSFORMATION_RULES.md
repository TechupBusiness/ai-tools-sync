# Content Transformation Rules

This document describes how generic content is transformed for each target platform.

## Tool Mapping

Tools are mapped between the generic format and platform-specific names:

| Generic | Cursor | Claude | Factory |
|---------|--------|--------|---------|
| read | Read | Read | Read |
| write | Write | Write | Write |
| edit | Edit | Edit | Edit |
| execute | Bash | Bash | Bash |
| search | Grep | Grep | Grep |
| glob | Glob | Glob | Glob |
| fetch | - | WebFetch | WebFetch |
| ls | - | ListDir | ListDir |

```text
GENERIC TOOLS                           PLATFORM TOOLS
─────────────                           ──────────────
┌────────────┐                          ┌────────────┐
│   read     │─────────────────────────▶│    Read    │
└────────────┘                          └────────────┘
┌────────────┐                          ┌────────────┐
│   write    │─────────────────────────▶│   Write    │
└────────────┘                          └────────────┘
┌────────────┐                          ┌────────────┐
│   edit     │─────────────────────────▶│    Edit    │
└────────────┘                          └────────────┘
┌────────────┐                          ┌────────────┐
│  execute   │─────────────────────────▶│    Bash    │
└────────────┘                          └────────────┘
┌────────────┐                          ┌────────────┐
│   search   │─────────────────────────▶│    Grep    │
└────────────┘                          └────────────┘
┌────────────┐                          ┌────────────┐
│    glob    │─────────────────────────▶│    Glob    │
└────────────┘                          └────────────┘
┌────────────┐                          ┌────────────┐
│   fetch    │─────────────────────────▶│  WebFetch  │  (Claude/Factory only)
└────────────┘                          └────────────┘
┌────────────┐                          ┌────────────┐
│     ls     │─────────────────────────▶│  ListDir   │  (Claude/Factory only)
└────────────┘                          └────────────┘
```

```mermaid
flowchart LR
    subgraph Generic["Generic Tools"]
        G_READ[read]
        G_WRITE[write]
        G_EDIT[edit]
        G_EXEC[execute]
        G_SEARCH[search]
    end
    
    subgraph Platform["Platform Tools"]
        P_READ[Read]
        P_WRITE[Write]
        P_EDIT[Edit]
        P_BASH[Bash]
        P_GREP[Grep]
    end
    
    G_READ --> P_READ
    G_WRITE --> P_WRITE
    G_EDIT --> P_EDIT
    G_EXEC --> P_BASH
    G_SEARCH --> P_GREP
```

## Model Mapping

| Generic | Claude | Factory |
|---------|--------|---------|
| default | claude-sonnet-4-20250514 | (platform default) |
| fast | claude-haiku-3-20241022 | (fast model) |
| powerful | claude-opus-4-20250514 | (powerful model) |
| inherit | (from parent) | (from parent) |

```text
GENERIC MODEL                           CLAUDE MODEL
─────────────                           ────────────
┌────────────┐                          ┌──────────────────────────┐
│  default   │─────────────────────────▶│ claude-sonnet-4-20250514 │
└────────────┘                          └──────────────────────────┘
┌────────────┐                          ┌──────────────────────────┐
│    fast    │─────────────────────────▶│ claude-haiku-3-20241022  │
└────────────┘                          └──────────────────────────┘
┌────────────┐                          ┌──────────────────────────┐
│  powerful  │─────────────────────────▶│ claude-opus-4-20250514   │
└────────────┘                          └──────────────────────────┘
┌────────────┐                          ┌──────────────────────────┐
│  inherit   │─────────────────────────▶│     (from parent)        │
└────────────┘                          └──────────────────────────┘
```

```mermaid
flowchart TB
    subgraph Input["Generic Model"]
        M_DEFAULT[default]
        M_FAST[fast]
        M_POWERFUL[powerful]
        M_INHERIT[inherit]
    end
    
    subgraph Claude["Claude Models"]
        C_SONNET[claude-sonnet-4-20250514]
        C_HAIKU[claude-haiku-3-20241022]
        C_OPUS[claude-opus-4-20250514]
    end
    
    M_DEFAULT --> C_SONNET
    M_FAST --> C_HAIKU
    M_POWERFUL --> C_OPUS
```

## Rule Transformation

```text
                    GENERIC RULE
    ┌───────────────────────────────────────────┐
    │ name: my-rule                             │
    │ description: A helpful rule               │
    │ always_apply: true                        │
    │ globs: ['*.ts', '*.tsx']                  │
    │ kind: policy                              │
    │ ---                                       │
    │ # Rule Content                            │
    │ Follow these guidelines...                │
    └─────────────────────┬─────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
  ┌───────────┐    ┌───────────┐    ┌───────────┐
  │  CURSOR   │    │  CLAUDE   │    │  FACTORY  │
  └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
        │                │                │
        ▼                ▼                ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│.cursor/rules/   │ │.claude/skills/  │ │.factory/skills/ │
│my-rule.mdc      │ │my-rule/SKILL.md │ │my-rule/SKILL.md │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│---              │ │# my-rule        │ │# my-rule        │
│description: ... │ │                 │ │                 │
│alwaysApply: true│ │A helpful rule   │ │A helpful rule   │
│globs:           │ │                 │ │                 │
│  - "*.ts"       │ │## Instructions  │ │## Instructions  │
│  - "*.tsx"      │ │Follow these...  │ │Follow these...  │
│---              │ │                 │ │                 │
│# Rule Content   │ │                 │ │                 │
│Follow these...  │ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

```mermaid
flowchart TB
    subgraph Generic["Generic Rule Fields"]
        G_NAME[name]
        G_DESC[description]
        G_APPLY[always_apply]
        G_GLOBS[globs]
        G_KIND[kind]
        G_BODY[content body]
    end
    
    subgraph Cursor["Cursor .mdc"]
        C_DESC[description]
        C_APPLY[alwaysApply]
        C_GLOBS[globs]
        C_BODY[body]
    end
    
    subgraph Claude["Claude SKILL.md"]
        CL_TITLE[# title]
        CL_DESC[description section]
        CL_BODY[instructions]
    end
    
    G_DESC --> C_DESC
    G_APPLY --> C_APPLY
    G_GLOBS --> C_GLOBS
    G_BODY --> C_BODY
    
    G_NAME --> CL_TITLE
    G_DESC --> CL_DESC
    G_BODY --> CL_BODY
```

## Persona Transformation

```text
                    GENERIC PERSONA
    ┌───────────────────────────────────────────┐
    │ name: architect                           │
    │ description: System design expert         │
    │ tools: [read, write, search]              │
    │ model: powerful                           │
    │ ---                                       │
    │ You are an expert system architect...     │
    └─────────────────────┬─────────────────────┘
                          │
                ┌─────────┴─────────┐
                │                   │
                ▼                   ▼
          ┌───────────┐       ┌───────────┐
          │  CLAUDE   │       │  FACTORY  │
          └─────┬─────┘       └─────┬─────┘
                │                   │
                ▼                   ▼
    ┌─────────────────────┐ ┌─────────────────────┐
    │.claude/agents/      │ │.factory/droids/     │
    │architect.md         │ │architect.md         │
    ├─────────────────────┤ ├─────────────────────┤
    │---                  │ │---                  │
    │name: architect      │ │name: architect      │
    │tools:               │ │allowed-tools:       │
    │  - Read             │ │  - Read             │
    │  - Write            │ │  - Write            │
    │  - Grep             │ │  - Grep             │
    │model: claude-opus...│ │model: ...           │
    │---                  │ │reasoningEffort: high│
    │You are an expert... │ │---                  │
    │                     │ │You are an expert... │
    └─────────────────────┘ └─────────────────────┘
```

```mermaid
flowchart TB
    subgraph Generic["Generic Persona"]
        G_NAME[name]
        G_DESC[description]
        G_TOOLS[tools]
        G_MODEL[model]
        G_EXTENDS[extends]
        G_BODY[content]
    end
    
    subgraph Claude["Claude Agent"]
        CL_NAME[name]
        CL_TOOLS[tools]
        CL_MODEL[model]
        CL_BODY[instructions]
    end
    
    subgraph Factory["Factory Droid"]
        F_NAME[name]
        F_TOOLS[allowed-tools]
        F_MODEL[model]
        F_EFFORT[reasoningEffort]
        F_BODY[instructions]
    end
    
    G_NAME --> CL_NAME
    G_NAME --> F_NAME
    G_TOOLS --> CL_TOOLS
    G_TOOLS --> F_TOOLS
    G_MODEL --> CL_MODEL
    G_MODEL --> F_MODEL
    G_BODY --> CL_BODY
    G_BODY --> F_BODY
```

## Hook Transformation

Hooks are only supported by Claude Code and Factory:

```text
                      GENERIC HOOK
    ┌───────────────────────────────────────────┐
    │ name: block-dangerous                     │
    │ event: PreToolUse                         │
    │ match: Bash(*rm -rf*)                     │
    │ action: block                             │
    │ message: Dangerous command blocked        │
    └─────────────────────┬─────────────────────┘
                          │
                ┌─────────┴─────────┐
                │                   │
                ▼                   ▼
          ┌───────────┐       ┌───────────┐
          │  CLAUDE   │       │  FACTORY  │
          └─────┬─────┘       └─────┬─────┘
                │                   │
                ▼                   ▼
    ┌─────────────────────┐ ┌─────────────────────┐
    │.claude/settings.json│ │.factory/settings.json
    ├─────────────────────┤ ├─────────────────────┤
    │{                    │ │{                    │
    │  "hooks": {         │ │  "hooks": {         │
    │    "PreToolUse": [  │ │    "PreToolUse": [  │
    │      {              │ │      {              │
    │        "matcher":   │ │        "matcher":   │
    │          "Bash(*rm  │ │          "Bash(*rm  │
    │            -rf*)",  │ │            -rf*)",  │
    │        "action":    │ │        "action":    │
    │          "block",   │ │          "block",   │
    │        "message":   │ │        "message":   │
    │          "Dangerous │ │          "Dangerous │
    │           command"  │ │           command"  │
    │      }              │ │      }              │
    │    ]                │ │    ]                │
    │  }                  │ │  }                  │
    │}                    │ │}                    │
    └─────────────────────┘ └─────────────────────┘
```

```mermaid
flowchart TB
    subgraph Generic["Generic Hook"]
        G_NAME[name]
        G_EVENT[event]
        G_MATCH[match]
        G_ACTION[action]
        G_MSG[message]
        G_CMD[command]
    end
    
    subgraph Settings["settings.json"]
        S_HOOKS["hooks: { }"]
        S_EVENT["PreToolUse: []"]
        S_ENTRY["{type, command, matcher, action, message}"]
    end
    
    G_EVENT --> S_EVENT
    G_MATCH --> S_ENTRY
    G_ACTION --> S_ENTRY
    G_MSG --> S_ENTRY
    G_CMD --> S_ENTRY
```

## Entry Point Generation

### CLAUDE.md Structure

```text
┌─────────────────────────────────────────────────────────────────┐
│ <!-- Auto-generated by ai-tool-sync -->                         │
│                                                                 │
│ # Project Name                                                  │
│                                                                 │
│ Project description from config.yaml                            │
│                                                                 │
│ ## Skills                                                       │
│                                                                 │
│ - **skill-name** - Description of the skill                     │
│ - **another-skill** - Another description                       │
│                                                                 │
│ ## Agents                                                       │
│                                                                 │
│ - **architect** - System design expert                          │
│ - **implementer** - Code implementation specialist              │
│                                                                 │
│ ## Commands                                                     │
│                                                                 │
│ - **/lint-fix** - Run linting and auto-fix issues               │
│ - **/type-check** - Run TypeScript type checking                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```markdown
<!-- Auto-generated by ai-tool-sync -->

# Project Name

[Project description from config]

## Skills

- skill-name - Description of the skill

## Agents

- agent-name - Description of the agent

## Commands

- /command-name - Description of the command
```

### AGENTS.md Structure (Factory)

```text
┌─────────────────────────────────────────────────────────────────┐
│ <!-- Auto-generated by ai-tool-sync -->                         │
│                                                                 │
│ # Project Name                                                  │
│                                                                 │
│ Project description from config.yaml                            │
│                                                                 │
│ ## Skills                                                       │
│                                                                 │
│ - **skill-name** - Description                                  │
│                                                                 │
│ ## Droids                                                       │
│                                                                 │
│ - **architect** - System design expert                          │
│ - **implementer** - Code implementation specialist              │
│                                                                 │
│ ## Commands                                                     │
│                                                                 │
│ - **/lint-fix** - Run linting and auto-fix                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```markdown
<!-- Auto-generated by ai-tool-sync -->

# Project Name

[Project description from config]

## Skills

- skill-name - Description

## Droids

- droid-name - Description

## Commands

- /command-name - Description
```

## Platform Extension Overrides

Each content type can have platform-specific overrides that take precedence:

```text
                    BASE VALUES                    CURSOR EXTENSION
    ┌───────────────────────────────┐    ┌───────────────────────────────┐
    │ always_apply: false           │    │ cursor:                       │
    │ globs: ['*.ts']               │    │   alwaysApply: true           │
    │                               │    │   globs: ['*.tsx']            │
    └───────────────┬───────────────┘    └───────────────┬───────────────┘
                    │                                    │
                    │         MERGE (extension wins)     │
                    └────────────────┬───────────────────┘
                                     │
                                     ▼
                    ┌───────────────────────────────────────┐
                    │        FINAL CURSOR OUTPUT            │
                    ├───────────────────────────────────────┤
                    │ alwaysApply: true   ◀── from extension│
                    │ globs: ['*.tsx']    ◀── from extension│
                    └───────────────────────────────────────┘
```

```mermaid
flowchart TB
    subgraph Base["Base Values"]
        B_APPLY[always_apply: false]
        B_GLOBS["globs: ['*.ts']"]
    end
    
    subgraph Extension["Cursor Extension"]
        E_APPLY[alwaysApply: true]
        E_GLOBS["globs: ['*.tsx']"]
    end
    
    subgraph Final["Final Cursor Output"]
        F_APPLY[alwaysApply: true]
        F_GLOBS["globs: ['*.tsx']"]
    end
    
    B_APPLY -->|overridden| F_APPLY
    E_APPLY -->|wins| F_APPLY
    B_GLOBS -->|overridden| F_GLOBS
    E_GLOBS -->|wins| F_GLOBS
```
