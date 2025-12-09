/**
 * @file Cursor Generator
 * @description Generate .cursor/rules/*.mdc and related files for Cursor IDE
 *
 * Cursor IDE format:
 * - Rules: .cursor/rules/*.mdc with YAML frontmatter (alwaysApply, globs, description)
 * - Personas: .cursor/commands/roles/*.md
 * - Commands: .cursor/commands/*.md with frontmatter (description, allowedTools, globs)
 * - Hooks: .cursor/hooks.json (v1.7+)
 * - Entry point: AGENTS.md (if personas/commands exist)
 * - MCP: mcp.json in project root
 */

import * as path from 'node:path';

import { isCommandServer, type McpConfig } from '../parsers/mcp.js';
import { serializeFrontmatter, transformForCursor } from '../transformers/frontmatter.js';
import { mapTools } from '../transformers/tool-mapper.js';
import { dirExists, ensureDir, glob, joinPath, removeDir, writeFile } from '../utils/fs.js';

import {
  type GeneratedFile,
  type Generator,
  type GeneratorOptions,
  type GenerateResult,
  type ResolvedContent,
  DO_NOT_EDIT_COMMENT_JSON,
  DO_NOT_EDIT_HEADER,
  emptyGenerateResult,
  filterContentByTarget,
  sortCommandsByName,
  sortPersonasByName,
  sortRulesByPriority,
  toSafeFilename,
} from './base.js';

import type { ParsedCommand } from '../parsers/command.js';
import type { ParsedHook, HookEvent } from '../parsers/hook.js';
import type { ParsedPersona } from '../parsers/persona.js';
import type { ParsedRule } from '../parsers/rule.js';

/**
 * Output directories for Cursor
 */
const CURSOR_DIRS = {
  rules: '.cursor/rules',
  commands: '.cursor/commands',
  roles: '.cursor/commands/roles',
} as const;

/**
 * Cursor hooks file path
 */
const CURSOR_HOOKS_FILE = '.cursor/hooks.json';

/**
 * Mapping from generic hook events to Cursor events
 */
const HOOK_EVENT_MAP: Partial<Record<HookEvent, CursorHookEvent>> = {
  PreToolUse: 'beforeShellExecution',
  PostToolUse: 'afterFileEdit',
  UserPromptSubmit: 'beforeSubmitPrompt',
};

/**
 * Cursor hook event types
 */
type CursorHookEvent =
  | 'beforeSubmitPrompt'
  | 'beforeShellExecution'
  | 'beforeMCPExecution'
  | 'beforeReadFile'
  | 'afterFileEdit'
  | 'stop';

/**
 * Generator for Cursor IDE output
 */
export class CursorGenerator implements Generator {
  readonly name = 'cursor' as const;

  async generate(
    content: ResolvedContent,
    options: GeneratorOptions = {}
  ): Promise<GenerateResult> {
    const result = emptyGenerateResult();
    const outputDir = options.outputDir ?? content.projectRoot;
    const generated: GeneratedFile[] = [];

    // Filter content for cursor target
    const cursorContent = filterContentByTarget(content, 'cursor');

    // Clean if requested
    if (options.clean && !options.dryRun) {
      const deleted = await this.cleanOutputDirs(outputDir);
      result.deleted.push(...deleted);
    }

    // Generate rules
    const ruleFiles = await this.generateRules(cursorContent.rules, outputDir, options);
    generated.push(...ruleFiles);

    // Generate personas as roles
    const personaFiles = await this.generatePersonas(cursorContent.personas, outputDir, options);
    generated.push(...personaFiles);

    // Generate commands
    const commandFiles = await this.generateCommands(cursorContent.commands, outputDir, options);
    generated.push(...commandFiles);

    // Generate hooks.json if we have hooks
    if (cursorContent.hooks.length > 0) {
      const hooksJson = this.generateHooksJson(cursorContent.hooks, options);
      if (hooksJson) {
        generated.push(hooksJson);
      }
    }

    // Generate AGENTS.md entry point if we have personas or commands
    if (cursorContent.personas.length > 0 || cursorContent.commands.length > 0) {
      const agentsMd = this.generateAgentsMd(cursorContent, options);
      generated.push(agentsMd);
    }

    // Generate mcp.json if we have MCP config
    if (cursorContent.mcpConfig && Object.keys(cursorContent.mcpConfig.servers).length > 0) {
      const mcpJson = this.generateMcpJson(cursorContent.mcpConfig, options);
      generated.push(mcpJson);
    }

    // Write files if not dry run
    if (!options.dryRun) {
      for (const file of generated) {
        const filePath = joinPath(outputDir, file.path);
        const writeResult = await writeFile(filePath, file.content);
        if (writeResult.ok) {
          result.files.push(file.path);
        } else {
          result.warnings.push(`Failed to write ${file.path}: ${writeResult.error.message}`);
        }
      }
    } else {
      result.generated = generated;
      result.files = generated.map((f) => f.path);
    }

    return result;
  }

