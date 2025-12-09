/**
 * @file Persona Parser
 * @description Parse persona files with frontmatter, validation, and defaults
 */

import { type Result, err, ok } from '../utils/result.js';

import { parseFrontmatter } from './frontmatter.js';
import {
  type BaseFrontmatter,
  type ClaudeExtension,
  type ContentValidationError,
  type CursorExtension,
  type FactoryExtension,
  type ParseError,
  type ParsedContent,
  type TargetType,
  DEFAULT_TARGETS,
  createParseError,
  validateTargets,
  validateVersion,
} from './types.js';

/**
 * Available tool types for personas
 */
export type PersonaTool =
  | 'read'
  | 'write'
  | 'edit'
  | 'execute'
  | 'search'
  | 'glob'
  | 'fetch'
  | 'ls';

/**
 * Persona frontmatter structure
 */
export interface Persona extends BaseFrontmatter {
  /** Unique identifier for the persona */
  name: string;
  /** Name of parent persona to inherit from */
  extends?: string;
  /** Tools available to this persona */
  tools?: PersonaTool[];
  /** Model to use (default, fast, powerful, inherit, or specific model) */
  model?: string;
  /** Additional persona traits/characteristics */
  traits?: Record<string, unknown>;
  /** Platform-specific extensions */
  cursor?: CursorExtension;
  claude?: ClaudeExtension;
  factory?: FactoryExtension;
}

/**
 * Parsed persona with content
 */
export type ParsedPersona = ParsedContent<Persona>;

/**
 * Valid tool values
 */
const VALID_TOOLS: PersonaTool[] = [
  'read',
  'write',
  'edit',
  'execute',
  'search',
  'glob',
  'fetch',
  'ls',
];

/**
 * Default values for optional persona fields
 */
export const PERSONA_DEFAULTS: Partial<Persona> = {
  tools: ['read', 'write', 'edit', 'search', 'glob', 'ls'],
  model: 'default',
  targets: DEFAULT_TARGETS,
};

/**
 * Validate persona-specific fields
 */
function validatePersonaFields(data: Record<string, unknown>): ContentValidationError[] {
  const errors: ContentValidationError[] = [];

  // Validate name (required)
  if (data.name === undefined || data.name === null) {
    errors.push({
      path: 'name',
      message: 'Name is required',
    });
  } else if (typeof data.name !== 'string') {
    errors.push({
      path: 'name',
      message: 'Name must be a string',
      value: data.name,
    });
  } else if (data.name.trim() === '') {
    errors.push({
      path: 'name',
      message: 'Name cannot be empty',
      value: data.name,
    });
  }

  // Validate extends
  if (data.extends !== undefined) {
    if (typeof data.extends !== 'string') {
      errors.push({
        path: 'extends',
        message: 'extends must be a string',
        value: data.extends,
      });
    } else if (data.extends.trim() === '') {
      errors.push({
        path: 'extends',
        message: 'extends cannot be empty',
        value: data.extends,
      });
    }
  }

  // Validate description
  if (data.description !== undefined && typeof data.description !== 'string') {
    errors.push({
      path: 'description',
      message: 'Description must be a string',
      value: data.description,
    });
  }

  // Validate version
  errors.push(...validateVersion(data.version));

  // Validate targets
  errors.push(...validateTargets(data.targets));

  // Validate tools
  if (data.tools !== undefined) {
    if (!Array.isArray(data.tools)) {
      errors.push({
        path: 'tools',
        message: 'Tools must be an array',
        value: data.tools,
      });
    } else {
      for (const [i, tool] of data.tools.entries()) {
        if (typeof tool !== 'string') {
          errors.push({
            path: `tools[${i}]`,
            message: 'Tool must be a string',
            value: tool,
          });
        } else if (!VALID_TOOLS.includes(tool as PersonaTool)) {
          errors.push({
            path: `tools[${i}]`,
            message: `Invalid tool: ${tool}. Must be one of: ${VALID_TOOLS.join(', ')}`,
            value: tool,
          });
        }
      }
    }
  }

  // Validate model
  if (data.model !== undefined && typeof data.model !== 'string') {
    errors.push({
      path: 'model',
      message: 'Model must be a string',
      value: data.model,
    });
  }

  // Validate traits
  if (data.traits !== undefined) {
    if (typeof data.traits !== 'object' || data.traits === null || Array.isArray(data.traits)) {
      errors.push({
        path: 'traits',
        message: 'Traits must be an object',
        value: data.traits,
      });
    }
  }

  // Validate platform extensions (must be objects if present)
  for (const platform of ['cursor', 'claude', 'factory'] as const) {
    if (data[platform] !== undefined) {
      if (
        typeof data[platform] !== 'object' ||
        data[platform] === null ||
        Array.isArray(data[platform])
      ) {
        errors.push({
          path: platform,
          message: `${platform} extension must be an object`,
          value: data[platform],
        });
      }
    }
  }

  return errors;
}

