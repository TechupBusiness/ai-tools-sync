/**
 * @file Local Loader
 * @description Load content from local directories
 *
 * Loads rules, personas, commands, and hooks from a local directory structure.
 * Expected structure:
 *   source/
 *   ├── rules/     - Rule markdown files
 *   ├── personas/  - Persona markdown files
 *   ├── commands/  - Command markdown files
 *   └── hooks/     - Hook markdown files
 */

import * as path from 'node:path';

import { parseCommand } from '../parsers/command.js';
import { parseHook } from '../parsers/hook.js';
import { parsePersona } from '../parsers/persona.js';
import { parseRule } from '../parsers/rule.js';
import { dirExists, findMarkdownFiles, readFile, isAbsolutePath } from '../utils/fs.js';
import { logger } from '../utils/logger.js';

import {
  type Loader,
  type LoaderOptions,
  type LoadError,
  type LoadResult,
  DEFAULT_DIRECTORIES,
  emptyLoadResultWithSource,
} from './base.js';

import type { ParseError, TargetType } from '../parsers/types.js';

/**
 * Content type definitions for loading
 */
type ContentType = 'rule' | 'persona' | 'command' | 'hook';

/**
 * Parser function signature
 */
type ParserFn<T> = (
  content: string,
  filePath?: string
) => { ok: true; value: T } | { ok: false; error: ParseError };

/**
 * Loader for local file system directories
 */
export class LocalLoader implements Loader {
  readonly name = 'local';

  /**
   * Check if this loader can handle the given source
   * Local loader handles:
   * - Absolute paths (starting with /)
   * - Relative paths (starting with ./ or ../)
   * - Plain directory names (no protocol prefix)
   */
  canLoad(source: string): boolean {
    // Reject URLs and protocol prefixes
    if (source.includes('://')) {
      return false;
    }

    // Reject npm/pip style package names
    if (source.startsWith('npm:') || source.startsWith('pip:')) {
      return false;
    }

    // Accept absolute paths
    if (isAbsolutePath(source)) {
      return true;
    }

    // Accept relative paths
    if (source.startsWith('./') || source.startsWith('../')) {
      return true;
    }

    // Accept plain directory names (no special characters except - and _)
    // This includes special values like 'ai-tool-sync' (defaults)
    return /^[\w\-./]+$/.test(source);
  }

  /**
   * Load content from a local directory
   *
   * @param source - Path to the directory to load from
   * @param options - Loading options
   * @returns LoadResult containing all parsed content
   */
  async load(source: string, options?: LoaderOptions): Promise<LoadResult> {
    const result = emptyLoadResultWithSource(source);
    const errors: LoadError[] = [];

    // Resolve the source path
    const basePath = options?.basePath ?? process.cwd();
    const sourcePath = isAbsolutePath(source) ? source : path.resolve(basePath, source);

    logger.debug(`Loading from: ${sourcePath}`);

    // Check if source directory exists
    if (!(await dirExists(sourcePath))) {
      logger.debug(`Source directory does not exist: ${sourcePath}`);
      return result;
    }

    // Get directory names (with defaults)
    const directories = {
      ...DEFAULT_DIRECTORIES,
      ...options?.directories,
    };

    // Load each content type in parallel
    const [rulesResult, personasResult, commandsResult, hooksResult] = await Promise.all([
      this.loadContentType(sourcePath, directories.rules, 'rule', parseRule, options),
      this.loadContentType(sourcePath, directories.personas, 'persona', parsePersona, options),
      this.loadContentType(sourcePath, directories.commands, 'command', parseCommand, options),
      this.loadContentType(sourcePath, directories.hooks, 'hook', parseHook, options),
    ]);

    // Collect results
    result.rules = rulesResult.items;
    result.personas = personasResult.items;
    result.commands = commandsResult.items;
    result.hooks = hooksResult.items;

    // Collect errors
    errors.push(
      ...rulesResult.errors,
      ...personasResult.errors,
      ...commandsResult.errors,
      ...hooksResult.errors
    );

    if (errors.length > 0) {
      result.errors = errors;
    }

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

    logger.debug(
      `Loaded: ${result.rules.length} rules, ${result.personas.length} personas, ` +
        `${result.commands.length} commands, ${result.hooks.length} hooks`
    );

    return result;
  }

  /**
   * Load a specific content type from its directory
   */
  private async loadContentType<T>(
    sourcePath: string,
    subdir: string,
    contentType: ContentType,
    parser: ParserFn<T>,
    options?: LoaderOptions
  ): Promise<{ items: T[]; errors: LoadError[] }> {
    const items: T[] = [];
    const errors: LoadError[] = [];
    const contentDir = path.join(sourcePath, subdir);

    // Check if content directory exists
    if (!(await dirExists(contentDir))) {
      logger.debug(`No ${contentType}s directory: ${contentDir}`);
      return { items, errors };
    }

    // Find all markdown files
    let files: string[];
    try {
      files = await findMarkdownFiles(contentDir);
    } catch (error) {
      errors.push({
        type: 'directory',
        path: contentDir,
        message: `Failed to read directory: ${error instanceof Error ? error.message : String(error)}`,
      });
      return { items, errors };
    }

    // Filter files by include/exclude patterns
    const filteredFiles = this.filterFiles(files, contentDir, options);

    logger.debug(`Found ${filteredFiles.length} ${contentType} files in ${contentDir}`);

    // Parse each file
    for (const filePath of filteredFiles) {
      const fileResult = await readFile(filePath);

      if (!fileResult.ok) {
        errors.push({
          type: 'file',
          path: filePath,
          message: fileResult.error.message,
        });

        if (options?.continueOnError === false) {
          break;
        }
        continue;
      }

      const parseResult = parser(fileResult.value, filePath);

      if (parseResult.ok) {
        items.push(parseResult.value);
      } else {
        errors.push({
          type: contentType,
          path: filePath,
          message: parseResult.error.message,
          parseError: parseResult.error,
        });

        if (options?.continueOnError === false) {
          break;
        }
      }
    }

    return { items, errors };
  }

  /**
   * Filter files by include/exclude patterns
   */
  private filterFiles(files: string[], baseDir: string, options?: LoaderOptions): string[] {
    let filtered = files;

    // Apply include patterns
    if (options?.include && options.include.length > 0) {
      filtered = filtered.filter((file) => {
        const relativePath = path.relative(baseDir, file);
        return options.include!.some((pattern) => this.matchGlobPattern(relativePath, pattern));
      });
    }

    // Apply exclude patterns
    if (options?.exclude && options.exclude.length > 0) {
      filtered = filtered.filter((file) => {
        const relativePath = path.relative(baseDir, file);
        return !options.exclude!.some((pattern) => this.matchGlobPattern(relativePath, pattern));
      });
    }

    return filtered;
  }

  /**
   * Simple glob pattern matching
   * Supports: *, **, ?
   */
  private matchGlobPattern(filePath: string, pattern: string): boolean {
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // Convert glob pattern to regex
    const regexPattern = normalizedPattern
      .replace(/\./g, '\\.') // Escape dots
      .replace(/\*\*/g, '{{DOUBLE}}') // Temp placeholder for **
      .replace(/\*/g, '[^/]*') // * matches anything except /
      .replace(/{{DOUBLE}}/g, '.*') // ** matches anything
      .replace(/\?/g, '.'); // ? matches single char

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(normalizedPath);
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
}

/**
 * Create a LocalLoader instance
 */
export function createLocalLoader(): LocalLoader {
  return new LocalLoader();
}
