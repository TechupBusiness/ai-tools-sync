/**
 * @file Claude Generator
 * @description Generate .claude/ directory structure and CLAUDE.md for Claude Code
 *
 * Claude Code format:
 * - Skills: .claude/skills/<name>/SKILL.md
 * - Agents: .claude/agents/<name>.md
 * - Commands: Integrated via slash commands in settings
 * - Hooks: .claude/settings.json (hooks: { PreToolUse, PostToolUse, ... })
 * - Entry point: CLAUDE.md with @import support
 * - MCP: .claude/mcp_servers.json
 */

import * as path from 'node:path';

import {
  isCommandServer,
  type McpConfig,
} from '../parsers/mcp.js';
import { mapModel } from '../transformers/model-mapper.js';
import { mapTools } from '../transformers/tool-mapper.js';
import {
  dirExists,
  ensureDir,
  glob,
  joinPath,
  removeDir,
  writeFile,
} from '../utils/fs.js';

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
  sortHooksByEvent,
  sortPersonasByName,
  sortRulesByPriority,
  toSafeFilename,
} from './base.js';

import type { ClaudeHookConfig, ClaudePermission, ClaudeSettingsConfig } from '../config/types.js';
import type { ParsedCommand } from '../parsers/command.js';
import type { ParsedHook } from '../parsers/hook.js';
import type { ParsedPersona } from '../parsers/persona.js';
import type { ParsedRule } from '../parsers/rule.js';


/**
 * Output directories for Claude
 */
const CLAUDE_DIRS = {
  root: '.claude',
  skills: '.claude/skills',
  agents: '.claude/agents',
  commands: '.claude/commands',
} as const;

/**
 * Claude hook output structure
 */
interface ClaudeHookOutput {
  type?: 'command' | 'validation' | 'notification';
  command?: string;
  matcher?: string;
  action?: 'allow' | 'deny' | 'warn' | 'ask' | 'block';
  message?: string;
  timeout?: number;
}

/**
 * Supported Claude hook events
 */
type ClaudeHookEvent =
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Notification'
  | 'Stop'
  | 'SubagentStop'
  | 'SessionStart'
  | 'SessionEnd'
  | 'PreCompact';

/**
 * Claude settings.json structure
 */
interface ClaudeSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
    ask?: string[];
  };
  env?: Record<string, string>;
  hooks?: Partial<Record<ClaudeHookEvent, ClaudeHookOutput[]>>;
  commands?: Record<string, ClaudeCommandConfig>;
  __generated_by?: string;
}

interface ClaudeCommandConfig {
  description?: string;
  command?: string;
}

/**
 * Map internal event names to Claude Code event names
 */
function mapEventToClaude(event: string): ClaudeHookEvent | null {
  const eventMap: Record<string, ClaudeHookEvent> = {
    'PreToolUse': 'PreToolUse',
    'PostToolUse': 'PostToolUse',
    'UserPromptSubmit': 'UserPromptSubmit',
    'Notification': 'Notification',
    'Stop': 'Stop',
    'SubagentStop': 'SubagentStop',
    'SessionStart': 'SessionStart',
    'SessionEnd': 'SessionEnd',
    'PreCompact': 'PreCompact',
  };
  
  return eventMap[event] ?? null;
}

/**
 * Generator for Claude Code output
 */
export class ClaudeGenerator implements Generator {
  readonly name = 'claude' as const;

