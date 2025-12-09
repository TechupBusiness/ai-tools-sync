/**
 * @file Subfolder Context Generator
 * @description Generate CLAUDE.md and AGENTS.md in configured subfolders
 *
 * This generator creates context files in project subfolders, allowing teams
 * to have specialized AI context for different parts of a monorepo or project.
 * Each subfolder context includes only the rules and personas specified in config.
 */

import * as path from 'node:path';

import { ensureDir, joinPath, writeFile } from '../utils/fs.js';

import {
  type GeneratedFile,
  type Generator,
  type GeneratorOptions,
  type GenerateResult,
  type ResolvedContent,
  DO_NOT_EDIT_HEADER,
  emptyGenerateResult,
  sortCommandsByName,
  sortPersonasByName,
  sortRulesByPriority,
  toSafeFilename,
} from './base.js';

import type { TargetType } from '../parsers/types.js';

/**
 * Configuration for a single subfolder context
 */
export interface SubfolderContextConfig {
  /**
   * Path to the subfolder (relative to project root)
   */
  path: string;

  /**
   * Rule names to include in this subfolder
   */
  rules?: string[] | undefined;

  /**
   * Persona names to include in this subfolder
   */
  personas?: string[] | undefined;

  /**
   * Command names to include in this subfolder
   */
  commands?: string[] | undefined;

  /**
   * Description of this subfolder context
   */
  description?: string | undefined;

  /**
   * Targets to generate for this subfolder (defaults to all)
   */
  targets?: TargetType[] | undefined;
}

/**
 * Options specific to subfolder context generation
 */
export interface SubfolderContextOptions extends GeneratorOptions {
  /**
   * Subfolder configurations
   */
  subfolders: SubfolderContextConfig[];
}

/**
 * Generator for subfolder context files
 */
export class SubfolderContextGenerator implements Generator {
  readonly name = 'subfolder' as const;

  private subfolders: SubfolderContextConfig[];

  constructor(subfolders: SubfolderContextConfig[] = []) {
    this.subfolders = subfolders;
  }

  /**
   * Set subfolder configurations
   */
  setSubfolders(subfolders: SubfolderContextConfig[]): void {
    this.subfolders = subfolders;
  }

