/**
 * @file Claude Plugin Loader
 * @description Load content from Claude-native plugin format
 *
 * Transforms Claude's native plugin structure to the generic ai-tool-sync format.
 * Claude plugins can have:
 * - skills/ directory with SKILL.md files
 * - agents/ directory with agent markdown files
 * - settings.json with hooks configuration
 *
 * Supports:
 * - Local Claude plugins: claude-plugin:./path/to/plugin
 * - npm Claude plugins: claude-plugin:npm:@anthropic/plugin-name
 * - Direct path: claude-plugin:/absolute/path
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { logger } from '../utils/logger.js';
import { resolvePluginRootVariable } from '../utils/plugin-cache.js';
import { parseYaml } from '../utils/yaml.js';

import {
  type Loader,
  type LoaderOptions,
  type LoadError,
  type LoadResult,
  emptyLoadResultWithSource,
} from './base.js';

import type { ParsedCommand } from '../parsers/command.js';
import type { ParsedHook, HookEvent } from '../parsers/hook.js';
import type { ParsedPersona, PersonaTool } from '../parsers/persona.js';
import type { ParsedRule, RuleCategory } from '../parsers/rule.js';
import type { TargetType } from '../parsers/types.js';
import type { PluginCache } from '../utils/plugin-cache.js';


/**
 * Claude plugin prefix
 */
export const CLAUDE_PLUGIN_PREFIX = 'claude-plugin:';

/**
 * Claude skill frontmatter structure
 */
export interface ClaudeSkillFrontmatter {
  name?: string;
  description?: string;
  trigger?: string | string[];
  globs?: string[];
  always_apply?: boolean;
  [key: string]: unknown;
}

/**
 * Claude agent frontmatter structure
 */
export interface ClaudeAgentFrontmatter {
  name?: string;
  description?: string;
  tools?: string[];
  model?: string;
  [key: string]: unknown;
}

/**
 * Claude settings.json structure
 */
export interface ClaudeSettings {
  hooks?: {
    PreToolUse?: ClaudeHook[];
    PostToolUse?: ClaudeHook[];
    Notification?: ClaudeHook[];
    Stop?: ClaudeHook[];
  };
  mcp_servers?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Claude hook configuration
 */
export interface ClaudeHook {
  name?: string;
  match?: string;
  command?: string;
  script?: string;
  action?: 'allow' | 'deny' | 'warn' | 'ask';
  message?: string;
}

/**
 * Claude plugin metadata
 */
export interface ClaudePluginInfo {
  /** Plugin name */
  name: string;
  /** Plugin version (if available) */
  version?: string;
  /** Path to the plugin directory */
  path: string;
  /** Whether this is a native Claude plugin format */
  isNative: boolean;
}

/**
 * Options specific to Claude plugin loader
 */
export interface ClaudePluginLoaderOptions extends LoaderOptions {
  /**
   * Search paths for npm packages (when using npm: sub-prefix)
   */
  nodeModulesPaths?: string[];

  /**
   * Whether to preserve Claude-specific metadata
   */
  preserveMetadata?: boolean;

  /**
   * Plugin cache instance (for centralized caching)
   */
  pluginCache?: PluginCache;

  /**
   * Whether to use disk-based caching (default: true)
   */
  useCache?: boolean;

  /**
   * Version to use for caching (overrides source version)
   */
  version?: string;
}

/**
 * Cache for resolved plugin paths
 */
const pluginPathCache = new Map<string, string>();

/**
 * Loader for Claude-native plugins
 */
export class ClaudePluginLoader implements Loader {
  readonly name = 'claude-plugin';

  /**
   * Check if this loader can handle the given source
   * Claude plugin loader handles:
   * - Sources starting with 'claude-plugin:'
   */
  canLoad(source: string): boolean {
    return source.startsWith(CLAUDE_PLUGIN_PREFIX);
  }