  /**
   * Clean existing output directories
   */
  private async cleanOutputDirs(outputDir: string): Promise<string[]> {
    const deleted: string[] = [];

    // Clean rules directory
    const rulesDir = joinPath(outputDir, CURSOR_DIRS.rules);
    if (await dirExists(rulesDir)) {
      const files = await glob('*.mdc', { cwd: rulesDir, absolute: false });
      await removeDir(rulesDir);
      deleted.push(...files.map((f) => joinPath(CURSOR_DIRS.rules, f)));
    }

    // Clean roles directory
    const rolesDir = joinPath(outputDir, CURSOR_DIRS.roles);
    if (await dirExists(rolesDir)) {
      const files = await glob('*.md', { cwd: rolesDir, absolute: false });
      await removeDir(rolesDir);
      deleted.push(...files.map((f) => joinPath(CURSOR_DIRS.roles, f)));
    }

    return deleted;
  }

  /**
   * Generate .mdc rule files
   */
  private async generateRules(
    rules: ParsedRule[],
    outputDir: string,
    options: GeneratorOptions
  ): Promise<GeneratedFile[]> {
    const generated: GeneratedFile[] = [];
    const sortedRules = sortRulesByPriority(rules);

    // Ensure rules directory exists
    if (!options.dryRun) {
      await ensureDir(joinPath(outputDir, CURSOR_DIRS.rules));
    }

    for (const rule of sortedRules) {
      const file = this.generateRuleFile(rule, options);
      generated.push(file);
    }

    return generated;
  }

  /**
   * Generate a single .mdc rule file
   */
  private generateRuleFile(rule: ParsedRule, options: GeneratorOptions): GeneratedFile {
    const filename = `${toSafeFilename(rule.frontmatter.name)}.mdc`;
    const filePath = joinPath(CURSOR_DIRS.rules, filename);

    // Transform frontmatter to Cursor format
    const cursorFrontmatter = transformForCursor(
      rule.frontmatter as unknown as Record<string, unknown>
    );

    // Build content
    const parts: string[] = [];

    // Add header if requested
    if (options.addHeaders) {
      parts.push(DO_NOT_EDIT_HEADER.trim());
      parts.push('');
    }

    // Add frontmatter
    parts.push('---');
    parts.push(serializeFrontmatter(cursorFrontmatter));
    parts.push('---');
    parts.push('');

    // Add body content
    parts.push(rule.content.trim());
    parts.push('');

    return {
      path: filePath,
      content: parts.join('\n'),
      type: 'rule',
    };
  }

  /**
   * Generate persona files as Cursor roles
   */
  private async generatePersonas(
    personas: ParsedPersona[],
    outputDir: string,
    options: GeneratorOptions
  ): Promise<GeneratedFile[]> {
    const generated: GeneratedFile[] = [];
    const sortedPersonas = sortPersonasByName(personas);

    if (sortedPersonas.length === 0) {
      return generated;
    }

    // Ensure roles directory exists
    if (!options.dryRun) {
      await ensureDir(joinPath(outputDir, CURSOR_DIRS.roles));
    }

    for (const persona of sortedPersonas) {
      const file = this.generatePersonaFile(persona, options);
      generated.push(file);
    }

    return generated;
  }

