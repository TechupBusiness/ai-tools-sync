/**
 * @file Factory Generator
 * @description Generate .factory/ directory structure and AGENTS.md for Factory
 *
 * Factory format:
 * - Skills: .factory/skills/<name>/SKILL.md
 * - Droids: .factory/droids/<name>.md (personas)
 * - Commands: .factory/commands/<name>.md
 * - Hooks: supported via .factory/settings.json (same events as Claude)
 * - Entry point: AGENTS.md
 * - MCP: .factory/mcp.json (if supported)
 */

import * as path from 'node:path';

import { PERSONA_DEFAULTS } from '../parsers/index.js';
import { isCommandServer, type McpConfig } from '../parsers/mcp.js';
import { serializeFrontmatter } from '../transformers/frontmatter.js';
import { mapModel } from '../transformers/model-mapper.js';
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
  sortHooksByEvent,
  sortPersonasByName,
  sortRulesByPriority,
  toSafeFilename,
} from './base.js';

import type { FactoryHookConfig, FactorySettingsConfig } from '../config/types.js';
import type { ParsedCommand } from '../parsers/command.js';
import type { ParsedHook } from '../parsers/hook.js';
import type { ParsedPersona } from '../parsers/persona.js';
import type { ParsedRule } from '../parsers/rule.js';

/**
 * Detected variable in command content
 */
interface DetectedVariable {
  name: string;
  description?: string;
}

/**
 * Output directories for Factory
 */
const FACTORY_DIRS = {
  root: '.factory',
  skills: '.factory/skills',
  droids: '.factory/droids',
  commands: '.factory/commands',
} as const;

/**
 * Factory built-in command variables
 */
const FACTORY_COMMAND_VARIABLES = {
  ARGUMENTS: '$ARGUMENTS',
  PROJECT_DIR: '$FACTORY_PROJECT_DIR',
} as const;

/**
 * Factory hook output structure
 * Same as Claude - Factory uses identical event system
 */
interface FactoryHookOutput {
  type?: 'command' | 'validation' | 'notification';
  command?: string;
  matcher?: string;
  action?: 'warn' | 'block';
  message?: string;
}

/**
 * Supported Factory hook events (same as Claude Code)
 */
type FactoryHookEvent =
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
 * Factory settings.json structure
 */
interface FactorySettings {
  env?: Record<string, string>;
  hooks?: Partial<Record<FactoryHookEvent, FactoryHookOutput[]>>;
  __generated_by?: string;
}

/**
 * Map internal event names to Factory event names
 * Factory uses same events as Claude Code
 */
function mapEventToFactory(event: string): FactoryHookEvent | null {
  const eventMap: Record<string, FactoryHookEvent> = {
    PreToolUse: 'PreToolUse',
    PostToolUse: 'PostToolUse',
    UserPromptSubmit: 'UserPromptSubmit',
    Notification: 'Notification',
    Stop: 'Stop',
    SubagentStop: 'SubagentStop',
    SessionStart: 'SessionStart',
    SessionEnd: 'SessionEnd',
    PreCompact: 'PreCompact',
  };

  return eventMap[event] ?? null;
}

/**
 * Generator for Factory output
 */
export class FactoryGenerator implements Generator {
  readonly name = 'factory' as const;

