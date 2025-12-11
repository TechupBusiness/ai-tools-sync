# Core Data Structures

This document describes the key data structures used throughout ai-tool-sync.

## Content Type Hierarchy

ai-tool-sync manages four primary content types, all extending a common base:

```text
                    ┌─────────────────────────────────┐
                    │        BaseFrontmatter          │
                    ├─────────────────────────────────┤
                    │ + name: string                  │
                    │ + description?: string          │
                    │ + version?: string              │
                    │ + targets?: TargetType[]        │
                    │ + cursor?: CursorExtension      │
                    │ + claude?: ClaudeExtension      │
                    │ + factory?: FactoryExtension    │
                    └───────────────┬─────────────────┘
                                    │
        ┌───────────────┬───────────┴───────────┬───────────────┐
        │               │                       │               │
        ▼               ▼                       ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────────┐ ┌───────────────┐
│     Rule      │ │    Persona    │ │      Command      │ │     Hook      │
├───────────────┤ ├───────────────┤ ├───────────────────┤ ├───────────────┤
│ + kind?       │ │ + extends?    │ │ + execute?        │ │ + event       │
│ + always_apply│ │ + tools?      │ │ + args?           │ │ + match?      │
│ + when?       │ │ + model?      │ │ + globs?          │ │ + action?     │
│ + globs?      │ │ + traits?     │ │ + allowedTools?   │ │ + message?    │
│ + loading?    │ └───────────────┘ │ + variables?      │ │ + type?       │
│ + invocation? │                   └───────────────────┘ └───────────────┘
│ + expertise?  │
│ + requires?   │
│ + category?   │
│ + priority?   │
└───────────────┘
```

```mermaid
classDiagram
    class BaseFrontmatter {
        +string name
        +string description
        +string version
        +TargetType[] targets
        +CursorExtension cursor
        +ClaudeExtension claude
        +FactoryExtension factory
    }
    
    class Rule {
        +ContentKind kind
        +boolean always_apply
        +string when
        +string[] globs
        +LoadingConfig loading
        +SkillInvocation invocation
        +string[] expertise
        +string[] requires
        +RuleCategory category
        +RulePriority priority
    }
    
    class Persona {
        +string extends
        +PersonaTool[] tools
        +string model
        +Record traits
    }
    
    class Command {
        +string execute
        +CommandArg[] args
        +string[] globs
        +string[] allowedTools
        +CommandVariable[] variables
    }
    
    class Hook {
        +HookEvent event
        +string match
        +HookAction action
        +string message
        +HookType type
    }
    
    BaseFrontmatter <|-- Rule
    BaseFrontmatter <|-- Persona
    BaseFrontmatter <|-- Command
    BaseFrontmatter <|-- Hook
```

## Parsed Content Wrapper

All parsed content is wrapped in a generic structure:

```text
┌─────────────────────────────────────────────────────────────────┐
│                    ParsedContent<T>                             │
├─────────────────────────────────────────────────────────────────┤
│ + frontmatter: T        // Parsed YAML metadata                 │
│ + content: string       // Markdown body                        │
│ + filePath?: string     // Source file path                     │
└─────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────┬───────────┴───────────┬───────────────┐
        │               │                       │               │
        ▼               ▼                       ▼               ▼
  ParsedRule      ParsedPersona         ParsedCommand      ParsedHook
```

```mermaid
classDiagram
    class ParsedContent~T~ {
        +T frontmatter
        +string content
        +string filePath
    }
    
    class ParsedRule {
        +Rule frontmatter
        +string content
        +string filePath
    }
    
    class ParsedPersona {
        +Persona frontmatter
        +string content
        +string filePath
    }
    
    class ParsedCommand {
        +Command frontmatter
        +string content
        +string filePath
    }
    
    class ParsedHook {
        +Hook frontmatter
        +string content
        +string filePath
    }
    
    ParsedContent~T~ <|-- ParsedRule
    ParsedContent~T~ <|-- ParsedPersona
    ParsedContent~T~ <|-- ParsedCommand
    ParsedContent~T~ <|-- ParsedHook
```

## LoadResult Structure

Content loaders return this unified result:

```text
┌─────────────────────────────────────────────────────────────────┐
│                        LoadResult                               │
├─────────────────────────────────────────────────────────────────┤
│ + rules: ParsedRule[]                                           │
│ + personas: ParsedPersona[]                                     │
│ + commands: ParsedCommand[]                                     │
│ + hooks: ParsedHook[]                                           │
│ + mcpServers?: Record<string, McpServer>                        │
│ + errors?: LoadError[]                                          │
│ + source?: string                                               │
└───────────────────────────────────┬─────────────────────────────┘
                                    │
                                    │ extends
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ResolvedContent                            │
├─────────────────────────────────────────────────────────────────┤
│ + projectRoot: string                                           │
│ + projectName?: string                                          │
│ + mcpConfig?: McpConfig                                         │
│ + claudeSettings?: ClaudeSettingsConfig                         │
│ + factorySettings?: FactorySettingsConfig                       │
└─────────────────────────────────────────────────────────────────┘
```

```mermaid
classDiagram
    class LoadResult {
        +ParsedRule[] rules
        +ParsedPersona[] personas
        +ParsedCommand[] commands
        +ParsedHook[] hooks
        +McpServer[] mcpServers
        +LoadError[] errors
        +string source
    }
    
    class ResolvedContent {
        +string projectRoot
        +string projectName
        +McpConfig mcpConfig
        +ClaudeSettingsConfig claudeSettings
        +FactorySettingsConfig factorySettings
    }
    
    LoadResult <|-- ResolvedContent
```

## Platform Extensions

