# ai-tool-sync Architecture Overview

This document provides a high-level overview of the ai-tool-sync architecture, a tool for synchronizing AI tool configurations across multiple platforms (Cursor, Claude Code, Factory).

## Core Concept

ai-tool-sync acts as a configuration synchronization layer that transforms a single source of truth into platform-specific outputs.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SOURCE (.ai-tool-sync/)                              │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────────────────┤
│ config.yaml │  rules/*.md │personas/*.md│commands/*.md│    hooks/*.md       │
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴──────────┬──────────┘
       │             │             │             │                 │
       └─────────────┴──────┬──────┴─────────────┴─────────────────┘
                            │
                            ▼
       ┌────────────────────────────────────────────────────────────┐
       │                   PROCESSING LAYER                         │
       ├────────────────┬───────────────────┬───────────────────────┤
       │ Content Loaders│     Parsers       │   Content Resolver    │
       └───────┬────────┴─────────┬─────────┴───────────┬───────────┘
               │                  │                     │
               └──────────────────┼─────────────────────┘
                                  │
                                  ▼
       ┌────────────────────────────────────────────────────────────┐
       │                   GENERATION LAYER                         │
       ├──────────────────┬──────────────────┬──────────────────────┤
       │ Cursor Generator │ Claude Generator │  Factory Generator   │
       └────────┬─────────┴────────┬─────────┴──────────┬───────────┘
                │                  │                    │
                ▼                  ▼                    ▼
       ┌────────────────┐ ┌────────────────┐ ┌──────────────────────┐
       │.cursor/rules/  │ │.claude/skills/ │ │ .factory/skills/     │
       │    *.mdc       │ │  CLAUDE.md     │ │   AGENTS.md          │
       └────────────────┘ └────────────────┘ └──────────────────────┘
```

```mermaid
flowchart TB
    subgraph Source["Source (.ai-tool-sync/)"]
        CONFIG[config.yaml]
        RULES[rules/*.md]
        PERSONAS[personas/*.md]
        COMMANDS[commands/*.md]
        HOOKS[hooks/*.md]
    end
    
    subgraph Processing["Processing Layer"]
        LOADER[Content Loaders]
        PARSER[Parsers]
        RESOLVER[Content Resolver]
    end
    
    subgraph Generation["Generation Layer"]
        GEN_CURSOR[Cursor Generator]
        GEN_CLAUDE[Claude Generator]
        GEN_FACTORY[Factory Generator]
    end
    
    subgraph Output["Generated Output"]
        OUT_CURSOR[".cursor/rules/*.mdc"]
        OUT_CLAUDE[".claude/skills/*/SKILL.md<br/>CLAUDE.md"]
        OUT_FACTORY[".factory/skills/*<br/>AGENTS.md"]
    end
    
    CONFIG --> LOADER
    RULES --> LOADER
    PERSONAS --> LOADER
    COMMANDS --> LOADER
    HOOKS --> LOADER
    
    LOADER --> PARSER
    PARSER --> RESOLVER
    
    RESOLVER --> GEN_CURSOR
    RESOLVER --> GEN_CLAUDE
    RESOLVER --> GEN_FACTORY
    
    GEN_CURSOR --> OUT_CURSOR
    GEN_CLAUDE --> OUT_CLAUDE
    GEN_FACTORY --> OUT_FACTORY
```

## Module Structure

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLI LAYER                                      │
│                           (src/cli/)                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  index.ts ──┬── commands/sync.ts                                            │
│             ├── commands/init.ts                                            │
│             ├── commands/validate.ts                                        │
│             ├── commands/convert.ts                                         │
│             └── commands/watch.ts                                           │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
          ▼                        ▼                        ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   CONFIG LAYER      │  │   LOADERS LAYER     │  │  GENERATORS LAYER   │
│   (src/config/)     │  │   (src/loaders/)    │  │  (src/generators/)  │
├─────────────────────┤  ├─────────────────────┤  ├─────────────────────┤
│ • loader.ts         │  │ • base.ts           │  │ • base.ts           │
│ • types.ts          │  │ • local.ts          │  │ • cursor.ts         │
└─────────────────────┘  │ • git.ts            │  │ • claude.ts         │
                         │ • npm.ts            │  │ • factory.ts        │
                         │ • pip.ts            │  └─────────────────────┘
                         │ • url.ts            │
                         │ • plugin.ts         │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   PARSERS LAYER     │
                         │   (src/parsers/)    │
                         ├─────────────────────┤
                         │ • types.ts          │
                         │ • frontmatter.ts    │
                         │ • rule.ts           │
                         │ • persona.ts        │
                         │ • command.ts        │
                         │ • hook.ts           │
                         │ • mcp.ts            │
                         └─────────────────────┘
```

