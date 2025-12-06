/**
 * @file Factory Generator
 * @description Generate .factory/ directory structure and AGENTS.md for Factory
 *
 * Factory format:
 * - Skills: .factory/skills/<name>/SKILL.md
 * - Droids: .factory/droids/<name>.md (personas)
 * - Commands: .factory/commands/<name>.md
 * - Hooks: NOT documented/supported
 * - Entry point: AGENTS.md
 */

import * as path from 'node:path';

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
  DO_NOT_EDIT_HEADER,
  emptyGenerateResult,
  filterContentByTarget,
  sortCommandsByName,
  sortPersonasByName,
  sortRulesByPriority,
  toSafeFilename,
} from './base.js';

import type { ParsedCommand } from '../parsers/command.js';
import type { ParsedPersona } from '../parsers/persona.js';
import type { ParsedRule } from '../parsers/rule.js';


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

    // Handle hooks - warn and skip (Factory doesn't support hooks)
    if (factoryContent.hooks.length > 0) {
      result.warnings.push(
        `Factory does not support hooks. ${factoryContent.hooks.length} hook(s) will be skipped.`
      );
    }

    // Clean if requested
    if (options.clean && !options.dryRun) {
      const deleted = await this.cleanOutputDirs(outputDir);
      result.deleted.push(...deleted);
    }

    // Generate skills (rules)
    const skillFiles = await this.generateSkills(
      factoryContent.rules,
      outputDir,
      options
    );
    generated.push(...skillFiles);

    // Generate droids (personas)
    const droidFiles = await this.generateDroids(
      factoryContent.personas,
      outputDir,
      options
    );
    generated.push(...droidFiles);

    // Generate commands
    const commandFiles = await this.generateCommands(
      factoryContent.commands,
      outputDir,
      options
    );
    generated.push(...commandFiles);

    // Generate AGENTS.md entry point
    const agentsMd = this.generateAgentsMd(factoryContent, options);
    generated.push(agentsMd);

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

    // Map tools to Factory-specific names
    const tools = persona.frontmatter.tools ?? [];
    const mappedTools = mapTools(tools, 'factory');

    // Map model
    const model = mapModel(persona.frontmatter.model ?? 'default', 'factory');

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

    // Add body content
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
   * Generate AGENTS.md entry point
   */
  private generateAgentsMd(
    content: ResolvedContent,
    options: GeneratorOptions
  ): GeneratedFile {
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
        const desc = persona.frontmatter.description
          ? ` - ${persona.frontmatter.description}`
          : '';
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
        const desc = cmd.frontmatter.description
          ? ` - ${cmd.frontmatter.description}`
          : '';
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
}

/**
 * Create a new Factory generator instance
 */
export function createFactoryGenerator(): FactoryGenerator {
  return new FactoryGenerator();
}
