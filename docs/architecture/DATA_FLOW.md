# Data Flow Architecture

This document describes how data flows through the ai-tool-sync system during different operations.

## Sync Operation Flow

The main sync operation follows this sequence:

```text
┌──────────┐     ┌──────────────┐     ┌─────────────────┐     ┌────────────────┐
│   CLI    │────▶│ Config Loader│────▶│ Content Loaders │────▶│    Parsers     │
│ (sync)   │     │              │     │                 │     │                │
└──────────┘     └──────────────┘     └─────────────────┘     └───────┬────────┘
                                                                      │
     ┌────────────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────┐     ┌─────────────────┐     ┌──────────────────────┐
│Content Resolver│────▶│   Generators    │────▶│    File System       │
│  (merge/dedupe)│     │ (per platform)  │     │  (write outputs)     │
└────────────────┘     └─────────────────┘     └──────────────────────┘
```

```text
CLI (sync)          Config Loader      Content Loaders       Parsers          Generators        File System
    │                    │                   │                  │                 │                 │
    │  Load config.yaml  │                   │                  │                 │                 │
    │───────────────────▶│                   │                  │                 │                 │
    │                    │                   │                  │                 │                 │
    │   Config object    │                   │                  │                 │                 │
    │◀───────────────────│                   │                  │                 │                 │
    │                    │                   │                  │                 │                 │
    │         Load content directories       │                  │                 │                 │
    │───────────────────────────────────────▶│                  │                 │                 │
    │                    │                   │                  │                 │                 │
    │                    │                   │  Read *.md files │                 │                 │
    │                    │                   │─────────────────▶│                 │                 │
    │                    │                   │                  │                 │                 │
    │                    │                   │  ParsedContent[] │                 │                 │
    │                    │                   │◀─────────────────│                 │                 │
    │                    │                   │                  │                 │                 │
    │              LoadResult                │                  │                 │                 │
    │◀───────────────────────────────────────│                  │                 │                 │
    │                    │                   │                  │                 │                 │
    │                    │                   │                  │                 │                 │
    │                           Generate for each target platform                 │                 │
    │────────────────────────────────────────────────────────────────────────────▶│                 │
    │                    │                   │                  │                 │                 │
    │                    │                   │                  │                 │  Write files    │
    │                    │                   │                  │                 │────────────────▶│
    │                    │                   │                  │                 │                 │
    │                    │                   │                  │                 │    Success      │
    │                    │                   │                  │                 │◀────────────────│
    │                    │                   │                  │                 │                 │
    │                                   GenerateResult                            │                 │
    │◀────────────────────────────────────────────────────────────────────────────│                 │
    │                    │                   │                  │                 │                 │
```

```mermaid
sequenceDiagram
    participant CLI as CLI (sync)
    participant Config as Config Loader
    participant Loader as Content Loaders
    participant Parser as Parsers
    participant Resolver as Content Resolver
    participant Generator as Generators
    participant FS as File System
    
    CLI->>Config: Load config.yaml
    Config-->>CLI: Config object
    
    CLI->>Loader: Load content directories
    
    loop For each content type
        Loader->>FS: Read markdown files
        FS-->>Loader: File contents
        Loader->>Parser: Parse frontmatter + body
        Parser-->>Loader: ParsedContent
    end
    
    Loader-->>CLI: LoadResult
    
    CLI->>Resolver: Resolve content (merge, dedupe)
    Resolver-->>CLI: ResolvedContent
    
    loop For each target platform
        CLI->>Generator: Generate output
        Generator->>FS: Write platform files
        FS-->>Generator: Success
        Generator-->>CLI: GenerateResult
    end
    
    CLI-->>CLI: Display summary
```

## Content Loading Pipeline

```text
                              INPUT SOURCES
    ┌───────────────────┬───────────────────┬───────────────────┐
    │ Local             │ Built-in          │ External          │
    │ .ai-tool-sync/    │ Defaults          │ Plugins           │
    └─────────┬─────────┴─────────┬─────────┴─────────┬─────────┘
              │                   │                   │
              ▼                   ▼                   ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                     CONTENT LOADERS                         │
    ├───────────┬───────────┬───────────┬───────────┬─────────────┤
    │LocalLoader│ GitLoader │ NpmLoader │ PipLoader │  UrlLoader  │
    └─────┬─────┴─────┬─────┴─────┬─────┴─────┬─────┴──────┬──────┘
          │           │           │           │            │
          └───────────┴───────────┼───────────┴────────────┘
                                  │
                                  ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                    PARSING PIPELINE                         │
    ├─────────────────────────────────────────────────────────────┤
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
    │  │  Frontmatter │─▶│  Validation  │─▶│   Apply      │       │
    │  │    Parser    │  │              │  │   Defaults   │       │
    │  └──────────────┘  └──────────────┘  └──────────────┘       │
    └────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                       LOAD RESULT                           │
    ├───────────────┬───────────────┬───────────────┬─────────────┤
    │ ParsedRule[]  │ParsedPersona[]│ParsedCommand[]│ParsedHook[] │
    └───────────────┴───────────────┴───────────────┴─────────────┘
```