```mermaid
graph TB
    subgraph CLI["CLI Layer (src/cli/)"]
        MAIN[index.ts]
        CMD_SYNC[commands/sync.ts]
        CMD_INIT[commands/init.ts]
        CMD_VALIDATE[commands/validate.ts]
        CMD_CONVERT[commands/convert.ts]
        CMD_WATCH[commands/watch.ts]
    end
    
    subgraph Config["Configuration (src/config/)"]
        CFG_LOADER[loader.ts]
        CFG_TYPES[types.ts]
    end
    
    subgraph Parsers["Parsers (src/parsers/)"]
        P_RULE[rule.ts]
        P_PERSONA[persona.ts]
        P_COMMAND[command.ts]
        P_HOOK[hook.ts]
        P_FRONTMATTER[frontmatter.ts]
        P_TYPES[types.ts]
    end
    
    subgraph Loaders["Loaders (src/loaders/)"]
        L_BASE[base.ts]
        L_LOCAL[local.ts]
        L_GIT[git.ts]
        L_NPM[npm.ts]
        L_URL[url.ts]
        L_PLUGIN[plugin.ts]
    end
    
    subgraph Generators["Generators (src/generators/)"]
        G_BASE[base.ts]
        G_CURSOR[cursor.ts]
        G_CLAUDE[claude.ts]
        G_FACTORY[factory.ts]
    end
    
    subgraph Converters["Converters (src/converters/)"]
        C_TYPES[types.ts]
        C_CURSOR[cursor.ts]
        C_CLAUDE[claude.ts]
        C_FACTORY[factory.ts]
    end
    
    MAIN --> CMD_SYNC
    MAIN --> CMD_INIT
    MAIN --> CMD_VALIDATE
    MAIN --> CMD_CONVERT
    MAIN --> CMD_WATCH
    
    CMD_SYNC --> CFG_LOADER
    CMD_SYNC --> L_LOCAL
    CMD_SYNC --> G_BASE
    
    L_LOCAL --> P_RULE
    L_LOCAL --> P_PERSONA
    L_LOCAL --> P_COMMAND
    L_LOCAL --> P_HOOK
    
    G_CURSOR --> P_TYPES
    G_CLAUDE --> P_TYPES
    G_FACTORY --> P_TYPES
```



## Directory Structure

```text
src/
├── cli/                    # Command-line interface
│   ├── index.ts           # CLI entry point (Commander.js)
│   └── commands/          # Individual commands
│       ├── sync.ts        # Main sync operation
│       ├── init.ts        # Project initialization
│       ├── validate.ts    # Config validation
│       ├── convert.ts     # Platform import
│       ├── watch.ts       # File watching
│       ├── status.ts      # Status display
│       ├── clean.ts       # Clean generated files
│       ├── lint.ts        # Lint content files
│       └── plugins.ts     # Plugin management
├── config/                 # Configuration handling
│   ├── types.ts           # Config type definitions
│   └── loader.ts          # Config file loading
├── parsers/                # Content parsers
│   ├── types.ts           # Shared parser types
│   ├── frontmatter.ts     # YAML frontmatter parsing
│   ├── rule.ts            # Rule parser
│   ├── persona.ts         # Persona parser
│   ├── command.ts         # Command parser
│   ├── hook.ts            # Hook parser
│   └── mcp.ts             # MCP config parser
├── loaders/                # Content loaders
│   ├── base.ts            # Loader interface & types
│   ├── local.ts           # Local filesystem loader
│   ├── git.ts             # Git repository loader
│   ├── npm.ts             # NPM package loader
│   ├── pip.ts             # Python package loader
│   ├── url.ts             # URL loader
│   └── plugin.ts          # Plugin orchestrator
├── generators/             # Output generators
│   ├── base.ts            # Generator interface & helpers
│   ├── cursor.ts          # Cursor IDE generator
│   ├── claude.ts          # Claude Code generator
│   ├── factory.ts         # Factory generator
│   └── subfolder-context.ts # Monorepo support
├── converters/             # Platform importers
│   ├── types.ts           # Converter types
│   ├── cursor.ts          # Import from Cursor
│   ├── claude.ts          # Import from Claude
│   └── factory.ts         # Import from Factory
├── transformers/           # Data transformers
│   ├── frontmatter.ts     # Frontmatter serialization
│   ├── model-mapper.ts    # Model name mapping
│   └── tool-mapper.ts     # Tool name mapping
└── utils/                  # Utilities
    ├── fs.ts              # File system helpers
    ├── result.ts          # Result type (Ok/Err)
    └── plugin-cache.ts    # Plugin caching
```

## Key Design Principles

1. **Single Source of Truth**: All AI tool configurations live in `.ai-tool-sync/`
2. **Platform Abstraction**: Generic format with platform-specific extensions
3. **Extensible Loaders**: Support for local, git, npm, pip, and URL sources
4. **Pluggable Generators**: Each target platform has its own generator
5. **Bi-directional Conversion**: Import existing configs via converters
6. **Validation First**: All content validated before generation
7. **Dry-run Support**: Preview changes without writing files