  async generate(
    content: ResolvedContent,
    options: GeneratorOptions = {}
  ): Promise<GenerateResult> {
    const result = emptyGenerateResult();
    const outputDir = options.outputDir ?? content.projectRoot;
    const generated: GeneratedFile[] = [];

    // If subfolders passed via options, use those
    const subfolderOptions = options as SubfolderContextOptions;
    const subfolders = subfolderOptions.subfolders ?? this.subfolders;

    if (subfolders.length === 0) {
      result.warnings.push('No subfolder configurations provided');
      return result;
    }

    // Generate context for each subfolder
    for (const config of subfolders) {
      const targets = config.targets ?? ['cursor', 'claude', 'factory'];

      // Filter content for this subfolder
      const filteredContent = this.filterContentForSubfolder(content, config);

      // Generate CLAUDE.md for Claude target
      if (targets.includes('claude')) {
        const claudeMd = this.generateClaudeMd(filteredContent, config, options);
        generated.push(claudeMd);
      }

      // Generate AGENTS.md for Cursor/Factory targets
      if (targets.includes('cursor') || targets.includes('factory')) {
        const agentsMd = this.generateAgentsMd(filteredContent, config, options);
        generated.push(agentsMd);
      }
    }

    // Write files if not dry run
    if (!options.dryRun) {
      for (const file of generated) {
        const filePath = joinPath(outputDir, file.path);
        await ensureDir(path.dirname(filePath));
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
   * Filter content to only include items specified in subfolder config
   */
  private filterContentForSubfolder(
    content: ResolvedContent,
    config: SubfolderContextConfig
  ): ResolvedContent {
    const ruleNames = new Set(config.rules ?? []);
    const personaNames = new Set(config.personas ?? []);
    const commandNames = new Set(config.commands ?? []);

    return {
      ...content,
      rules:
        ruleNames.size > 0 ? content.rules.filter((r) => ruleNames.has(r.frontmatter.name)) : [],
      personas:
        personaNames.size > 0
          ? content.personas.filter((p) => personaNames.has(p.frontmatter.name))
          : [],
      commands:
        commandNames.size > 0
          ? content.commands.filter((c) => commandNames.has(c.frontmatter.name))
          : [],
      hooks: [], // Hooks are not typically per-subfolder
    };
  }

  /**
   * Generate CLAUDE.md for a subfolder
   */
  private generateClaudeMd(
    content: ResolvedContent,
    config: SubfolderContextConfig,
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

    if (config.description) {
      parts.push(`> ${config.description}`);
      parts.push('');
    }

    // Calculate relative path to .claude from this subfolder
    const depth = config.path.split('/').filter(Boolean).length;
    const relativePath = '../'.repeat(depth);

    // List skills
    if (content.rules.length > 0) {
      parts.push('## Relevant Skills');
      parts.push('');
      const sortedRules = sortRulesByPriority(content.rules);
      for (const rule of sortedRules) {
        const skillPath = path.posix.join(
          relativePath,
          '.claude/skills',
          toSafeFilename(rule.frontmatter.name),
          'SKILL.md'
        );
        parts.push(`@import ${skillPath}`);
      }
      parts.push('');
    }

    // List agents
    if (content.personas.length > 0) {
      parts.push('## Recommended Agents');
      parts.push('');
      const sortedPersonas = sortPersonasByName(content.personas);
      for (const persona of sortedPersonas) {
        const agentPath = path.posix.join(
          relativePath,
          '.claude/agents',
          `${toSafeFilename(persona.frontmatter.name)}.md`
        );
        const desc = persona.frontmatter.description ? ` - ${persona.frontmatter.description}` : '';
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
        const desc = cmd.frontmatter.description ? ` - ${cmd.frontmatter.description}` : '';
        parts.push(`- /${toSafeFilename(cmd.frontmatter.name)}${desc}`);
      }
      parts.push('');
    }

    return {
      path: joinPath(config.path, 'CLAUDE.md'),
      content: parts.join('\n'),
      type: 'entrypoint',
    };
  }

  /**
   * Generate AGENTS.md for a subfolder
   */
  private generateAgentsMd(
    content: ResolvedContent,
    config: SubfolderContextConfig,
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

    if (config.description) {
      parts.push(`> ${config.description}`);
      parts.push('');
    }

    // Calculate relative path to .factory/.cursor from this subfolder
    const depth = config.path.split('/').filter(Boolean).length;
    const relativePath = '../'.repeat(depth);

    // List skills/rules
    if (content.rules.length > 0) {
      parts.push('## Relevant Skills');
      parts.push('');
      const sortedRules = sortRulesByPriority(content.rules);
      for (const rule of sortedRules) {
        const skillPath = path.posix.join(
          relativePath,
          '.factory/skills',
          toSafeFilename(rule.frontmatter.name),
          'SKILL.md'
        );
        const desc = rule.frontmatter.description ? ` - ${rule.frontmatter.description}` : '';
        parts.push(`- [${rule.frontmatter.name}](${skillPath})${desc}`);
      }
      parts.push('');
    }

    // List droids/personas
    if (content.personas.length > 0) {
      parts.push('## Recommended Droids');
      parts.push('');
      const sortedPersonas = sortPersonasByName(content.personas);
      for (const persona of sortedPersonas) {
        const droidPath = path.posix.join(
          relativePath,
          '.factory/droids',
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
          relativePath,
          '.factory/commands',
          `${toSafeFilename(cmd.frontmatter.name)}.md`
        );
        const desc = cmd.frontmatter.description ? ` - ${cmd.frontmatter.description}` : '';
        parts.push(`- [${cmd.frontmatter.name}](${cmdPath})${desc}`);
      }
      parts.push('');
    }

    return {
      path: joinPath(config.path, 'AGENTS.md'),
      content: parts.join('\n'),
      type: 'entrypoint',
    };
  }
}

/**
 * Create a new SubfolderContext generator instance
 */
export function createSubfolderContextGenerator(
  subfolders: SubfolderContextConfig[] = []
): SubfolderContextGenerator {
  return new SubfolderContextGenerator(subfolders);
}