```mermaid
flowchart TB
    subgraph Input["Input Sources"]
        LOCAL[Local .ai-tool-sync/]
        DEFAULTS[Built-in Defaults]
        PLUGINS[External Plugins]
    end
    
    subgraph Loaders["Content Loaders"]
        L_LOCAL[LocalLoader]
        L_GIT[GitLoader]
        L_NPM[NpmLoader]
        L_PIP[PipLoader]
        L_URL[UrlLoader]
    end
    
    subgraph Parsing["Parsing Pipeline"]
        FM[Frontmatter Parser]
        VAL[Validation]
        DEF[Apply Defaults]
    end
    
    subgraph Output["LoadResult"]
        RULES[ParsedRule[]]
        PERSONAS[ParsedPersona[]]
        COMMANDS[ParsedCommand[]]
        HOOKS[ParsedHook[]]
    end
    
    LOCAL --> L_LOCAL
    DEFAULTS --> L_LOCAL
    PLUGINS --> L_GIT
    PLUGINS --> L_NPM
    PLUGINS --> L_PIP
    PLUGINS --> L_URL
    
    L_LOCAL --> FM
    L_GIT --> FM
    L_NPM --> FM
    L_PIP --> FM
    L_URL --> FM
    
    FM --> VAL
    VAL --> DEF
    
    DEF --> RULES
    DEF --> PERSONAS
    DEF --> COMMANDS
    DEF --> HOOKS
```

## Generation Pipeline

```text
                            RESOLVED CONTENT
    ┌─────────────────────────────────────────────────────────────┐
    │ rules │ personas │ commands │ hooks │ mcpConfig │ settings  │
    └───────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                  filterContentByTarget()                    │
    │            (filters by targets: [] in frontmatter)          │
    └───────────────────────────┬─────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
          ▼                     ▼                     ▼
    ┌───────────────┐   ┌───────────────┐   ┌───────────────────┐
    │    CURSOR     │   │    CLAUDE     │   │     FACTORY       │
    │   GENERATOR   │   │   GENERATOR   │   │    GENERATOR      │
    ├───────────────┤   ├───────────────┤   ├───────────────────┤
    │ • .mdc rules  │   │ • skills/     │   │ • skills/         │
    │               │   │ • agents/     │   │ • droids/         │
    │               │   │ • commands/   │   │ • commands/       │
    │               │   │ • settings.json   │ • settings.json   │
    │               │   │ • CLAUDE.md   │   │ • AGENTS.md       │
    │               │   │ • mcp.json    │   │ • mcp.json        │
    └───────┬───────┘   └───────┬───────┘   └─────────┬─────────┘
            │                   │                     │
            ▼                   ▼                     ▼
    ┌───────────────┐   ┌───────────────┐   ┌───────────────────┐
    │.cursor/rules/ │   │   .claude/    │   │    .factory/      │
    │   *.mdc       │   │   CLAUDE.md   │   │    AGENTS.md      │
    └───────────────┘   └───────────────┘   └───────────────────┘
```

```mermaid
flowchart TB
    subgraph Input["ResolvedContent"]
        RC_RULES[rules]
        RC_PERSONAS[personas]
        RC_COMMANDS[commands]
        RC_HOOKS[hooks]
        RC_MCP[mcpConfig]
        RC_SETTINGS[platformSettings]
    end
    
    subgraph Filter["Target Filtering"]
        FILTER[filterContentByTarget]
    end
    
    subgraph CursorGen["Cursor Generator"]
        C_RULES[Generate .mdc rules]
        C_ENTRY[No entry point]
    end
    
    subgraph ClaudeGen["Claude Generator"]
        CL_SKILLS[Generate skills/]
        CL_AGENTS[Generate agents/]
        CL_COMMANDS[Generate commands/]
        CL_SETTINGS[Generate settings.json]
        CL_ENTRY[Generate CLAUDE.md]
        CL_MCP[Generate mcp.json]
    end
    
    subgraph FactoryGen["Factory Generator"]
        F_SKILLS[Generate skills/]
        F_DROIDS[Generate droids/]
        F_COMMANDS[Generate commands/]
        F_SETTINGS[Generate settings.json]
        F_ENTRY[Generate AGENTS.md]
        F_MCP[Generate mcp.json]
    end
    
    RC_RULES --> FILTER
    RC_PERSONAS --> FILTER
    RC_COMMANDS --> FILTER
    RC_HOOKS --> FILTER
    
    FILTER --> CursorGen
    FILTER --> ClaudeGen
    FILTER --> FactoryGen
    
    RC_MCP --> ClaudeGen
    RC_MCP --> FactoryGen
    RC_SETTINGS --> ClaudeGen
    RC_SETTINGS --> FactoryGen
```

## Convert Operation Flow