  /**
   * Load content from a Claude plugin
   *
   * @param source - Claude plugin identifier
   * @param options - Loading options
   * @returns LoadResult containing transformed content
   */
  async load(source: string, options?: ClaudePluginLoaderOptions): Promise<LoadResult> {
    const result = emptyLoadResultWithSource(source);
    const errors: LoadError[] = [];

    // Parse the source to get plugin path
    const pluginPath = await this.resolvePluginPath(source, options);

    if (!pluginPath) {
      errors.push({
        type: 'directory',
        path: source,
        message: `Could not resolve Claude plugin: ${source}`,
      });
      result.errors = errors;
      return result;
    }

    logger.debug(`Loading Claude plugin from: ${pluginPath}`);

    // Check if plugin directory exists
    if (!this.directoryExists(pluginPath)) {
      errors.push({
        type: 'directory',
        path: pluginPath,
        message: `Claude plugin directory does not exist: ${pluginPath}`,
      });
      result.errors = errors;
      return result;
    }

    // Load skills (transform to rules)
    const skillsResult = await this.loadSkills(pluginPath, options);
    result.rules = skillsResult.items;
    errors.push(...skillsResult.errors);

    // Load agents (transform to personas)
    const agentsResult = await this.loadAgents(pluginPath, options);
    result.personas = agentsResult.items;
    errors.push(...agentsResult.errors);

    // Load hooks from settings.json
    const hooksResult = await this.loadHooks(pluginPath, options);
    result.hooks = hooksResult.items;
    errors.push(...hooksResult.errors);

    // Load commands (if any)
    const commandsResult = await this.loadCommands(pluginPath, options);
    result.commands = commandsResult.items;
    errors.push(...commandsResult.errors);

    // Filter by target if specified
    if (options?.targets && options.targets.length > 0) {
      const targets = options.targets;
      result.rules = result.rules.filter((r) =>
        this.matchesTargets(r.frontmatter.targets, targets)
      );
      result.personas = result.personas.filter((p) =>
        this.matchesTargets(p.frontmatter.targets, targets)
      );
      result.commands = result.commands.filter((c) =>
        this.matchesTargets(c.frontmatter.targets, targets)
      );
      result.hooks = result.hooks.filter((h) =>
        this.matchesTargets(h.frontmatter.targets, targets)
      );
    }

    if (errors.length > 0) {
      result.errors = errors;
    }

    logger.debug(
      `Loaded Claude plugin: ${result.rules.length} rules, ${result.personas.length} personas, ` +
      `${result.commands.length} commands, ${result.hooks.length} hooks`
    );

    return result;
  }

  /**
   * Resolve plugin source to actual path
   */
  private async resolvePluginPath(
    source: string,
    options?: ClaudePluginLoaderOptions
  ): Promise<string | null> {
    // Remove the claude-plugin: prefix
    const spec = source.slice(CLAUDE_PLUGIN_PREFIX.length);

    // Check centralized plugin cache first
    if (options?.pluginCache && options.useCache !== false) {
      const version = options.version ?? this.extractVersion(spec);
      if (await options.pluginCache.isCached(source, version)) {
        const entry = options.pluginCache.getCacheEntry(source, version);
        if (entry) {
          const cachedPath = options.pluginCache.getPluginPath(entry.id);
          await options.pluginCache.touchPlugin(source, version);
          logger.debug(`Using cached plugin: ${cachedPath}`);
          return cachedPath;
        }
      }
    }

    // Fall back to in-memory cache
    if (pluginPathCache.has(source)) {
      return pluginPathCache.get(source)!;
    }

    let resolvedPath: string | null = null;

    // Check for npm: sub-prefix
    if (spec.startsWith('npm:')) {
      resolvedPath = await this.resolveNpmPlugin(spec.slice(4), options);
    }
    // Absolute path
    else if (spec.startsWith('/')) {
      resolvedPath = spec;
    }
    // Relative path
    else if (spec.startsWith('./') || spec.startsWith('../')) {
      const basePath = options?.basePath ?? process.cwd();
      resolvedPath = path.resolve(basePath, spec);
    }
    // Just a name - try to find in .claude directory or node_modules
    else {
      resolvedPath = await this.findPluginByName(spec, options);
    }

    if (resolvedPath) {
      pluginPathCache.set(source, resolvedPath);
    }

    return resolvedPath;
  }

  /**
   * Extract version from source spec
   */
  private extractVersion(spec: string): string | undefined {
    // Handle npm:@org/pkg@1.0.0 format
    const atIndex = spec.lastIndexOf('@');
    if (atIndex > 0 && !spec.startsWith('@')) {
      const version = spec.slice(atIndex + 1);
      if (/^\d/.test(version)) {
        return version;
      }
    }

    // Handle github:owner/repo#v1.0.0 format
    const hashIndex = spec.indexOf('#');
    if (hashIndex > 0) {
      return spec.slice(hashIndex + 1);
    }

    return undefined;
  }

