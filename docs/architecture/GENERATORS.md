# Generator Architecture

This document describes the generator system that produces platform-specific output files.

## Generator Interface

All generators implement a common interface:

```text
                    ┌─────────────────────────────────┐
                    │      Generator (interface)      │
                    ├─────────────────────────────────┤
                    │ + name: TargetType              │
                    │ + generate(content, options):   │
                    │     Promise<GenerateResult>     │
                    └───────────────┬─────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│  CursorGenerator  │   │  ClaudeGenerator  │   │ FactoryGenerator  │
├───────────────────┤   ├───────────────────┤   ├───────────────────┤
│ name = "cursor"   │   │ name = "claude"   │   │ name = "factory"  │
├───────────────────┤   ├───────────────────┤   ├───────────────────┤
│ - generateRules() │   │ - generateSkills()│   │ - generateSkills()│
│ - cleanOutputDirs │   │ - generateAgents()│   │ - generateDroids()│
│                   │   │ - generateCmds()  │   │ - generateCmds()  │
│                   │   │ - generateSettings│   │ - generateSettings│
│                   │   │ - generateClaudeMd│   │ - generateAgentsMd│
│                   │   │ - generateMcp()   │   │ - generateMcp()   │
└───────────────────┘   └───────────────────┘   └───────────────────┘
```

```mermaid
classDiagram
    class Generator {
        <<interface>>
        +string name
        +generate(content, options) GenerateResult
    }
    
    class CursorGenerator {
        +name = "cursor"
        +generate()
        -generateRules()
        -cleanOutputDirs()
    }
    
    class ClaudeGenerator {
        +name = "claude"
        +generate()
        -generateSkills()
        -generateAgents()
        -generateCommands()
        -generateSettings()
        -generateClaudeMd()
        -generateMcpConfig()
    }
    
    class FactoryGenerator {
        +name = "factory"
        +generate()
        -generateSkills()
        -generateDroids()
        -generateCommands()
        -generateSettings()
        -generateAgentsMd()
        -generateMcpConfig()
    }
    
    Generator <|.. CursorGenerator
    Generator <|.. ClaudeGenerator
    Generator <|.. FactoryGenerator
```

## Output Structure by Platform

```text
CURSOR OUTPUT                 CLAUDE OUTPUT                FACTORY OUTPUT
─────────────                 ─────────────                ──────────────
.cursor/                      .claude/                     .factory/
└── rules/                    ├── skills/                  ├── skills/
    ├── rule1.mdc             │   ├── skill1/              │   ├── skill1/
    ├── rule2.mdc             │   │   └── SKILL.md         │   │   └── SKILL.md
    └── rule3.mdc             │   └── skill2/              │   └── skill2/
                              │       └── SKILL.md         │       └── SKILL.md
                              ├── agents/                  ├── droids/
                              │   ├── architect.md         │   ├── architect.md
                              │   └── implementer.md       │   └── implementer.md
                              ├── commands/                ├── commands/
                              │   └── lint-fix.md          │   └── lint-fix.md
                              ├── settings.json            ├── settings.json
                              └── mcp.json                 └── mcp.json
                              
CLAUDE.md (project root)      AGENTS.md (project root)
```

```mermaid
flowchart TB
    subgraph Cursor["Cursor Output"]
        C_ROOT[".cursor/"]
        C_RULES["rules/"]
        C_MDC["*.mdc files"]
        
        C_ROOT --> C_RULES
        C_RULES --> C_MDC
    end
    
    subgraph Claude["Claude Code Output"]
        CL_ROOT[".claude/"]
        CL_SKILLS["skills/*/SKILL.md"]
        CL_AGENTS["agents/*.md"]
        CL_CMDS["commands/*.md"]
        CL_SETTINGS["settings.json"]
        CL_MCP["mcp.json"]
        CL_ENTRY["CLAUDE.md (root)"]
        
        CL_ROOT --> CL_SKILLS
        CL_ROOT --> CL_AGENTS
        CL_ROOT --> CL_CMDS
        CL_ROOT --> CL_SETTINGS
        CL_ROOT --> CL_MCP
    end
    
    subgraph Factory["Factory Output"]
        F_ROOT[".factory/"]
        F_SKILLS["skills/*/SKILL.md"]
        F_DROIDS["droids/*.md"]
        F_CMDS["commands/*.md"]
        F_SETTINGS["settings.json"]
        F_MCP["mcp.json"]
        F_ENTRY["AGENTS.md (root)"]
        
        F_ROOT --> F_SKILLS
        F_ROOT --> F_DROIDS
        F_ROOT --> F_CMDS
        F_ROOT --> F_SETTINGS
        F_ROOT --> F_MCP
    end
```

## Content Mapping

```text
              GENERIC CONTENT                    PLATFORM OUTPUT
    ┌─────────────────────────────┐
    │           Rules             │
    └──────────────┬──────────────┘
                   │
    ┌──────────────┼──────────────┬─────────────────────┐
    │              │              │                     │
    ▼              ▼              ▼                     │
.cursor/       .claude/       .factory/                 │
rules/*.mdc    skills/*/      skills/*/                 │
               SKILL.md       SKILL.md                  │
                                                        │
    ┌─────────────────────────────┐                     │
    │         Personas            │                     │
    └──────────────┬──────────────┘                     │
                   │                                    │
    ┌──────────────┴──────────────┐                     │
    │                             │                     │
    ▼                             ▼                     │
.claude/                      .factory/                 │
agents/*.md                   droids/*.md               │
                                                        │
    ┌─────────────────────────────┐                     │
    │         Commands            │                     │
    └──────────────┬──────────────┘                     │
                   │                                    │
    ┌──────────────┴──────────────┐                     │
    │                             │                     │
    ▼                             ▼                     │
.claude/                      .factory/                 │
commands/*.md                 commands/*.md             │
                                                        │
    ┌─────────────────────────────┐                     │
    │           Hooks             │                     │
    └──────────────┬──────────────┘                     │
                   │                                    │
    ┌──────────────┴──────────────┐                     │
    │                             │                     │
    ▼                             ▼                     │
.claude/                      .factory/                 │
settings.json                 settings.json             │
(hooks section)               (hooks section)           │
```