  async generate(
    content: ResolvedContent,
    options: GeneratorOptions = {}
  ): Promise<GenerateResult> {
    const result = emptyGenerateResult();
    const outputDir = options.outputDir ?? content.projectRoot;
    const generated: GeneratedFile[] = [];

    // Filter content for factory target
    const factoryContent = filterContentByTarget(content, 'factory');

    const hasSettings =
      factoryContent.hooks.length > 0 ||
      (factoryContent.factorySettings?.env &&
        Object.keys(factoryContent.factorySettings.env).length > 0) ||
      (factoryContent.factorySettings?.hooks &&
        Object.keys(factoryContent.factorySettings.hooks).length > 0);

    // Clean if requested
    if (options.clean && !options.dryRun) {
      const deleted = await this.cleanOutputDirs(outputDir);
      result.deleted.push(...deleted);
    }

    // Generate skills (rules)
    const skillFiles = await this.generateSkills(factoryContent.rules, outputDir, options);
    generated.push(...skillFiles);

    // Generate droids (personas)
    const droidFiles = await this.generateDroids(factoryContent.personas, outputDir, options);
    generated.push(...droidFiles);

    // Generate commands
    const commandFiles = await this.generateCommands(factoryContent.commands, outputDir, options);
    generated.push(...commandFiles);

    // Generate settings.json when hooks or env/settings exist
    if (hasSettings) {
      const settingsFile = this.generateSettings(
        factoryContent.hooks,
        factoryContent.factorySettings,
        options
      );
      generated.push(settingsFile);
    }

    // Generate AGENTS.md entry point
    const agentsMd = this.generateAgentsMd(factoryContent, options);
    generated.push(agentsMd);

    // Generate MCP config if we have MCP config
    if (factoryContent.mcpConfig && Object.keys(factoryContent.mcpConfig.servers).length > 0) {
      const mcpFile = this.generateMcpConfig(factoryContent.mcpConfig, options);
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
    const skillsDir = joinPath(outputDir, FACTORY_DIRS.skills);
    if (await dirExists(skillsDir)) {
      const dirs = await glob('*', { cwd: skillsDir, onlyDirectories: true, absolute: false });
      await removeDir(skillsDir);
      deleted.push(...dirs.map((d) => joinPath(FACTORY_DIRS.skills, d)));
    }

    // Clean droids directory
    const droidsDir = joinPath(outputDir, FACTORY_DIRS.droids);
    if (await dirExists(droidsDir)) {
      const files = await glob('*.md', { cwd: droidsDir, absolute: false });
      await removeDir(droidsDir);
      deleted.push(...files.map((f) => joinPath(FACTORY_DIRS.droids, f)));
    }

    // Clean commands directory
    const commandsDir = joinPath(outputDir, FACTORY_DIRS.commands);
    if (await dirExists(commandsDir)) {
      const files = await glob('*.md', { cwd: commandsDir, absolute: false });
      await removeDir(commandsDir);
      deleted.push(...files.map((f) => joinPath(FACTORY_DIRS.commands, f)));
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
    const skillDir = joinPath(FACTORY_DIRS.skills, skillName);
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

    // Build YAML frontmatter
    const frontmatter: Record<string, unknown> = {
      name: rule.frontmatter.name,
    };
    if (rule.frontmatter.description) {
      frontmatter.description = rule.frontmatter.description;
    }

    // Add allowed-tools if specified in factory extension
    const factoryExt = rule.frontmatter.factory;
    const allowedTools = factoryExt?.['allowed-tools'] ?? factoryExt?.tools;
    if (allowedTools && allowedTools.length > 0) {
      frontmatter['allowed-tools'] = mapTools(allowedTools, 'factory');
    }

    // Output YAML frontmatter block
    parts.push('---');
    parts.push(serializeFrontmatter(frontmatter));
    parts.push('---');
    parts.push('');

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
   * Generate droid files (from personas)
   */
  private async generateDroids(
    personas: ParsedPersona[],
    outputDir: string,
    options: GeneratorOptions
  ): Promise<GeneratedFile[]> {
    const generated: GeneratedFile[] = [];
    const sortedPersonas = sortPersonasByName(personas);

    if (sortedPersonas.length === 0) {
      return generated;
    }

    // Ensure droids directory exists
    if (!options.dryRun) {
      await ensureDir(joinPath(outputDir, FACTORY_DIRS.droids));
    }

    for (const persona of sortedPersonas) {
      const file = this.generateDroidFile(persona, options);
      generated.push(file);
    }

    return generated;
  }

  /**
   * Generate a single droid file
   */
  private generateDroidFile(persona: ParsedPersona, options: GeneratorOptions): GeneratedFile {
    const filename = `${toSafeFilename(persona.frontmatter.name)}.md`;
    const filePath = joinPath(FACTORY_DIRS.droids, filename);

    // Prefer factory-specific overrides when present
    const tools =
      persona.frontmatter.factory?.tools ??
      persona.frontmatter.tools ??
      PERSONA_DEFAULTS.tools ??
      [];
    const mappedTools = mapTools(tools, 'factory');

    // Map model with factory-specific override
    const model = mapModel(
      persona.frontmatter.factory?.model ??
        persona.frontmatter.model ??
        PERSONA_DEFAULTS.model ??
        'default',
      'factory'
    );

    // Factory-specific reasoning effort (no generic equivalent)
    const reasoningEffort = persona.frontmatter.factory?.reasoningEffort;

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

    if (reasoningEffort) {
      parts.push(`- **Reasoning Effort:** ${reasoningEffort}`);
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
   * Generate command files
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
      await ensureDir(joinPath(outputDir, FACTORY_DIRS.commands));
    }

    for (const command of sortedCommands) {
      const file = this.generateCommandFile(command, options);
      generated.push(file);
    }

    return generated;
  }

  /**
   * Generate a single command file
   */
  private generateCommandFile(command: ParsedCommand, options: GeneratorOptions): GeneratedFile {
    const filename = `${toSafeFilename(command.frontmatter.name)}.md`;
    const filePath = joinPath(FACTORY_DIRS.commands, filename);

    // Build content
    const parts: string[] = [];

    // Add header if requested
    if (options.addHeaders) {
      parts.push(DO_NOT_EDIT_HEADER.trim());
      parts.push('');
    }

    // Add title
    parts.push(`# ${command.frontmatter.name}`);
    parts.push('');

    // Add description if present
    if (command.frontmatter.description) {
      parts.push(`> ${command.frontmatter.description}`);
      parts.push('');
    }

    // Add variables section if variables are detected
    const variables = this.detectVariables(command);
    if (variables.length > 0) {
      parts.push('## Variables');
      parts.push('');
      for (const variable of variables) {
        const desc = variable.description ? ` - ${variable.description}` : '';
        parts.push(`- \`${variable.name}\`${desc}`);
      }
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

    // Add body content (preserve variables as-is)
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
   * Build Factory hooks from parsed hook files and config.yaml hooks
   */
  private buildFactoryHooks(
    parsedHooks: ParsedHook[],
    configHooks: Record<string, FactoryHookConfig[]> | undefined
  ): Partial<Record<FactoryHookEvent, FactoryHookOutput[]>> | undefined {
    const result: Partial<Record<FactoryHookEvent, FactoryHookOutput[]>> = {};

    // Process parsed hook files
    for (const hook of sortHooksByEvent(parsedHooks)) {
      const factoryEvent = mapEventToFactory(hook.frontmatter.event);
      if (!factoryEvent) {
        continue;
      }

      if (!result[factoryEvent]) {
        result[factoryEvent] = [];
      }

      const hookOutput = this.buildHookOutput(hook);
      result[factoryEvent].push(hookOutput);
    }

    // Process config.yaml hooks (factory.settings.hooks)
    if (configHooks) {
      for (const [eventName, hooks] of Object.entries(configHooks)) {
        const factoryEvent = mapEventToFactory(eventName);
        if (!factoryEvent) {
          continue;
        }

        if (!result[factoryEvent]) {
          result[factoryEvent] = [];
        }

        for (const hook of hooks) {
          const hookOutput: FactoryHookOutput = {
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

          result[factoryEvent].push(hookOutput);
        }
      }
    }

    if (Object.keys(result).length === 0) {
      return undefined;
    }

    return result;
  }

  /**
   * Build hook output from parsed hook
   */
  private buildHookOutput(hook: ParsedHook): FactoryHookOutput {
    const factoryExt = hook.frontmatter.factory as Partial<FactoryHookConfig> | undefined;

    const output: FactoryHookOutput = {
      type: factoryExt?.type ?? 'command',
    };

    if (hook.frontmatter.execute) {
      output.command = hook.frontmatter.execute;
    }

    if (hook.frontmatter.tool_match && hook.frontmatter.tool_match !== '*') {
      output.matcher = hook.frontmatter.tool_match;
    }

    if (factoryExt?.action) {
      output.action = factoryExt.action;
    }

    if (factoryExt?.message) {
      output.message = factoryExt.message;
    }

    return output;
  }

  /**
   * Generate settings.json with hooks and env
   */
  private generateSettings(
    hooks: ParsedHook[],
    factorySettings: FactorySettingsConfig | undefined,
    options: GeneratorOptions
  ): GeneratedFile {
    const settings: FactorySettings = {};

    if (options.addHeaders) {
      settings.__generated_by = DO_NOT_EDIT_COMMENT_JSON.__generated_by;
    }

    if (factorySettings?.env && Object.keys(factorySettings.env).length > 0) {
      settings.env = factorySettings.env;
    }

    const combinedHooks = this.buildFactoryHooks(hooks, factorySettings?.hooks);
    if (combinedHooks && Object.keys(combinedHooks).length > 0) {
      settings.hooks = combinedHooks;
    }

    return {
      path: joinPath(FACTORY_DIRS.root, 'settings.json'),
      content: JSON.stringify(settings, null, 2) + '\n',
      type: 'config',
    };
  }

  /**
   * Detect variables used in command content and frontmatter
   */
  private detectVariables(command: ParsedCommand): DetectedVariable[] {
    const variables: DetectedVariable[] = [];
    const seenNames = new Set<string>();

    // First, add explicitly declared variables
    const declaredVars = command.frontmatter.variables ?? [];
    for (const v of declaredVars) {
      if (!seenNames.has(v.name)) {
        const variable: DetectedVariable = { name: `$${v.name}` };
        if (v.description !== undefined) {
          variable.description = v.description;
        }
        variables.push(variable);
        seenNames.add(v.name);
      }
    }

    // Detect built-in variables in content and execute field
    const content = command.content + (command.frontmatter.execute ?? '');

    if (content.includes(FACTORY_COMMAND_VARIABLES.ARGUMENTS) && !seenNames.has('ARGUMENTS')) {
      variables.push({
        name: FACTORY_COMMAND_VARIABLES.ARGUMENTS,
        description: 'User input after command name',
      });
      seenNames.add('ARGUMENTS');
    }

    if (
      content.includes(FACTORY_COMMAND_VARIABLES.PROJECT_DIR) &&
      !seenNames.has('FACTORY_PROJECT_DIR')
    ) {
      variables.push({
        name: FACTORY_COMMAND_VARIABLES.PROJECT_DIR,
        description: 'Project root directory',
      });
      seenNames.add('FACTORY_PROJECT_DIR');
    }

    return variables;
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

    // List required skills section (always_apply rules)
    const alwaysApplyRules = content.rules.filter((r) => r.frontmatter.always_apply);
    if (alwaysApplyRules.length > 0) {
      parts.push('## Required Skills');
      parts.push('');
      parts.push('These skills are always loaded:');
      parts.push('');
      const sortedRules = sortRulesByPriority(alwaysApplyRules);
      for (const rule of sortedRules) {
        const skillPath = path.posix.join(
          FACTORY_DIRS.skills,
          toSafeFilename(rule.frontmatter.name),
          'SKILL.md'
        );
        const desc = rule.frontmatter.description ? ` - ${rule.frontmatter.description}` : '';
        parts.push(`- [${rule.frontmatter.name}](${skillPath})${desc}`);
      }
      parts.push('');
    }

    // List conditional skills
    const conditionalRules = content.rules.filter((r) => !r.frontmatter.always_apply);
    if (conditionalRules.length > 0) {
      parts.push('## Available Skills');
      parts.push('');
      const sortedRules = sortRulesByPriority(conditionalRules);
      for (const rule of sortedRules) {
        const skillPath = path.posix.join(
          FACTORY_DIRS.skills,
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

    // List droids/personas
    if (content.personas.length > 0) {
      parts.push('## Available Droids');
      parts.push('');
      const sortedPersonas = sortPersonasByName(content.personas);
      for (const persona of sortedPersonas) {
        const droidPath = path.posix.join(
          FACTORY_DIRS.droids,
          `${toSafeFilename(persona.frontmatter.name)}.md`
        );
        const desc = persona.frontmatter.description ? ` - ${persona.frontmatter.description}` : '';
        parts.push(`- [${persona.frontmatter.name}](${droidPath})${desc}`);
      }
      parts.push('');
    }

    // List commands
    if (content.commands.length > 0) {
      parts.push('## Available Commands');
      parts.push('');
      const sortedCommands = sortCommandsByName(content.commands);
      for (const cmd of sortedCommands) {
        const cmdPath = path.posix.join(
          FACTORY_DIRS.commands,
          `${toSafeFilename(cmd.frontmatter.name)}.md`
        );
        const desc = cmd.frontmatter.description ? ` - ${cmd.frontmatter.description}` : '';
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
   * Generate MCP configuration file for Factory
   * Outputs type: 'stdio' for command servers and type: 'http' for URL servers
   */
  private generateMcpConfig(mcpConfig: McpConfig, options: GeneratorOptions): GeneratedFile {
    // Use a similar format to Cursor/Claude for consistency
    const servers: Record<string, FactoryMcpServer> = {};

    for (const [name, server] of Object.entries(mcpConfig.servers)) {
      if (isCommandServer(server)) {
        const factoryServer: FactoryMcpServerCommand = {
          type: 'stdio',
          command: server.command,
        };
        if (server.args && server.args.length > 0) {
          factoryServer.args = server.args;
        }
        if (server.env && Object.keys(server.env).length > 0) {
          factoryServer.env = server.env;
        }
        if (server.cwd) {
          factoryServer.cwd = server.cwd;
        }
        servers[name] = factoryServer;
      } else {
        // URL-based server
        const factoryServer: FactoryMcpServerUrl = {
          type: 'http',
          url: server.url,
        };
        if (server.headers && Object.keys(server.headers).length > 0) {
          factoryServer.headers = server.headers;
        }
        servers[name] = factoryServer;
      }
    }

    // Build the mcp.json structure
    const mcpJson: Record<string, unknown> = {
      mcpServers: servers,
    };

    // Add generated marker if headers enabled
    if (options.addHeaders) {
      Object.assign(mcpJson, DO_NOT_EDIT_COMMENT_JSON);
    }

    return {
      path: joinPath(FACTORY_DIRS.root, 'mcp.json'),
      content: JSON.stringify(mcpJson, null, 2) + '\n',
      type: 'config',
    };
  }
}

/**
 * Factory MCP server (command-based / stdio transport)
 */
interface FactoryMcpServerCommand {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * Factory MCP server (URL-based / http transport)
 */
interface FactoryMcpServerUrl {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

/**
 * Factory MCP server union type
 */
type FactoryMcpServer = FactoryMcpServerCommand | FactoryMcpServerUrl;

/**
 * Create a new Factory generator instance
 */
export function createFactoryGenerator(): FactoryGenerator {
  return new FactoryGenerator();
}