  /**
   * Resolve npm package for Claude plugin
   */
  private async resolveNpmPlugin(
    packageSpec: string,
    options?: ClaudePluginLoaderOptions
  ): Promise<string | null> {
    // Parse package name (handle @scope/name and versions)
    const { packageName } = this.parseNpmSpec(packageSpec);

    // Search in node_modules
    const searchPaths = options?.nodeModulesPaths ?? this.getDefaultNodeModulesPaths();

    for (const searchPath of searchPaths) {
      const packagePath = path.join(searchPath, packageName);

      // Check for .claude directory in package
      const claudePath = path.join(packagePath, '.claude');
      if (this.directoryExists(claudePath)) {
        return claudePath;
      }

      // Check package root
      if (this.directoryExists(packagePath)) {
        const packageJsonPath = path.join(packagePath, 'package.json');
        if (this.fileExists(packageJsonPath)) {
          try {
            const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
            const packageJson = JSON.parse(content) as { claudePlugin?: { path?: string } };

            // Check for claudePlugin.path in package.json
            if (packageJson.claudePlugin?.path) {
              return path.join(packagePath, packageJson.claudePlugin.path);
            }
          } catch {
            // Ignore JSON parse errors
          }

          // Default to package root if it has skills/agents directories
          if (
            this.directoryExists(path.join(packagePath, 'skills')) ||
            this.directoryExists(path.join(packagePath, 'agents'))
          ) {
            return packagePath;
          }
        }
      }
    }

    return null;
  }

  /**
   * Parse npm package specifier
   */
  private parseNpmSpec(spec: string): { packageName: string; version?: string } {
    // Handle scoped packages
    if (spec.startsWith('@')) {
      const firstSlash = spec.indexOf('/');
      if (firstSlash === -1) {
        return { packageName: spec };
      }

      const afterSlash = spec.slice(firstSlash + 1);
      const versionAt = afterSlash.indexOf('@');

      if (versionAt === -1) {
        return { packageName: spec };
      }

      return {
        packageName: spec.slice(0, firstSlash + 1 + versionAt),
        version: afterSlash.slice(versionAt + 1),
      };
    }

    // Handle unscoped packages
    const atIndex = spec.indexOf('@');
    if (atIndex === -1) {
      return { packageName: spec };
    }

    return {
      packageName: spec.slice(0, atIndex),
      version: spec.slice(atIndex + 1),
    };
  }

  /**
   * Find plugin by name in common locations
   */
  private async findPluginByName(
    name: string,
    options?: ClaudePluginLoaderOptions
  ): Promise<string | null> {
    const basePath = options?.basePath ?? process.cwd();

    // Try .claude/plugins/<name>
    const pluginsPath = path.join(basePath, '.claude', 'plugins', name);
    if (this.directoryExists(pluginsPath)) {
      return pluginsPath;
    }

    // Try .ai/plugins/<name>
    const aiPluginsPath = path.join(basePath, '.ai', 'plugins', name);
    if (this.directoryExists(aiPluginsPath)) {
      return aiPluginsPath;
    }

    // Try node_modules
    return this.resolveNpmPlugin(name, options);
  }

  /**
   * Get default node_modules paths
   */
  private getDefaultNodeModulesPaths(): string[] {
    const paths: string[] = [];
    let current = process.cwd();
    const root = path.parse(current).root;

    while (current !== root) {
      paths.push(path.join(current, 'node_modules'));
      current = path.dirname(current);
    }

    return paths;
  }