```mermaid
flowchart LR
    subgraph Generic["Generic Content"]
        RULES[Rules]
        PERSONAS[Personas]
        COMMANDS[Commands]
        HOOKS[Hooks]
    end
    
    subgraph Cursor["Cursor"]
        C_RULES[".cursor/rules/*.mdc"]
    end
    
    subgraph Claude["Claude Code"]
        CL_SKILLS[".claude/skills/"]
        CL_AGENTS[".claude/agents/"]
        CL_CMDS[".claude/commands/"]
        CL_HOOKS[".claude/settings.json"]
    end
    
    subgraph Factory["Factory"]
        F_SKILLS[".factory/skills/"]
        F_DROIDS[".factory/droids/"]
        F_CMDS[".factory/commands/"]
        F_HOOKS[".factory/settings.json"]
    end
    
    RULES --> C_RULES
    RULES --> CL_SKILLS
    RULES --> F_SKILLS
    
    PERSONAS --> CL_AGENTS
    PERSONAS --> F_DROIDS
    
    COMMANDS --> CL_CMDS
    COMMANDS --> F_CMDS
    
    HOOKS --> CL_HOOKS
    HOOKS --> F_HOOKS
```

## Generator Options

```typescript
interface GeneratorOptions {
  outputDir?: string;      // Output directory (defaults to project root)
  clean?: boolean;         // Clean existing files before generating
  addHeaders?: boolean;    // Add "do not edit" headers
  dryRun?: boolean;        // Don't write files
  verbose?: boolean;       // Verbose output
}
```

## GenerateResult Structure

```typescript
interface GenerateResult {
  files: string[];         // Files created or updated
  deleted: string[];       // Files deleted (if clean mode)
  warnings: string[];      // Warnings encountered
  generated?: GeneratedFile[]; // File contents (for dry-run)
}

interface GeneratedFile {
  path: string;            // Relative path from output directory
  content: string;         // File content
  type: 'rule' | 'persona' | 'command' | 'hook' | 'config' | 'entrypoint';
}
```

## Platform-Specific Transformations

### Cursor Rules (.mdc)

```text
GENERIC RULE                              CURSOR .mdc OUTPUT
─────────────                             ──────────────────
┌─────────────────────┐                   ┌─────────────────────┐
│ name: my-rule       │                   │ ---                 │
│ description: ...    │─────────────────▶ │ description: ...    │
│ always_apply: true  │                   │ alwaysApply: true   │
│ globs: ['*.ts']     │                   │ globs:              │
│ ---                 │                   │   - "*.ts"          │
│ Content body        │                   │ ---                 │
└─────────────────────┘                   │ Content body        │
                                          └─────────────────────┘
```

```mermaid
flowchart LR
    subgraph Input["Generic Rule"]
        I_NAME[name]
        I_DESC[description]
        I_APPLY[always_apply]
        I_GLOBS[globs]
        I_BODY[content]
    end
    
    subgraph Output["Cursor .mdc"]
        O_FM["---<br/>description: ...<br/>alwaysApply: ...<br/>globs: [...]<br/>---"]
        O_BODY["Markdown body"]
    end
    
    I_DESC --> O_FM
    I_APPLY --> O_FM
    I_GLOBS --> O_FM
    I_BODY --> O_BODY
```

### Claude/Factory Skills

```text
GENERIC PERSONA                           AGENT/DROID OUTPUT
───────────────                           ──────────────────
┌─────────────────────┐                   ┌─────────────────────┐
│ name: architect     │                   │ ---                 │
│ tools: [read, write]│─────────────────▶ │ name: architect     │
│ model: powerful     │                   │ tools:              │
│ ---                 │                   │   - Read            │
│ Instructions...     │                   │   - Write           │
└─────────────────────┘                   │ model: claude-opus..│
                                          │ ---                 │
                                          │ Instructions...     │
                                          └─────────────────────┘
```

```mermaid
flowchart LR
    subgraph Input["Generic Rule"]
        I_NAME[name]
        I_DESC[description]
        I_EXP[expertise]
        I_BODY[content]
    end
    
    subgraph Output["SKILL.md"]
        O_TITLE["# Skill Name"]
        O_DESC["Description"]
        O_KEYWORDS["Keywords"]
        O_INST["Instructions"]
    end
    
    I_NAME --> O_TITLE
    I_DESC --> O_DESC
    I_EXP --> O_KEYWORDS
    I_BODY --> O_INST
```

### Claude/Factory Personas

```mermaid
flowchart LR
    subgraph Input["Generic Persona"]
        I_NAME[name]
        I_DESC[description]
        I_TOOLS[tools]
        I_MODEL[model]
        I_BODY[content]
    end
    
    subgraph Output["Agent/Droid .md"]
        O_FM["---<br/>name: ...<br/>tools: [...]<br/>model: ...<br/>---"]
        O_BODY["Instructions"]
    end
    
    I_NAME --> O_FM
    I_TOOLS --> O_FM
    I_MODEL --> O_FM
    I_BODY --> O_BODY
```