/**
 * Apply defaults to persona frontmatter (filters out undefined for exactOptionalPropertyTypes)
 */
function applyPersonaDefaults(data: Record<string, unknown>): Persona {
  const persona: Persona = {
    name: data.name as string,
    tools: data.tools !== undefined ? (data.tools as PersonaTool[]) : PERSONA_DEFAULTS.tools!,
    model: data.model !== undefined ? (data.model as string) : PERSONA_DEFAULTS.model!,
    targets:
      data.targets !== undefined ? (data.targets as TargetType[]) : PERSONA_DEFAULTS.targets!,
  };

  if (data.description !== undefined) {
    persona.description = data.description as string;
  }
  if (data.version !== undefined) {
    persona.version = data.version as string;
  }
  if (data.traits !== undefined) {
    persona.traits = data.traits as Record<string, unknown>;
  }

  if (data.extends !== undefined) {
    persona.extends = (data.extends as string).trim();
  }

  // Platform-specific extensions
  if (data.cursor !== undefined) {
    persona.cursor = data.cursor as CursorExtension;
  }
  if (data.claude !== undefined) {
    persona.claude = data.claude as ClaudeExtension;
  }
  if (data.factory !== undefined) {
    persona.factory = data.factory as FactoryExtension;
  }

  return persona;
}

/**
 * Parse a persona file
 *
 * @param content - The markdown content of the persona file
 * @param filePath - Optional file path for error messages
 * @returns Result containing parsed persona or error
 */
export function parsePersona(
  content: string,
  filePath?: string
): Result<ParsedPersona, ParseError> {
  // Parse frontmatter
  const frontmatterResult = parseFrontmatter<Record<string, unknown>>(content);

  if (!frontmatterResult.ok) {
    const fmError = frontmatterResult.error;
    return err(
      createParseError(fmError.message, {
        filePath,
        line: fmError.line,
        column: fmError.column,
      })
    );
  }

  const { data, content: bodyContent, isEmpty } = frontmatterResult.value;

  // Check for empty frontmatter
  if (isEmpty) {
    return err(createParseError('Persona file is missing frontmatter', { filePath }));
  }

  // Validate fields
  const validationErrors = validatePersonaFields(data);

  if (validationErrors.length > 0) {
    return err(
      createParseError('Persona validation failed', {
        filePath,
        validationErrors,
      })
    );
  }

  // Apply defaults and create persona object
  const persona = applyPersonaDefaults(data);

  // Build result with only defined properties (for exactOptionalPropertyTypes)
  const result: ParsedPersona = {
    frontmatter: persona,
    content: bodyContent,
  };

  if (filePath !== undefined) {
    result.filePath = filePath;
  }

  return ok(result);
}

/**
 * Parse multiple persona files
 *
 * @param files - Array of { content, filePath } objects
 * @returns Result containing array of parsed personas or array of errors
 */
