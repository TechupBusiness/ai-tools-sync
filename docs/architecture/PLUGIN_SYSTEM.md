# Plugin System Architecture

This document describes how the plugin system works in ai-tool-sync.

## Plugin Overview

Plugins allow external sources of rules, personas, commands, and hooks to be integrated into a project.

```text
                              PLUGIN SOURCES
    ┌───────────────┬───────────────┬───────────────┬───────────────┐
    │ Git Repos     │ NPM Packages  │Python Packages│ Remote URLs   │
    │ (github:)     │ (npm:)        │ (pip:)        │ (https:)      │
    └───────┬───────┴───────┬───────┴───────┬───────┴───────┬───────┘
            │               │               │               │
            └───────────────┴───────┬───────┴───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │       SOURCE RESOLUTION       │
                    │   (detect loader by prefix)   │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │         FETCH/CLONE           │
                    │    (download to cache)        │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │         PLUGIN CACHE          │
                    │   ~/.ai-tool-sync/plugins/    │
                    │   • Version management        │
                    │   • Auto-refresh              │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │     VALIDATE & LOAD           │
                    │   • Check structure           │
                    │   • Parse content             │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │        INTEGRATION            │
                    │   • Merge with local          │
                    │   • Apply include/exclude     │
                    │   • Handle overrides          │
                    └───────────────────────────────┘
```

```mermaid
flowchart TB
    subgraph Sources["Plugin Sources"]
        GIT[Git Repositories]
        NPM[NPM Packages]
        PIP[Python Packages]
        URL[Remote URLs]
        LOCAL[Local Paths]
    end
    
    subgraph Cache["Plugin Cache"]
        CACHE_DIR["~/.ai-tool-sync/plugins/"]
        VERSION[Version Management]
        REFRESH[Auto-refresh]
    end
    
    subgraph Loading["Plugin Loading"]
        RESOLVE[Source Resolution]
        FETCH[Fetch/Clone]
        VALIDATE[Validate Structure]
        LOAD[Load Content]
    end
    
    subgraph Integration["Integration"]
        MERGE[Merge with Local]
        FILTER[Apply Filters]
        OVERRIDE[Handle Overrides]
    end
    
    GIT --> RESOLVE
    NPM --> RESOLVE
    PIP --> RESOLVE
    URL --> RESOLVE
    LOCAL --> RESOLVE
    
    RESOLVE --> FETCH
    FETCH --> CACHE_DIR
    CACHE_DIR --> VALIDATE
    VALIDATE --> LOAD
    
    LOAD --> MERGE
    MERGE --> FILTER
    FILTER --> OVERRIDE
```

## Plugin Configuration

```yaml
use:
  plugins:
    - name: typescript-rules
      source: github:company/ts-rules
      version: v2.0.0
      enabled: true
      include:
        - "rules/*"
        - "personas/architect.md"
      exclude:
        - "rules/legacy-*"
    
    - name: security-policies
      source: npm:@company/security-rules
      version: ^1.0.0
      enabled: true
```

## Source Resolution

```text
                        SOURCE STRING
                             │
                             ▼
               ┌─────────────────────────────┐
               │      DETECT PREFIX          │
               └─────────────┬───────────────┘
                             │
    ┌────────────┬───────────┼───────────┬────────────┐
    │            │           │           │            │
    ▼            ▼           ▼           ▼            ▼
"github:"    "gitlab:"    "npm:"     "pip:"      "https:"
"git:"                                            "./"
    │            │           │           │            │
    ▼            ▼           ▼           ▼            ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│   Git   │ │   Git   │ │   NPM   │ │   Pip   │ │  URL/   │
│ Loader  │ │ Loader  │ │ Loader  │ │ Loader  │ │ Local   │
└────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
     │           │           │           │            │
     └───────────┴───────────┴─────┬─────┴────────────┘
                                   │
                                   ▼
                          ┌───────────────┐
                          │ Load Content  │
                          └───────────────┘
```

```mermaid
flowchart TB
    SOURCE[Source String] --> DETECT{Detect Type}
    
    DETECT -->|"github:"| GIT_LOADER[GitLoader]
    DETECT -->|"gitlab:"| GIT_LOADER
    DETECT -->|"npm:"| NPM_LOADER[NpmLoader]
    DETECT -->|"pip:"| PIP_LOADER[PipLoader]
    DETECT -->|"https:"| URL_LOADER[UrlLoader]
    DETECT -->|"./"| LOCAL_LOADER[LocalLoader]
    
    GIT_LOADER --> CONTENT[Load Content]
    NPM_LOADER --> CONTENT
    PIP_LOADER --> CONTENT
    URL_LOADER --> CONTENT
    LOCAL_LOADER --> CONTENT
```