Each content type can have platform-specific overrides:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PlatformExtensions                                 │
└─────────────────────────────────────────────────────────────────────────────┘
        │                         │                         │
        ▼                         ▼                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│ CursorExtension │     │ ClaudeExtension │     │  FactoryExtension   │
├─────────────────┤     ├─────────────────┤     ├─────────────────────┤
│ + alwaysApply?  │     │ + import_as_    │     │ + allowed-tools?    │
│ + globs?        │     │     skill?      │     │ + tools?            │
│ + description?  │     │ + tools?        │     │ + model?            │
│ + allowedTools? │     │ + model?        │     │ + reasoningEffort?  │
└─────────────────┘     │ + action?       │     │ + variables?        │
                        │ + message?      │     └─────────────────────┘
                        │ + type?         │
                        │ + timeout?      │
                        └─────────────────┘
```

```mermaid
classDiagram
    class CursorExtension {
        +boolean alwaysApply
        +string[] globs
        +string description
        +string[] allowedTools
    }
    
    class ClaudeExtension {
        +boolean import_as_skill
        +string[] tools
        +string model
        +string action
        +string message
        +string type
        +number timeout
    }
    
    class FactoryExtension {
        +string[] allowed-tools
        +string[] tools
        +string model
        +string reasoningEffort
        +Variable[] variables
    }
    
    class PlatformExtensions {
        +CursorExtension cursor
        +ClaudeExtension claude
        +FactoryExtension factory
    }
    
    PlatformExtensions *-- CursorExtension
    PlatformExtensions *-- ClaudeExtension
    PlatformExtensions *-- FactoryExtension
```

## Type Enumerations

### Target Types

```typescript
type TargetType = 'cursor' | 'claude' | 'factory';
```

### Content Kind

```typescript
type ContentKind = 'policy' | 'skill';
// policy: Static, must-do constraints (always_apply or glob-triggered)
// skill: Dynamic, context-invoked capabilities (semantic or explicit)
```

### Loading Strategies

```typescript
type LoadingStrategy = 'glob' | 'always' | 'semantic' | 'explicit';
// glob: Load when file matches glob patterns
// always: Always load regardless of context
// semantic: AI determines when to load based on relevance
// explicit: Only load when explicitly invoked
```

### Rule Priority

```typescript
type RulePriority = 'low' | 'medium' | 'high';
```

### Rule Categories

```typescript
type RuleCategory = 
  | 'core'           // Core project rules
  | 'infrastructure' // Infrastructure/DevOps rules
  | 'testing'        // Testing-related rules
  | 'security'       // Security rules
  | 'documentation'  // Documentation rules
  | 'tooling'        // Tool configuration rules
  | 'other';         // Miscellaneous rules
```

### Persona Tools

```typescript
type PersonaTool = 
  | 'read'    // Read files
  | 'write'   // Write files
  | 'edit'    // Edit files
  | 'execute' // Execute commands
  | 'search'  // Search codebase
  | 'glob'    // Glob file matching
  | 'fetch'   // Fetch URLs
  | 'ls';     // List directories
```

### Hook Events

```typescript
type HookEvent =
  | 'PreToolUse'       // Before tool execution
  | 'PostToolUse'      // After tool execution
  | 'UserPromptSubmit' // When user submits prompt
  | 'Notification'     // System notifications
  | 'Stop'             // Agent termination
  | 'SubagentStop'     // Sub-agent termination
  | 'SessionStart'     // Session begins
  | 'SessionEnd'       // Session ends
  | 'PreCompact';      // Before context compaction
```

## Configuration Types

```text
┌─────────────────────────────────────────────────────────────────┐
│                           Config                                │
├─────────────────────────────────────────────────────────────────┤
│ + version: string                                               │
│ + project_name?: string                                         │
│ + use?: UseConfig ─────────────────────────────────────────┐    │
│ + loaders?: LoaderConfig[]                                 │    │
│ + targets?: string[]                                       │    │
│ + rules?: Record<string, RuleConfig>                       │    │
│ + subfolder_contexts?: Record<string, SubfolderConfig>     │    │
│ + hooks?: Record<string, HookConfig[]>                     │    │
│ + output?: OutputConfig                                    │    │
│ + context?: Record<string, string|number|boolean>          │    │
│ + claude?: ClaudeConfig                                    │    │
│ + factory?: FactoryConfig                                  │    │
└────────────────────────────────────────────────────────────┼────┘
                                                             │
                         ┌───────────────────────────────────┘
                         ▼
              ┌─────────────────────┐
              │      UseConfig      │
              ├─────────────────────┤
              │ + personas?: string[]
              │ + commands?: string[]
              │ + plugins?: PluginConfig[]
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │    PluginConfig     │
              ├─────────────────────┤
              │ + name: string      │
              │ + source: string    │
              │ + version?: string  │
              │ + enabled: boolean  │
              │ + include?: string[]│
              │ + exclude?: string[]│
              └─────────────────────┘
```

```mermaid
classDiagram
    class Config {
        +string version
        +string project_name
        +UseConfig use
        +LoaderConfig[] loaders
        +string[] targets
        +Record rules
        +Record subfolder_contexts
        +Record hooks
        +OutputConfig output
        +Record context
        +ClaudeConfig claude
        +FactoryConfig factory
    }
    
    class UseConfig {
        +string[] personas
        +string[] commands
        +PluginConfig[] plugins
    }
    
    class PluginConfig {
        +string name
        +string source
        +string version
        +boolean enabled
        +string[] include
        +string[] exclude
    }
    
    class OutputConfig {
        +boolean clean_before_sync
        +boolean add_do_not_edit_headers
        +boolean update_gitignore
    }
    
    Config *-- UseConfig
    UseConfig *-- PluginConfig
    Config *-- OutputConfig
```