  /**
   * Generate a single persona file for Cursor (as a role)
   */
  private generatePersonaFile(persona: ParsedPersona, options: GeneratorOptions): GeneratedFile {
    const filename = `${toSafeFilename(persona.frontmatter.name)}.md`;
    const filePath = joinPath(CURSOR_DIRS.roles, filename);

    // Map tools to Cursor-specific names
    const tools = persona.frontmatter.tools ?? [];
    const mappedTools = mapTools(tools, 'cursor');

    // Build content
    const parts: string[] = [];

    // Add header if requested
    if (options.addHeaders) {
      parts.push(DO_NOT_EDIT_HEADER.trim());
      parts.push('');
    }

    // Add title
    parts.push(`# ${persona.frontmatter.name}`);
    parts.push('');

    // Add description if present
    if (persona.frontmatter.description) {
      parts.push(`> ${persona.frontmatter.description}`);
      parts.push('');
    }

    // Add tools section
    if (mappedTools.length > 0) {
      parts.push('## Available Tools');
      parts.push('');
      parts.push(mappedTools.map((t) => `- ${t}`).join('\n'));
      parts.push('');
    }

    // Add body content
    if (persona.content.trim()) {
      parts.push(persona.content.trim());
      parts.push('');
    }

    return {
      path: filePath,
      content: parts.join('\n'),
      type: 'persona',
    };
  }

  /**
   * Generate command files for Cursor
   */
  private async generateCommands(
    commands: ParsedCommand[],
    outputDir: string,
    options: GeneratorOptions
  ): Promise<GeneratedFile[]> {
    const generated: GeneratedFile[] = [];
    const sortedCommands = sortCommandsByName(commands);

    if (sortedCommands.length === 0) {
      return generated;
    }

    // Ensure commands directory exists
    if (!options.dryRun) {
      await ensureDir(joinPath(outputDir, CURSOR_DIRS.commands));
    }

    for (const command of sortedCommands) {
      const file = this.generateCommandFile(command, options);
      generated.push(file);
    }

    return generated;
  }

  /**
   * Generate a single command file for Cursor
   * Cursor commands support frontmatter with: description, allowedTools, globs
   */
  private generateCommandFile(command: ParsedCommand, options: GeneratorOptions): GeneratedFile {
    const filename = `${toSafeFilename(command.frontmatter.name)}.md`;
    const filePath = joinPath(CURSOR_DIRS.commands, filename);

    // Build content
    const parts: string[] = [];

    // Add header if requested
    if (options.addHeaders) {
      parts.push(DO_NOT_EDIT_HEADER.trim());
      parts.push('');
    }

    // Build frontmatter for Cursor command
    const frontmatter = this.buildCommandFrontmatter(command);
    if (Object.keys(frontmatter).length > 0) {
      parts.push('---');
      parts.push(serializeFrontmatter(frontmatter));
      parts.push('---');
      parts.push('');
    }

    // Add body content (which includes instructions)
    if (command.content.trim()) {
      parts.push(command.content.trim());
      parts.push('');
    }

    // Add execute section if present
    if (command.frontmatter.execute) {
      parts.push('## Execute');
      parts.push('');
      parts.push('```bash');
      parts.push(command.frontmatter.execute);
      parts.push('```');
      parts.push('');
    }

    // Add arguments section if present
    const args = command.frontmatter.args ?? [];
    if (args.length > 0) {
      parts.push('## Arguments');
      parts.push('');
      for (const arg of args) {
        const required = arg.required ? ' (required)' : '';
        const defaultVal = arg.default !== undefined ? ` [default: ${arg.default}]` : '';
        parts.push(`- **${arg.name}** (${arg.type})${required}${defaultVal}`);
        if (arg.description) {
          parts.push(`  ${arg.description}`);
        }
        if (arg.choices && arg.choices.length > 0) {
          parts.push(`  Choices: ${arg.choices.join(', ')}`);
        }
      }
      parts.push('');
    }

    return {
      path: filePath,
      content: parts.join('\n'),
      type: 'command',
    };
  }