## Plugin Directory Structure

```text
plugin-root/
├── manifest.yaml          # Optional plugin metadata
├── policies/              # Policy rules (must-do)
│   └── *.md
├── skills/                # Skill rules (can-do)
│   └── *.md
├── rules/                 # Alternative rules location
│   └── *.md
├── personas/
│   └── *.md
├── commands/
│   └── *.md
└── hooks/
    └── *.md
```

## Caching Strategy

```text
CLI                 PluginCache              PluginLoader            Remote Source
 │                      │                        │                        │
 │  Check cache         │                        │                        │
 │─────────────────────▶│                        │                        │
 │                      │                        │                        │
 │  ┌─────────────────────────────────────────────────────────────────┐  │
 │  │ IF cache hit AND valid:                                         │  │
 │  │                                                                 │  │
 │  │   Return cached   │                        │                    │  │
 │  │◀──────────────────│                        │                    │  │
 │  │                                                                 │  │
 │  └─────────────────────────────────────────────────────────────────┘  │
 │                      │                        │                        │
 │  ┌─────────────────────────────────────────────────────────────────┐  │
 │  │ ELSE (cache miss or stale):                                     │  │
 │  │                   │                        │                    │  │
 │  │   Load plugin     │                        │                    │  │
 │  │ ──────────────────────────────────────────▶│                    │  │
 │  │                   │                        │                    │  │
 │  │                   │                        │  Fetch content     │  │
 │  │                   │                        │───────────────────▶│  │
 │  │                   │                        │                    │  │
 │  │                   │                        │◀───────────────────│  │
 │  │                   │                        │                    │  │
 │  │                   │   Store in cache       │                    │  │
 │  │                   │◀───────────────────────│                    │  │
 │  │                   │                        │                    │  │
 │  │   Return content  │                        │                    │  │
 │  │◀──────────────────────────────────────────│                    │  │
 │  │                                                                 │  │
 │  └─────────────────────────────────────────────────────────────────┘  │
```

```mermaid
sequenceDiagram
    participant CLI as CLI
    participant Cache as PluginCache
    participant Loader as PluginLoader
    participant Remote as Remote Source
    
    CLI->>Cache: Check cache
    
    alt Cache hit and valid
        Cache-->>CLI: Return cached content
    else Cache miss or stale
        CLI->>Loader: Load plugin
        Loader->>Remote: Fetch content
        Remote-->>Loader: Content
        Loader->>Cache: Store in cache
        Loader-->>CLI: Return content
    end
```

## Version Specifications

| Version Spec | Behavior |
|--------------|----------|
| `v1.0.0` | Exact version tag |
| `^1.0.0` | Compatible version (semver) |
| `~1.0.0` | Patch updates only |
| `latest` | Latest available |
| `main` | Git branch name |
| `abc123` | Git commit hash |

## Plugin Load Sequence

```text
┌─────────────────┐
│  Start Plugin   │
│     Load        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Check Cache    │────▶│   Cache Hit?    │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                   YES                        NO
                    │                         │
                    ▼                         ▼
           ┌───────────────┐         ┌───────────────┐
           │Validate Cache │         │Fetch from     │
           │  (version)    │         │Source         │
           └───────┬───────┘         └───────┬───────┘
                   │                         │
              ┌────┴────┐                    │
              │         │                    │
            Valid    Invalid                 │
              │         │                    │
              │         └────────────────────┤
              │                              │
              ▼                              ▼
     ┌───────────────┐              ┌───────────────┐
     │ Use Cached    │              │ Store in      │
     │ Content       │              │ Cache         │
     └───────┬───────┘              └───────┬───────┘
             │                              │
             └──────────────┬───────────────┘
                            │
                            ▼
                   ┌───────────────┐
                   │ Parse Content │
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐
                   │Apply Include/ │
                   │Exclude Filters│
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐
                   │ Merge with    │
                   │ Project       │
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐
                   │     Done      │
                   └───────────────┘
```

```mermaid
flowchart TB
    START[Start Plugin Load] --> CHECK{Check Cache}
    
    CHECK -->|Hit| VALIDATE_CACHE[Validate Cache]
    CHECK -->|Miss| FETCH[Fetch from Source]
    
    VALIDATE_CACHE -->|Valid| USE_CACHE[Use Cached Content]
    VALIDATE_CACHE -->|Invalid| FETCH
    
    FETCH --> CLONE[Clone/Download]
    CLONE --> CACHE[Store in Cache]
    CACHE --> PARSE[Parse Content]
    
    USE_CACHE --> PARSE
    
    PARSE --> FILTER[Apply Include/Exclude]
    FILTER --> MERGE[Merge with Project]
    MERGE --> DONE[Done]
```