export function parsePersonas(
  files: Array<{ content: string; filePath?: string }>
): Result<ParsedPersona[], ParseError[]> {
  const personas: ParsedPersona[] = [];
  const errors: ParseError[] = [];

  for (const file of files) {
    const result = parsePersona(file.content, file.filePath);
    if (result.ok) {
      personas.push(result.value);
    } else {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    return err(errors);
  }

  return ok(personas);
}

/**
 * Filter personas by target
 */
export function filterPersonasByTarget(
  personas: ParsedPersona[],
  target: TargetType
): ParsedPersona[] {
  return personas.filter((persona) => {
    const targets = persona.frontmatter.targets ?? DEFAULT_TARGETS;
    return targets.includes(target);
  });
}

/**
 * Get all unique tools used by a set of personas
 */
export function getUniqueTools(personas: ParsedPersona[]): PersonaTool[] {
  const toolSet = new Set<PersonaTool>();

  for (const persona of personas) {
    const tools = persona.frontmatter.tools ?? PERSONA_DEFAULTS.tools ?? [];
    for (const tool of tools) {
      toolSet.add(tool);
    }
  }

  return Array.from(toolSet);
}

/**
 * Warning during inheritance resolution
 */
export interface InheritanceWarning {
  /** Persona name that has the issue */
  persona: string;
  /** Warning message */
  message: string;
  /** File path if available */
  filePath?: string;
}

/**
 * Options for persona inheritance resolution
 */
export interface ResolvePersonaInheritanceOptions {
  /** Maximum inheritance depth (default: 10) */
  maxDepth?: number;
}

/**
 * Result of inheritance resolution
 */
export interface ResolvePersonaInheritanceResult {
  /** Resolved personas with inheritance applied */
  personas: ParsedPersona[];
  /** Warnings for non-fatal issues (e.g., missing parent) */
  warnings: InheritanceWarning[];
}

type InheritanceError =
  | {
      type: 'circular';
      message: string;
      persona: string;
    }
  | {
      type: 'depth';
      message: string;
      persona: string;
    };

/**
 * Merge parent and child personas
 * Child frontmatter overrides parent, content concatenates
 */
function mergePersonas(parent: ParsedPersona, child: ParsedPersona): ParsedPersona {
  const mergedFrontmatter: Persona = {
    ...parent.frontmatter,
    ...Object.fromEntries(
      Object.entries(child.frontmatter).filter(([, value]) => value !== undefined)
    ),
    name: child.frontmatter.name,
  };

  delete (mergedFrontmatter as { extends?: string }).extends;

  if (parent.frontmatter.cursor || child.frontmatter.cursor) {
    mergedFrontmatter.cursor = {
      ...parent.frontmatter.cursor,
      ...child.frontmatter.cursor,
    };
  }

  if (parent.frontmatter.claude || child.frontmatter.claude) {
    mergedFrontmatter.claude = {
      ...parent.frontmatter.claude,
      ...child.frontmatter.claude,
    };
  }

  if (parent.frontmatter.factory || child.frontmatter.factory) {
    mergedFrontmatter.factory = {
      ...parent.frontmatter.factory,
      ...child.frontmatter.factory,
    };
  }

  if (parent.frontmatter.traits || child.frontmatter.traits) {
    mergedFrontmatter.traits = {
      ...parent.frontmatter.traits,
      ...child.frontmatter.traits,
    };
  }

  const parentContent = parent.content.trim();
  const childContent = child.content.trim();
  const separator = '\n\n---\n\n';
  const mergedContent =
    parentContent && childContent
      ? `${parentContent}${separator}${childContent}`
      : parentContent || childContent;

  return {
    frontmatter: mergedFrontmatter,
    content: mergedContent,
    ...(child.filePath !== undefined ? { filePath: child.filePath } : {}),
  };
}

/**
 * Resolve inheritance chain for a persona
 */
function resolveInheritanceChain(
  persona: ParsedPersona,
  personaMap: Map<string, ParsedPersona>,
  visited: Set<string>,
  maxDepth: number
): Result<ParsedPersona, InheritanceError> {
  const name = persona.frontmatter.name;

  if (visited.has(name)) {
    const cycle = [...visited, name].join(' → ');
    return err({
      type: 'circular',
      message: `Circular inheritance detected: ${cycle}`,
      persona: name,
    });
  }

  if (visited.size >= maxDepth) {
    return err({
      type: 'depth',
      message: `Maximum inheritance depth (${maxDepth}) exceeded`,
      persona: name,
    });
  }

  const parentName = persona.frontmatter.extends;
  if (!parentName) {
    return ok(persona);
  }

  visited.add(name);
  const parent = personaMap.get(parentName);

  if (!parent) {
    return ok(persona);
  }

  const parentResult = resolveInheritanceChain(parent, personaMap, visited, maxDepth);
  if (!parentResult.ok) {
    return parentResult;
  }

  return ok(mergePersonas(parentResult.value, persona));
}

/**
 * Resolve inheritance for all personas
 *
 * @param personas - Array of parsed personas
 * @param options - Resolution options
 * @returns Resolved personas with inheritance applied
 */
export function resolvePersonaInheritance(
  personas: ParsedPersona[],
  options: ResolvePersonaInheritanceOptions = {}
): Result<ResolvePersonaInheritanceResult, ParseError> {
  const maxDepth = options.maxDepth ?? 10;
  const warnings: InheritanceWarning[] = [];
  const resolved: ParsedPersona[] = [];
  const personaMap = new Map<string, ParsedPersona>();
  const uniquePersonas: ParsedPersona[] = [];

  for (const persona of personas) {
    const personaName = persona.frontmatter.name;
    const existing = personaMap.get(personaName);

    if (existing) {
      const keptPath = existing.filePath ?? 'previous source';
      const ignoredPath = persona.filePath ?? 'later source';
      warnings.push({
        persona: personaName,
        message: `Duplicate persona '${personaName}' found; keeping first occurrence (${keptPath}), ignoring ${ignoredPath}`,
        ...(persona.filePath !== undefined ? { filePath: persona.filePath } : {}),
      });
      continue;
    }

    personaMap.set(personaName, persona);
    uniquePersonas.push(persona);
  }

  for (const persona of uniquePersonas) {
    const visited = new Set<string>();
    const result = resolveInheritanceChain(persona, personaMap, visited, maxDepth);

    if (!result.ok) {
      return err(
        createParseError(result.error.message, {
          filePath: persona.filePath,
        })
      );
    }

    if (persona.frontmatter.extends && !personaMap.has(persona.frontmatter.extends)) {
      warnings.push({
        persona: persona.frontmatter.name,
        message: `Parent persona '${persona.frontmatter.extends}' not found, inheritance skipped`,
        ...(persona.filePath !== undefined ? { filePath: persona.filePath } : {}),
      });
    }

    resolved.push(result.value);
  }

  return ok({ personas: resolved, warnings });
}