  /**
   * Build frontmatter for Cursor command
   * Supports: description, allowedTools, globs
   */
  private buildCommandFrontmatter(command: ParsedCommand): Record<string, unknown> {
    const frontmatter: Record<string, unknown> = {};

    // Get cursor-specific extension values or fall back to base values
    const cursorExt = command.frontmatter.cursor;

    // Description
    const description = cursorExt?.description ?? command.frontmatter.description;
    if (description) {
      frontmatter.description = description;
    }

    // Allowed tools (Cursor-specific feature)
    const allowedTools = cursorExt?.allowedTools ?? command.frontmatter.allowedTools;
    if (allowedTools && allowedTools.length > 0) {
      // Map generic tool names to Cursor-specific names
      frontmatter.allowedTools = mapTools(allowedTools, 'cursor');
    }

    // Globs
    const globs = cursorExt?.globs ?? command.frontmatter.globs;
    if (globs && globs.length > 0) {
      frontmatter.globs = globs;
    }

    return frontmatter;
  }

  /**
   * Generate AGENTS.md entry point
   */
  private generateAgentsMd(content: ResolvedContent, options: GeneratorOptions): GeneratedFile {
    const parts: string[] = [];

    // Add header if requested
    if (options.addHeaders) {
      parts.push(DO_NOT_EDIT_HEADER.trim());
      parts.push('');
    }

    parts.push('# AI Agents');
    parts.push('');

    if (content.projectName) {
      parts.push(`Project: **${content.projectName}**`);
      parts.push('');
    }

    // List roles/personas
    if (content.personas.length > 0) {
      parts.push('## Available Roles');
      parts.push('');
      const sortedPersonas = sortPersonasByName(content.personas);
      for (const persona of sortedPersonas) {
        const desc = persona.frontmatter.description ? ` - ${persona.frontmatter.description}` : '';
        const rolePath = path.posix.join(
          CURSOR_DIRS.roles,
          `${toSafeFilename(persona.frontmatter.name)}.md`
        );
        parts.push(`- [${persona.frontmatter.name}](${rolePath})${desc}`);
      }
      parts.push('');
    }

    // List commands
    if (content.commands.length > 0) {
      parts.push('## Available Commands');
      parts.push('');
      const sortedCommands = sortCommandsByName(content.commands);
      for (const cmd of sortedCommands) {
        const desc = cmd.frontmatter.description ? ` - ${cmd.frontmatter.description}` : '';
        const cmdPath = path.posix.join(
          CURSOR_DIRS.commands,
          `${toSafeFilename(cmd.frontmatter.name)}.md`
        );
        parts.push(`- [${cmd.frontmatter.name}](${cmdPath})${desc}`);
      }
      parts.push('');
    }

    return {
      path: 'AGENTS.md',
      content: parts.join('\n'),
      type: 'entrypoint',
    };
  }

  /**
   * Generate .cursor/hooks.json for Cursor hooks (v1.7+)
   *
   * Format:
   * {
   *   "version": 1,
   *   "hooks": {
   *     "afterFileEdit": [
   *       { "command": "sh -lc '.cursor/hooks/format.sh'" }
   *     ]
   *   }
   * }
   */
  private generateHooksJson(hooks: ParsedHook[], options: GeneratorOptions): GeneratedFile | null {
    if (hooks.length === 0) {
      return null;
    }

    // Group hooks by Cursor event
    const hooksByEvent: Record<CursorHookEvent, CursorHookEntry[]> = {
      beforeSubmitPrompt: [],
      beforeShellExecution: [],
      beforeMCPExecution: [],
      beforeReadFile: [],
      afterFileEdit: [],
      stop: [],
    };

    for (const hook of hooks) {
      // Get cursor-specific event or map from generic event
      const cursorEvent = this.mapHookEvent(hook);
      if (!cursorEvent) {
        continue; // Skip hooks that don't map to Cursor events
      }

      const entry: CursorHookEntry = {
        command: hook.frontmatter.execute ?? `sh -lc 'echo "Hook: ${hook.frontmatter.name}"'`,
      };

      hooksByEvent[cursorEvent].push(entry);
    }

    // Filter out empty event arrays
    const hooksConfig: Partial<Record<CursorHookEvent, CursorHookEntry[]>> = {};
    for (const [event, entries] of Object.entries(hooksByEvent) as [
      CursorHookEvent,
      CursorHookEntry[],
    ][]) {
      if (entries.length > 0) {
        hooksConfig[event] = entries;
      }
    }

    // Don't generate if no hooks mapped
    if (Object.keys(hooksConfig).length === 0) {
      return null;
    }

    // Build the hooks.json structure
    const hooksJson: CursorHooksConfig = {
      version: 1,
      hooks: hooksConfig,
    };

    // Add generated marker if headers enabled
    const output: Record<string, unknown> = { ...hooksJson };
    if (options.addHeaders) {
      Object.assign(output, DO_NOT_EDIT_COMMENT_JSON);
    }

    return {
      path: CURSOR_HOOKS_FILE,
      content: JSON.stringify(output, null, 2) + '\n',
      type: 'config',
    };
  }