  /**
   * Load skills from Claude plugin and transform to rules
   */
  private async loadSkills(
    pluginPath: string,
    options?: ClaudePluginLoaderOptions
  ): Promise<{ items: ParsedRule[]; errors: LoadError[] }> {
    const items: ParsedRule[] = [];
    const errors: LoadError[] = [];

    const skillsDir = path.join(pluginPath, 'skills');

    if (!this.directoryExists(skillsDir)) {
      return { items, errors };
    }

    try {
      const entries = await fs.promises.readdir(skillsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Claude skills are in subdirectories with SKILL.md
          const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
          if (this.fileExists(skillFile)) {
            const result = await this.parseSkillFile(skillFile, entry.name, options);
            if (result.ok) {
              items.push(result.value);
            } else {
              errors.push(result.error);
            }
          }
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Also support flat .md files
          const skillFile = path.join(skillsDir, entry.name);
          const skillName = entry.name.replace(/\.md$/, '');
          const result = await this.parseSkillFile(skillFile, skillName, options);
          if (result.ok) {
            items.push(result.value);
          } else {
            errors.push(result.error);
          }
        }
      }
    } catch (error) {
      errors.push({
        type: 'directory',
        path: skillsDir,
        message: `Failed to read skills directory: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return { items, errors };
  }

  /**
   * Parse a skill file and transform to rule
   */
  private async parseSkillFile(
    filePath: string,
    skillName: string,
    _options?: ClaudePluginLoaderOptions
  ): Promise<{ ok: true; value: ParsedRule } | { ok: false; error: LoadError }> {
    try {
      let content = await fs.promises.readFile(filePath, 'utf-8');
      
      // Resolve ${CLAUDE_PLUGIN_ROOT} variable
      // For skills/<name>/SKILL.md, go up 3 levels; for flat skills/skill.md, go up 2 levels
      const dirname = path.dirname(filePath);
      const parentDirName = path.basename(dirname);
      let pluginRoot: string;
      
      if (parentDirName === 'skills') {
        // Flat structure: skills/skill.md -> go up 2 levels
        pluginRoot = path.dirname(dirname);
      } else {
        // Nested structure: skills/<name>/SKILL.md -> go up 3 levels
        pluginRoot = path.dirname(path.dirname(dirname));
      }
      
      content = resolvePluginRootVariable(content, pluginRoot);
      
      const { frontmatter, body } = this.extractFrontmatter<ClaudeSkillFrontmatter>(content);

      // Build rule frontmatter with only defined properties
      const ruleFrontmatter: ParsedRule['frontmatter'] = {
        name: frontmatter?.name ?? skillName,
        description: frontmatter?.description ?? `Claude skill: ${skillName}`,
        version: '1.0.0',
        always_apply: frontmatter?.always_apply ?? false,
        targets: ['cursor', 'claude', 'factory'] as TargetType[],
        category: 'other' as RuleCategory, // Claude skills map to 'other' category
        priority: 'medium' as const,
      };

      // Only add globs if we have them
      const globs = this.normalizeGlobs(frontmatter?.trigger, frontmatter?.globs);
      if (globs && globs.length > 0) {
        ruleFrontmatter.globs = globs;
      }

      const rule: ParsedRule = {
        frontmatter: ruleFrontmatter,
        content: body,
        filePath,
      };

      return { ok: true, value: rule };
    } catch (error) {
      return {
        ok: false,
        error: {
          type: 'rule',
          path: filePath,
          message: `Failed to parse skill file: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  /**
   * Load agents from Claude plugin and transform to personas
   */
  private async loadAgents(
    pluginPath: string,
    options?: ClaudePluginLoaderOptions
  ): Promise<{ items: ParsedPersona[]; errors: LoadError[] }> {
    const items: ParsedPersona[] = [];
    const errors: LoadError[] = [];

    const agentsDir = path.join(pluginPath, 'agents');

    if (!this.directoryExists(agentsDir)) {
      return { items, errors };
    }

    try {
      const entries = await fs.promises.readdir(agentsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const agentFile = path.join(agentsDir, entry.name);
          const agentName = entry.name.replace(/\.md$/, '');
          const result = await this.parseAgentFile(agentFile, agentName, options);
          if (result.ok) {
            items.push(result.value);
          } else {
            errors.push(result.error);
          }
        }
      }
    } catch (error) {
      errors.push({
        type: 'directory',
        path: agentsDir,
        message: `Failed to read agents directory: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return { items, errors };
  }

  /**
   * Parse an agent file and transform to persona
   */
  private async parseAgentFile(
    filePath: string,
    agentName: string,
    _options?: ClaudePluginLoaderOptions
  ): Promise<{ ok: true; value: ParsedPersona } | { ok: false; error: LoadError }> {
    try {
      let content = await fs.promises.readFile(filePath, 'utf-8');
      
      // Resolve ${CLAUDE_PLUGIN_ROOT} variable
      // Plugin root is typically 2 levels up from agents/<name>.md
      const pluginRoot = path.dirname(path.dirname(filePath));
      content = resolvePluginRootVariable(content, pluginRoot);
      
      const { frontmatter, body } = this.extractFrontmatter<ClaudeAgentFrontmatter>(content);

      // Transform Claude agent to generic persona
      const persona: ParsedPersona = {
        frontmatter: {
          name: frontmatter?.name ?? agentName,
          description: frontmatter?.description ?? `Claude agent: ${agentName}`,
          version: '1.0.0',
          tools: this.normalizeTools(frontmatter?.tools) as PersonaTool[],
          model: frontmatter?.model ?? 'default',
          targets: ['cursor', 'claude', 'factory'] as TargetType[],
        },
        content: body,
        filePath,
      };

      return { ok: true, value: persona };
    } catch (error) {
      return {
        ok: false,
        error: {
          type: 'persona',
          path: filePath,
          message: `Failed to parse agent file: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  /**
   * Load hooks from settings.json
   */
  private async loadHooks(
    pluginPath: string,
    _options?: ClaudePluginLoaderOptions
  ): Promise<{ items: ParsedHook[]; errors: LoadError[] }> {
    const items: ParsedHook[] = [];
    const errors: LoadError[] = [];

    const settingsPath = path.join(pluginPath, 'settings.json');

    if (!this.fileExists(settingsPath)) {
      return { items, errors };
    }

    try {
      const content = await fs.promises.readFile(settingsPath, 'utf-8');
      const settings = JSON.parse(content) as ClaudeSettings;

      if (settings.hooks) {
        // Transform each hook type
        for (const [eventType, hooks] of Object.entries(settings.hooks)) {
          if (!Array.isArray(hooks)) continue;

          for (const hook of hooks) {
            const parsedHook = this.transformHook(hook, eventType, settingsPath);
            items.push(parsedHook);
          }
        }
      }
    } catch (error) {
      errors.push({
        type: 'hook',
        path: settingsPath,
        message: `Failed to parse settings.json: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return { items, errors };
  }

  /**
   * Transform a Claude hook to generic format
   */
  private transformHook(
    hook: ClaudeHook,
    eventType: string,
    filePath: string
  ): ParsedHook {
    // Map Claude event types to generic hook events
    const eventMap: Record<string, HookEvent> = {
      PreToolUse: 'PreToolUse',
      PostToolUse: 'PostToolUse',
      Notification: 'PreMessage', // Map Notification to PreMessage
      Stop: 'PostMessage', // Map Stop to PostMessage
    };

    // Build hook frontmatter with only defined properties
    const hookFrontmatter: ParsedHook['frontmatter'] = {
      name: hook.name ?? `${eventType.toLowerCase()}-hook`,
      description: hook.message ?? `Claude ${eventType} hook`,
      version: '1.0.0',
      event: eventMap[eventType] ?? 'PreToolUse',
      targets: ['claude'] as TargetType[], // Hooks are Claude-specific
    };

    // Only add tool_match if defined
    if (hook.match) {
      hookFrontmatter.tool_match = hook.match;
    }

    // Only add execute if defined
    const execute = hook.command ?? hook.script;
    if (execute) {
      hookFrontmatter.execute = execute;
    }

    return {
      frontmatter: hookFrontmatter,
      content: hook.message ?? '',
      filePath,
    };
  }

  /**
   * Load commands from Claude plugin
   */
  private async loadCommands(
    pluginPath: string,
    _options?: ClaudePluginLoaderOptions
  ): Promise<{ items: ParsedCommand[]; errors: LoadError[] }> {
    const items: ParsedCommand[] = [];
    const errors: LoadError[] = [];

    const commandsDir = path.join(pluginPath, 'commands');

    if (!this.directoryExists(commandsDir)) {
      return { items, errors };
    }

    try {
      const entries = await fs.promises.readdir(commandsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const commandFile = path.join(commandsDir, entry.name);
          const commandName = entry.name.replace(/\.md$/, '');
          const result = await this.parseCommandFile(commandFile, commandName);
          if (result.ok) {
            items.push(result.value);
          } else {
            errors.push(result.error);
          }
        }
      }
    } catch (error) {
      errors.push({
        type: 'directory',
        path: commandsDir,
        message: `Failed to read commands directory: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return { items, errors };
  }

  /**
   * Parse a command file
   */
  private async parseCommandFile(
    filePath: string,
    commandName: string
  ): Promise<{ ok: true; value: ParsedCommand } | { ok: false; error: LoadError }> {
    try {
      let content = await fs.promises.readFile(filePath, 'utf-8');
      
      // Resolve ${CLAUDE_PLUGIN_ROOT} variable
      // Plugin root is typically 2 levels up from commands/<name>.md
      const pluginRoot = path.dirname(path.dirname(filePath));
      content = resolvePluginRootVariable(content, pluginRoot);
      
      const { frontmatter, body } = this.extractFrontmatter<Record<string, unknown>>(content);

      // Build frontmatter with only defined properties
      const commandFrontmatter: ParsedCommand['frontmatter'] = {
        name: (frontmatter?.name as string) ?? commandName,
        description: (frontmatter?.description as string) ?? `Claude command: ${commandName}`,
        version: '1.0.0',
        targets: ['cursor', 'claude', 'factory'] as TargetType[],
      };

      // Only add execute if present
      if (typeof frontmatter?.execute === 'string') {
        commandFrontmatter.execute = frontmatter.execute;
      }

      // Only add args if present and is an array with items
      if (Array.isArray(frontmatter?.args) && frontmatter.args.length > 0) {
        // Cast to the proper type (we've verified it's an array with items)
        const args = frontmatter.args;
        commandFrontmatter.args = args as NonNullable<ParsedCommand['frontmatter']['args']>;
      }

      const command: ParsedCommand = {
        frontmatter: commandFrontmatter,
        content: body,
        filePath,
      };

      return { ok: true, value: command };
    } catch (error) {
      return {
        ok: false,
        error: {
          type: 'command',
          path: filePath,
          message: `Failed to parse command file: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  /**
   * Extract frontmatter from markdown content
   */
  private extractFrontmatter<T>(content: string): { frontmatter: T | undefined; body: string } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!frontmatterMatch) {
      return { frontmatter: undefined, body: content };
    }

    try {
      const yaml = frontmatterMatch[1] ?? '';
      const body = frontmatterMatch[2] ?? '';
      const result = parseYaml(yaml);

      if (result.ok) {
        return { frontmatter: result.value as T, body };
      }
    } catch {
      // Ignore YAML parse errors
    }

    return { frontmatter: undefined, body: content };
  }

  /**
   * Normalize globs from Claude trigger format
   * Returns undefined if no globs are found
   */
  private normalizeGlobs(
    trigger?: string | string[],
    globs?: string[]
  ): string[] | undefined {
    const result: string[] = [];

    // Add explicit globs
    if (globs && Array.isArray(globs)) {
      result.push(...globs);
    }

    // Convert trigger to globs
    if (trigger) {
      const triggers = Array.isArray(trigger) ? trigger : [trigger];
      for (const t of triggers) {
        // If trigger looks like a glob, use it directly
        if (t.includes('*') || t.includes('/')) {
          result.push(t);
        }
        // Otherwise treat as file extension pattern
        else if (t.startsWith('.')) {
          result.push(`**/*${t}`);
        }
      }
    }

    // Return undefined instead of empty array to avoid optional property issues
    return result.length > 0 ? result : undefined;
  }

  /**
   * Normalize tools array
   */
  private normalizeTools(tools?: string[]): string[] {
    const defaultTools = ['read', 'write', 'edit', 'execute', 'search', 'glob'];

    if (!tools || !Array.isArray(tools)) {
      return defaultTools;
    }

    // Map Claude tool names to generic names
    const toolMap: Record<string, string> = {
      Read: 'read',
      Write: 'write',
      Edit: 'edit',
      Bash: 'execute',
      Search: 'search',
      Glob: 'glob',
      Fetch: 'fetch',
      LS: 'ls',
    };

    return tools.map((t) => toolMap[t] ?? t.toLowerCase());
  }

  /**
   * Check if content targets match requested targets
   */
  private matchesTargets(
    contentTargets: TargetType[] | undefined,
    requestedTargets: TargetType[]
  ): boolean {
    const targets = contentTargets ?? ['cursor', 'claude', 'factory'];
    return requestedTargets.some((t) => targets.includes(t));
  }

  /**
   * Check if directory exists (sync)
   */
  private directoryExists(dirPath: string): boolean {
    try {
      const stat = fs.statSync(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if file exists (sync)
   */
  private fileExists(filePath: string): boolean {
    try {
      const stat = fs.statSync(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }
}

/**
 * Create a ClaudePluginLoader instance
 */
export function createClaudePluginLoader(): ClaudePluginLoader {
  return new ClaudePluginLoader();
}

/**
 * Clear the plugin path cache
 */
export function clearClaudePluginCache(): void {
  pluginPathCache.clear();
}

/**
 * Get cached plugin paths (for testing/debugging)
 */
export function getClaudePluginCacheEntries(): Map<string, string> {
  return new Map(pluginPathCache);
}