  async generate(
    content: ResolvedContent,
    options: GeneratorOptions = {}
  ): Promise<GenerateResult> {
    const result = emptyGenerateResult();
    const outputDir = options.outputDir ?? content.projectRoot;
    const generated: GeneratedFile[] = [];

    // Filter content for claude target
    const claudeContent = filterContentByTarget(content, 'claude');

    // Clean if requested
    if (options.clean && !options.dryRun) {
      const deleted = await this.cleanOutputDirs(outputDir);
      result.deleted.push(...deleted);
    }

    // Generate skills (rules)
    const skillFiles = await this.generateSkills(
      claudeContent.rules,
      outputDir,
      options
    );
    generated.push(...skillFiles);

    // Generate agents (personas)
    const agentFiles = await this.generateAgents(
      claudeContent.personas,
      outputDir,
      options
    );
    generated.push(...agentFiles);

    // Generate commands
    const commandFiles = await this.generateCommands(
      claudeContent.commands,
      outputDir,
      options
    );
    generated.push(...commandFiles);

    // Generate settings.json with hooks, commands, permissions, and env
    const hasSettings =
      claudeContent.hooks.length > 0 ||
      claudeContent.commands.length > 0 ||
      (claudeContent.claudeSettings?.permissions?.length ?? 0) > 0 ||
      (claudeContent.claudeSettings?.env && Object.keys(claudeContent.claudeSettings.env).length > 0) ||
      (claudeContent.claudeSettings?.hooks && Object.keys(claudeContent.claudeSettings.hooks).length > 0);

    if (hasSettings) {
      const settingsFile = this.generateSettings(
        claudeContent.hooks,
        claudeContent.commands,
        claudeContent.claudeSettings,
        options
      );
      generated.push(settingsFile);
    }

    // Generate CLAUDE.md entry point
    const claudeMd = this.generateClaudeMd(claudeContent, options);
    generated.push(claudeMd);

    // Generate MCP servers config if we have MCP config
    if (claudeContent.mcpConfig && Object.keys(claudeContent.mcpConfig.servers).length > 0) {
      const mcpFile = this.generateMcpServers(claudeContent.mcpConfig, options);
      generated.push(mcpFile);
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

    // Clean skills directory
    const skillsDir = joinPath(outputDir, CLAUDE_DIRS.skills);
    if (await dirExists(skillsDir)) {
      const dirs = await glob('*', { cwd: skillsDir, onlyDirectories: true, absolute: false });
      await removeDir(skillsDir);
      deleted.push(...dirs.map((d) => joinPath(CLAUDE_DIRS.skills, d)));
    }

    // Clean agents directory
    const agentsDir = joinPath(outputDir, CLAUDE_DIRS.agents);
    if (await dirExists(agentsDir)) {
      const files = await glob('*.md', { cwd: agentsDir, absolute: false });
      await removeDir(agentsDir);
      deleted.push(...files.map((f) => joinPath(CLAUDE_DIRS.agents, f)));
    }

    // Clean commands directory
    const commandsDir = joinPath(outputDir, CLAUDE_DIRS.commands);
    if (await dirExists(commandsDir)) {
      const files = await glob('*.md', { cwd: commandsDir, absolute: false });
      await removeDir(commandsDir);
      deleted.push(...files.map((f) => joinPath(CLAUDE_DIRS.commands, f)));
    }

    return deleted;
  }

  /**
   * Generate skill files (from rules)
   */
  private async generateSkills(
    rules: ParsedRule[],
    outputDir: string,
    options: GeneratorOptions
  ): Promise<GeneratedFile[]> {
    const generated: GeneratedFile[] = [];
    const sortedRules = sortRulesByPriority(rules);

    for (const rule of sortedRules) {
      const file = await this.generateSkillFile(rule, outputDir, options);
      generated.push(file);
    }

    return generated;
  }

  /**
   * Generate a single skill file
   */
  private async generateSkillFile(
    rule: ParsedRule,
    outputDir: string,
    options: GeneratorOptions
  ): Promise<GeneratedFile> {
    const skillName = toSafeFilename(rule.frontmatter.name);
    const skillDir = joinPath(CLAUDE_DIRS.skills, skillName);
    const filePath = joinPath(skillDir, 'SKILL.md');

    // Ensure skill directory exists
    if (!options.dryRun) {
      await ensureDir(joinPath(outputDir, skillDir));
    }

    // Build content
    const parts: string[] = [];

    // Add header if requested
    if (options.addHeaders) {
      parts.push(DO_NOT_EDIT_HEADER.trim());
      parts.push('');
    }

    // Add title with description
    parts.push(`# ${rule.frontmatter.name}`);
    parts.push('');

    if (rule.frontmatter.description) {
      parts.push(`> ${rule.frontmatter.description}`);
      parts.push('');
    }

    // Add metadata section
    const metadata: string[] = [];
    if (rule.frontmatter.always_apply) {
      metadata.push('**Always Active**');
    }
    if (rule.frontmatter.globs && rule.frontmatter.globs.length > 0) {
      metadata.push(`**Triggers:** \`${rule.frontmatter.globs.join('`, `')}\``);
    }
    if (rule.frontmatter.priority && rule.frontmatter.priority !== 'medium') {
      metadata.push(`**Priority:** ${rule.frontmatter.priority}`);
    }
    if (rule.frontmatter.requires && rule.frontmatter.requires.length > 0) {
      metadata.push(`**Requires:** ${rule.frontmatter.requires.join(', ')}`);
    }

    if (metadata.length > 0) {
      parts.push(metadata.join(' | '));
      parts.push('');
    }

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
   * Generate agent files (from personas)
   */
  private async generateAgents(
    personas: ParsedPersona[],
    outputDir: string,
    options: GeneratorOptions
  ): Promise<GeneratedFile[]> {
    const generated: GeneratedFile[] = [];
    const sortedPersonas = sortPersonasByName(personas);

    if (sortedPersonas.length === 0) {
      return generated;
    }

    // Ensure agents directory exists
    if (!options.dryRun) {
      await ensureDir(joinPath(outputDir, CLAUDE_DIRS.agents));
    }

    for (const persona of sortedPersonas) {
      const file = this.generateAgentFile(persona, options);
      generated.push(file);
    }

    return generated;
  }

  /**
   * Generate a single agent file
   */
  private generateAgentFile(persona: ParsedPersona, options: GeneratorOptions): GeneratedFile {
    const filename = `${toSafeFilename(persona.frontmatter.name)}.md`;
    const filePath = joinPath(CLAUDE_DIRS.agents, filename);

    // Prefer claude-specific overrides when present
    const tools = persona.frontmatter.claude?.tools ?? persona.frontmatter.tools ?? [];
    const mappedTools = mapTools(tools, 'claude');

    // Map model with claude-specific override
    const model = mapModel(
      persona.frontmatter.claude?.model ?? persona.frontmatter.model ?? 'default',
      'claude'
    );

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

    // Add configuration section
    parts.push('## Configuration');
    parts.push('');

    if (model && model !== 'default') {
      parts.push(`- **Model:** ${model}`);
    }

    if (mappedTools.length > 0) {
      parts.push(`- **Tools:** ${mappedTools.join(', ')}`);
    }

    parts.push('');

    // Add body content
    if (persona.content.trim()) {
      parts.push('## Instructions');
      parts.push('');
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
   * Generate command files for Claude
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
      await ensureDir(joinPath(outputDir, CLAUDE_DIRS.commands));
    }

    for (const command of sortedCommands) {
      const file = this.generateCommandFile(command, options);
      generated.push(file);
    }

    return generated;
  }

  /**
   * Generate a single command file for Claude
   */
  private generateCommandFile(command: ParsedCommand, options: GeneratorOptions): GeneratedFile {
    const commandName = toSafeFilename(command.frontmatter.name);
    const filePath = joinPath(CLAUDE_DIRS.commands, `${commandName}.md`);

    const parts: string[] = [];

    // Add header if requested
    if (options.addHeaders) {
      parts.push(DO_NOT_EDIT_HEADER.trim());
      parts.push('');
    }

    // Title
    parts.push(`# /${commandName}`);
    parts.push('');

    // Description
    if (command.frontmatter.description) {
      parts.push(`> ${command.frontmatter.description}`);
      parts.push('');
    }

    // Usage with $ARGUMENTS note
    parts.push('## Usage');
    parts.push('');
    parts.push('Use `$ARGUMENTS` to pass user-provided input when invoking this command.');
    parts.push('');

    const args = command.frontmatter.args ?? [];
    if (args.length > 0) {
      parts.push('Arguments:');
      for (const arg of args) {
        const required = arg.required ? ' (required)' : '';
        const defaultVal = arg.default !== undefined ? ` [default: ${arg.default}]` : '';
        const choices = arg.choices && arg.choices.length > 0 ? ` Choices: ${arg.choices.join(', ')}` : '';
        parts.push(`- **${arg.name}** (${arg.type})${required}${defaultVal}${choices}`);
        if (arg.description) {
          parts.push(`  ${arg.description}`);
        }
      }
      parts.push('');
    }

    // Execute section
    if (command.frontmatter.execute) {
      parts.push('## Execute');
      parts.push('');
      parts.push('```bash');
      parts.push(command.frontmatter.execute);
      parts.push('```');
      parts.push('');
    }

    // Original body/instructions
    if (command.content.trim()) {
      parts.push(command.content.trim());
      parts.push('');
    }

    return {
      path: filePath,
      content: parts.join('\n'),
      type: 'command',
    };
  }

  /**
   * Build permissions object from array of permission rules
   */
  private buildPermissions(
    permissions: ClaudePermission[]
  ): { allow?: string[]; deny?: string[]; ask?: string[] } {
    const result: { allow?: string[]; deny?: string[]; ask?: string[] } = {};

    const allow: string[] = [];
    const deny: string[] = [];
    const ask: string[] = [];

    for (const perm of permissions) {
      switch (perm.action) {
        case 'allow':
          allow.push(perm.matcher);
          break;
        case 'deny':
          deny.push(perm.matcher);
          break;
        case 'ask':
          ask.push(perm.matcher);
          break;
      }
    }

    // Only include non-empty arrays
    if (allow.length > 0) result.allow = allow;
    if (deny.length > 0) result.deny = deny;
    if (ask.length > 0) result.ask = ask;

    return result;
  }

  /**
   * Build Claude hooks from parsed hook files and config.yaml hooks
   */
  private buildClaudeHooks(
    parsedHooks: ParsedHook[],
    configHooks: Record<string, ClaudeHookConfig[]> | undefined
  ): Partial<Record<ClaudeHookEvent, ClaudeHookOutput[]>> | undefined {
    const result: Partial<Record<ClaudeHookEvent, ClaudeHookOutput[]>> = {};

    // Process parsed hook files
    for (const hook of sortHooksByEvent(parsedHooks)) {
      const claudeEvent = mapEventToClaude(hook.frontmatter.event);
      if (!claudeEvent) {
        // Skip unsupported events
        continue;
      }

      if (!result[claudeEvent]) {
        result[claudeEvent] = [];
      }

      const hookOutput = this.buildHookOutput(hook);
      result[claudeEvent].push(hookOutput);
    }

    // Process config.yaml hooks (claude.settings.hooks)
    if (configHooks) {
      for (const [eventName, hooks] of Object.entries(configHooks)) {
        const claudeEvent = mapEventToClaude(eventName);
        if (!claudeEvent) {
          continue;
        }

        if (!result[claudeEvent]) {
          result[claudeEvent] = [];
        }

        for (const hook of hooks) {
          const hookOutput: ClaudeHookOutput = {
            type: hook.type ?? 'command',
            command: hook.command,
          };

          if (hook.matcher && hook.matcher !== '*') {
            hookOutput.matcher = hook.matcher;
          }
          if (hook.action) {
            hookOutput.action = hook.action;
          }
          if (hook.message) {
            hookOutput.message = hook.message;
          }

          result[claudeEvent].push(hookOutput);
        }
      }
    }

    // Return undefined if no hooks
    if (Object.keys(result).length === 0) {
      return undefined;
    }

    return result;
  }

  /**
   * Build hook output from parsed hook
   */
  private buildHookOutput(hook: ParsedHook): ClaudeHookOutput {
    const claudeExt = hook.frontmatter.claude;
    
    const output: ClaudeHookOutput = {
      type: claudeExt?.type ?? 'command',
    };

    // Set command
    if (hook.frontmatter.execute) {
      output.command = hook.frontmatter.execute;
    }

    // Set matcher (from tool_match, default to undefined = match all)
    if (hook.frontmatter.tool_match && hook.frontmatter.tool_match !== '*') {
      output.matcher = hook.frontmatter.tool_match;
    }

    // Set action (only for PreToolUse)
    if (claudeExt?.action) {
      output.action = claudeExt.action;
    }

    if (claudeExt?.timeout !== undefined) {
      output.timeout = claudeExt.timeout;
    }

    // Set message
    if (claudeExt?.message) {
      output.message = claudeExt.message;
    }

    return output;
  }

  /**
   * Generate settings.json with hooks, commands, permissions, and env
   */
  private generateSettings(
    hooks: ParsedHook[],
    commands: ParsedCommand[],
    claudeSettings: ClaudeSettingsConfig | undefined,
    options: GeneratorOptions
  ): GeneratedFile {
    const settings: ClaudeSettings = {};

    // Add generated marker
    if (options.addHeaders) {
      settings.__generated_by = 'ai-tool-sync - DO NOT EDIT DIRECTLY';
    }

    // Process permissions
    if (claudeSettings?.permissions && claudeSettings.permissions.length > 0) {
      settings.permissions = this.buildPermissions(claudeSettings.permissions);
    }

    // Process env variables
    if (claudeSettings?.env && Object.keys(claudeSettings.env).length > 0) {
      settings.env = claudeSettings.env;
    }

    // Process hooks - combine from hook files AND config.yaml claude.settings.hooks
    const combinedHooks = this.buildClaudeHooks(hooks, claudeSettings?.hooks);
    if (combinedHooks && Object.keys(combinedHooks).length > 0) {
      settings.hooks = combinedHooks;
    }

    // Process commands
    if (commands.length > 0) {
      const sortedCommands = sortCommandsByName(commands);
      settings.commands = {};

      for (const cmd of sortedCommands) {
        const cmdName = toSafeFilename(cmd.frontmatter.name);
        const cmdConfig: ClaudeCommandConfig = {};
        if (cmd.frontmatter.description !== undefined) {
          cmdConfig.description = cmd.frontmatter.description;
        }
        if (cmd.frontmatter.execute !== undefined) {
          cmdConfig.command = cmd.frontmatter.execute;
        }
        settings.commands[cmdName] = cmdConfig;
      }
    }

    return {
      path: joinPath(CLAUDE_DIRS.root, 'settings.json'),
      content: JSON.stringify(settings, null, 2) + '\n',
      type: 'config',
    };
  }

  /**
   * Generate CLAUDE.md entry point
   */
  private generateClaudeMd(
    content: ResolvedContent,
    options: GeneratorOptions
  ): GeneratedFile {
    const parts: string[] = [];

    // Add header if requested
    if (options.addHeaders) {
      parts.push(DO_NOT_EDIT_HEADER.trim());
      parts.push('');
    }

    parts.push('# Claude Code Context');
    parts.push('');

    if (content.projectName) {
      parts.push(`Project: **${content.projectName}**`);
      parts.push('');
    }

    // Import always-apply skills
    const alwaysApplyRules = content.rules.filter((r) => r.frontmatter.always_apply);
    if (alwaysApplyRules.length > 0) {
      parts.push('## Core Skills (Always Active)');
      parts.push('');
      const sortedRules = sortRulesByPriority(alwaysApplyRules);
      for (const rule of sortedRules) {
        const skillPath = path.posix.join(
          CLAUDE_DIRS.skills,
          toSafeFilename(rule.frontmatter.name),
          'SKILL.md'
        );
        parts.push(`@import ${skillPath}`);
      }
      parts.push('');
    }

    // List conditional skills
    const conditionalRules = content.rules.filter((r) => !r.frontmatter.always_apply);
    if (conditionalRules.length > 0) {
      parts.push('## Context-Aware Skills');
      parts.push('');
      parts.push('The following skills are activated based on file context:');
      parts.push('');
      const sortedRules = sortRulesByPriority(conditionalRules);
      for (const rule of sortedRules) {
        const skillPath = path.posix.join(
          CLAUDE_DIRS.skills,
          toSafeFilename(rule.frontmatter.name),
          'SKILL.md'
        );
        const globs = rule.frontmatter.globs ?? [];
        const triggers = globs.length > 0 ? ` (${globs.join(', ')})` : '';
        const desc = rule.frontmatter.description ? ` - ${rule.frontmatter.description}` : '';
        parts.push(`- [${rule.frontmatter.name}](${skillPath})${triggers}${desc}`);
      }
      parts.push('');
    }

    // List agents
    if (content.personas.length > 0) {
      parts.push('## Available Agents');
      parts.push('');
      const sortedPersonas = sortPersonasByName(content.personas);
      for (const persona of sortedPersonas) {
        const agentPath = path.posix.join(
          CLAUDE_DIRS.agents,
          `${toSafeFilename(persona.frontmatter.name)}.md`
        );
        const desc = persona.frontmatter.description
          ? ` - ${persona.frontmatter.description}`
          : '';
        parts.push(`- [${persona.frontmatter.name}](${agentPath})${desc}`);
      }
      parts.push('');
    }

    // List commands
    if (content.commands.length > 0) {
      parts.push('## Available Commands');
      parts.push('');
      const sortedCommands = sortCommandsByName(content.commands);
      for (const cmd of sortedCommands) {
        const desc = cmd.frontmatter.description
          ? ` - ${cmd.frontmatter.description}`
          : '';
        parts.push(`- /${toSafeFilename(cmd.frontmatter.name)}${desc}`);
      }
      parts.push('');
    }

    // Note about hooks
    if (content.hooks.length > 0) {
      parts.push('## Active Hooks');
      parts.push('');
      parts.push(`${content.hooks.length} hook(s) configured in \`.claude/settings.json\``);
      parts.push('');
    }

    return {
      path: 'CLAUDE.md',
      content: parts.join('\n'),
      type: 'entrypoint',
    };
  }

  /**
   * Generate MCP servers configuration file for Claude
   */
  private generateMcpServers(
    mcpConfig: McpConfig,
    options: GeneratorOptions
  ): GeneratedFile {
    // Claude expects servers in a specific format
    const servers: Record<string, ClaudeMcpServer> = {};

    for (const [name, server] of Object.entries(mcpConfig.servers)) {
      if (isCommandServer(server)) {
        const claudeServer: ClaudeMcpServerCommand = {
          command: server.command,
        };
        if (server.args && server.args.length > 0) {
          claudeServer.args = server.args;
        }
        if (server.env && Object.keys(server.env).length > 0) {
          claudeServer.env = server.env;
        }
        if (server.cwd) {
          claudeServer.cwd = server.cwd;
        }
        servers[name] = claudeServer;
      } else {
        // URL-based server
        const claudeServer: ClaudeMcpServerUrl = {
          url: server.url,
        };
        if (server.headers && Object.keys(server.headers).length > 0) {
          claudeServer.headers = server.headers;
        }
        servers[name] = claudeServer;
      }
    }

    // Build the mcp_servers.json structure
    const mcpJson: Record<string, unknown> = {
      mcpServers: servers,
    };

    // Add generated marker if headers enabled
    if (options.addHeaders) {
      Object.assign(mcpJson, DO_NOT_EDIT_COMMENT_JSON);
    }

    return {
      path: joinPath(CLAUDE_DIRS.root, 'mcp_servers.json'),
      content: JSON.stringify(mcpJson, null, 2) + '\n',
      type: 'config',
    };
  }
}

/**
 * Claude MCP server (command-based)
 */
interface ClaudeMcpServerCommand {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * Claude MCP server (URL-based)
 */
interface ClaudeMcpServerUrl {
  url: string;
  headers?: Record<string, string>;
}

/**
 * Claude MCP server union type
 */
type ClaudeMcpServer = ClaudeMcpServerCommand | ClaudeMcpServerUrl;

/**
 * Create a new Claude generator instance
 */
export function createClaudeGenerator(): ClaudeGenerator {
  return new ClaudeGenerator();
}