  /**
   * Map a hook to a Cursor event
   */
  private mapHookEvent(hook: ParsedHook): CursorHookEvent | null {
    // Check for cursor-specific event override
    const cursorExt = hook.frontmatter.cursor as { event?: string } | undefined;
    if (cursorExt?.event) {
      const event = cursorExt.event as CursorHookEvent;
      if (this.isValidCursorEvent(event)) {
        return event;
      }
    }

    // Map generic event to Cursor event
    return HOOK_EVENT_MAP[hook.frontmatter.event] ?? null;
  }

  /**
   * Check if event is a valid Cursor hook event
   */
  private isValidCursorEvent(event: string): event is CursorHookEvent {
    return [
      'beforeSubmitPrompt',
      'beforeShellExecution',
      'beforeMCPExecution',
      'beforeReadFile',
      'afterFileEdit',
      'stop',
    ].includes(event);
  }

  /**
   * Generate mcp.json for Cursor MCP configuration
   */
  private generateMcpJson(mcpConfig: McpConfig, options: GeneratorOptions): GeneratedFile {
    // Cursor expects the format: { "mcpServers": { "name": { "command": "...", "args": [...], "env": {...} } } }
    const mcpServers: Record<string, CursorMcpServer> = {};

    for (const [name, server] of Object.entries(mcpConfig.servers)) {
      if (isCommandServer(server)) {
        const cursorServer: CursorMcpServerCommand = {
          command: server.command,
        };
        if (server.args && server.args.length > 0) {
          cursorServer.args = server.args;
        }
        if (server.env && Object.keys(server.env).length > 0) {
          cursorServer.env = server.env;
        }
        if (server.cwd) {
          cursorServer.cwd = server.cwd;
        }
        mcpServers[name] = cursorServer;
      } else {
        // URL-based server - Cursor may support this differently
        const cursorServer: CursorMcpServerUrl = {
          url: server.url,
        };
        if (server.headers && Object.keys(server.headers).length > 0) {
          cursorServer.headers = server.headers;
        }
        mcpServers[name] = cursorServer;
      }
    }

    // Build the mcp.json structure
    const mcpJson: Record<string, unknown> = {
      mcpServers,
    };

    // Add generated marker if headers enabled
    if (options.addHeaders) {
      Object.assign(mcpJson, DO_NOT_EDIT_COMMENT_JSON);
    }

    return {
      path: 'mcp.json',
      content: JSON.stringify(mcpJson, null, 2) + '\n',
      type: 'config',
    };
  }
}

/**
 * Cursor MCP server (command-based)
 */
interface CursorMcpServerCommand {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * Cursor MCP server (URL-based)
 */
interface CursorMcpServerUrl {
  url: string;
  headers?: Record<string, string>;
}

/**
 * Cursor MCP server union type
 */
type CursorMcpServer = CursorMcpServerCommand | CursorMcpServerUrl;

/**
 * Cursor hook entry
 */
interface CursorHookEntry {
  command: string;
}

/**
 * Cursor hooks.json configuration
 */
interface CursorHooksConfig {
  version: number;
  hooks: Partial<Record<CursorHookEvent, CursorHookEntry[]>>;
}

/**
 * Create a new Cursor generator instance
 */
export function createCursorGenerator(): CursorGenerator {
  return new CursorGenerator();
}