```text
CLI (convert)        Platform Detector      Converter           File Writer
    │                      │                    │                    │
    │  Scan for platform   │                    │                    │
    │  files               │                    │                    │
    │─────────────────────▶│                    │                    │
    │                      │                    │                    │
    │  PlatformFileInput[] │                    │                    │
    │◀─────────────────────│                    │                    │
    │                      │                    │                    │
    │     ┌────────────────────────────────────────────────────┐    │
    │     │  For each platform file:                           │    │
    │     │                                                    │    │
    │     │     Convert to generic                             │    │
    │     │ ───────────────────────▶│                          │    │
    │     │                         │                          │    │
    │     │                         │  Parse platform format   │    │
    │     │                         │  Map to generic schema   │    │
    │     │                         │                          │    │
    │     │     GenericConversion   │                          │    │
    │     │ ◀───────────────────────│                          │    │
    │     │                         │                          │    │
    │     └────────────────────────────────────────────────────┘    │
    │                      │                    │                    │
    │     Write to .ai-tool-sync/              │                    │
    │───────────────────────────────────────────────────────────────▶│
    │                      │                    │                    │
    │     Success          │                    │                    │
    │◀───────────────────────────────────────────────────────────────│
```

```mermaid
sequenceDiagram
    participant CLI as CLI (convert)
    participant Detector as Platform Detector
    participant Converter as Platform Converter
    participant Writer as File Writer
    
    CLI->>Detector: Detect platform files
    Detector-->>CLI: PlatformFileInput[]
    
    loop For each platform file
        CLI->>Converter: Convert to generic
        Converter->>Converter: Parse platform format
        Converter->>Converter: Map to generic schema
        Converter-->>CLI: GenericConversion
    end
    
    loop For each conversion
        CLI->>Writer: Write to .ai-tool-sync/
        Writer-->>CLI: Success
    end
```

## File Processing Flow

```text
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│  Markdown File │────▶│   Raw Content  │────▶│ Split FM/Body  │
└────────────────┘     └────────────────┘     └───────┬────────┘
                                                      │
     ┌────────────────────────────────────────────────┘
     │
     ▼
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│   Parse YAML   │────▶│    Validate    │────▶│ Apply Defaults │
│   Frontmatter  │     │    Schema      │     │                │
└────────────────┘     └────────────────┘     └───────┬────────┘
                                                      │
     ┌────────────────────────────────────────────────┘
     │
     ▼
┌────────────────┐     ┌────────────────┐
│Apply Extensions│────▶│ ParsedContent  │
│   (platform)   │     │    Output      │
└────────────────┘     └────────────────┘
```

```mermaid
flowchart LR
    subgraph Read["Read Phase"]
        FILE[Markdown File]
        RAW[Raw Content]
    end
    
    subgraph Parse["Parse Phase"]
        SPLIT[Split Frontmatter/Body]
        YAML[Parse YAML]
        VALIDATE[Validate Schema]
    end
    
    subgraph Transform["Transform Phase"]
        DEFAULTS[Apply Defaults]
        EXTEND[Apply Extensions]
        RESOLVE[Resolve References]
    end
    
    subgraph Output["Output Phase"]
        PARSED[ParsedContent]
    end
    
    FILE --> RAW
    RAW --> SPLIT
    SPLIT --> YAML
    YAML --> VALIDATE
    VALIDATE --> DEFAULTS
    DEFAULTS --> EXTEND
    EXTEND --> RESOLVE
    RESOLVE --> PARSED
```

## Watch Mode Flow

```text
┌─────────────┐                          ┌─────────────┐
│   Watcher   │                          │   Sync      │
│  (chokidar) │                          │   Command   │
└──────┬──────┘                          └──────┬──────┘
       │                                        │
       │  Start watching .ai-tool-sync/         │
       │◀───────────────────────────────────────│
       │                                        │
       │  ┌─────────────────────────────────────────────┐
       │  │  On file change:                            │
       │  │                                             │
       │  │  File changed                               │
       │  │────────────────▶  Debouncer                 │
       │  │                      │                      │
       │  │                      │ Wait 300ms           │
       │  │                      │ (collect more)       │
       │  │                      │                      │
       │  │                      │ Trigger sync         │
       │  │                      │─────────────────────▶│
       │  │                      │                      │
       │  │                      │                      │ Regenerate
       │  │                      │                      │────────────▶
       │  │                      │                      │
       │  │                      │◀─────────────────────│ Complete
       │  │                                             │
       │  └─────────────────────────────────────────────┘
       │                                        │
```

```mermaid
sequenceDiagram
    participant Watch as Watcher
    participant Debounce as Debouncer
    participant Sync as Sync Command
    participant Gen as Generators
    
    Watch->>Watch: Start watching .ai-tool-sync/
    
    loop On file change
        Watch->>Debounce: File changed
        Debounce->>Debounce: Wait for more changes
        Debounce->>Sync: Trigger sync
        Sync->>Gen: Regenerate affected targets
        Gen-->>Sync: Complete
        Sync-->>Watch: Ready for next change
    end
```
