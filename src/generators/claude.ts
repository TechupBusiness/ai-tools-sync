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
 */

import * as path from 'node:path';

import type { ParsedCommand } from '../parsers/command.js';
import type { ParsedHook } from '../parsers/hook.js';
import type { ParsedPersona } from '../parsers/persona.js';
import type { ParsedRule } from '../parsers/rule.js';
import { mapTools } from '../transformers/tool-mapper.js';
import { mapModel } from '../transformers/model-mapper.js';
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
  DO_NOT_EDIT_HEADER,
  emptyGenerateResult,
  filterContentByTarget,
  sortCommandsByName,
  sortHooksByEvent,
  sortPersonasByName,
  sortRulesByPriority,
  toSafeFilename,
} from './base.js';

/**
 * Output directories for Claude
 */
const CLAUDE_DIRS = {
  root: '.claude',
  skills: '.claude/skills',
  agents: '.claude/agents',
} as const;

/**
 * Claude settings.json structure
 */
interface ClaudeSettings {
  hooks?: {
    PreToolUse?: ClaudeHookConfig[];
    PostToolUse?: ClaudeHookConfig[];
    PreMessage?: ClaudeHookConfig[];
    PostMessage?: ClaudeHookConfig[];
    PreCommit?: ClaudeHookConfig[];
  };
  commands?: Record<string, ClaudeCommandConfig>;
  __generated_by?: string;
}

interface ClaudeHookConfig {
  matcher: string;
  hooks: string[];
}

interface ClaudeCommandConfig {
  description?: string;
  command?: string;
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

    // Generate settings.json with hooks and commands
    if (claudeContent.hooks.length > 0 || claudeContent.commands.length > 0) {
      const settingsFile = this.generateSettings(
        claudeContent.hooks,
        claudeContent.commands,
        options
      );
      generated.push(settingsFile);
    }

    // Generate CLAUDE.md entry point
    const claudeMd = this.generateClaudeMd(claudeContent, options);
    generated.push(claudeMd);

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

    // Map tools to Claude-specific names
    const tools = persona.frontmatter.tools ?? [];
    const mappedTools = mapTools(tools, 'claude');

    // Map model
    const model = mapModel(persona.frontmatter.model ?? 'default', 'claude');

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
   * Generate settings.json with hooks and commands
   */
  private generateSettings(
    hooks: ParsedHook[],
    commands: ParsedCommand[],
    options: GeneratorOptions
  ): GeneratedFile {
    const settings: ClaudeSettings = {};

    // Add generated marker
    if (options.addHeaders) {
      settings.__generated_by = 'ai-tool-sync - DO NOT EDIT DIRECTLY';
    }

    // Process hooks
    if (hooks.length > 0) {
      const sortedHooks = sortHooksByEvent(hooks);
      settings.hooks = {};

      for (const hook of sortedHooks) {
        const event = hook.frontmatter.event;
        if (!settings.hooks[event]) {
          settings.hooks[event] = [];
        }

        const hookConfig: ClaudeHookConfig = {
          matcher: hook.frontmatter.tool_match ?? '*',
          hooks: [],
        };

        // Add execute command if present
        if (hook.frontmatter.execute) {
          hookConfig.hooks.push(hook.frontmatter.execute);
        }

        settings.hooks[event]!.push(hookConfig);
      }
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
}

/**
 * Create a new Claude generator instance
 */
export function createClaudeGenerator(): ClaudeGenerator {
  return new ClaudeGenerator();
}
