/**
 * @file Rule Parser
 * @description Parse rule files with frontmatter, validation, and defaults
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
 * Rule category types
 */
export type RuleCategory = 'core' | 'infrastructure' | 'testing' | 'security' | 'documentation' | 'tooling' | 'other';

/**
 * Rule priority levels
 */
export type RulePriority = 'low' | 'medium' | 'high';

/**
 * Rule frontmatter structure
 */
export interface Rule extends BaseFrontmatter {
  /** Unique identifier for the rule */
  name: string;
  /** Always load this rule regardless of context */
  always_apply?: boolean;
  /** Glob patterns to trigger this rule */
  globs?: string[];
  /** Other rules that must be loaded with this rule */
  requires?: string[];
  /** Category for organization */
  category?: RuleCategory;
  /** Priority level for rule ordering */
  priority?: RulePriority;
  /** Platform-specific extensions */
  cursor?: CursorExtension;
  claude?: ClaudeExtension;
  factory?: FactoryExtension;
}

/**
 * Parsed rule with content
 */
export type ParsedRule = ParsedContent<Rule>;

/**
 * Default values for optional rule fields
 */
export const RULE_DEFAULTS: Partial<Rule> = {
  always_apply: false,
  globs: [],
  targets: DEFAULT_TARGETS,
  requires: [],
  priority: 'medium',
};

/**
 * Valid category values
 */
const VALID_CATEGORIES: RuleCategory[] = ['core', 'infrastructure', 'testing', 'security', 'documentation', 'tooling', 'other'];

/**
 * Valid priority values
 */
const VALID_PRIORITIES: RulePriority[] = ['low', 'medium', 'high'];

/**
 * Validate rule-specific fields
 */
function validateRuleFields(data: Record<string, unknown>): ContentValidationError[] {
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

  // Validate always_apply
  if (data.always_apply !== undefined && typeof data.always_apply !== 'boolean') {
    errors.push({
      path: 'always_apply',
      message: 'always_apply must be a boolean',
      value: data.always_apply,
    });
  }

  // Validate globs
  if (data.globs !== undefined) {
    if (!Array.isArray(data.globs)) {
      errors.push({
        path: 'globs',
        message: 'Globs must be an array',
        value: data.globs,
      });
    } else {
      for (const [i, glob] of data.globs.entries()) {
        if (typeof glob !== 'string') {
          errors.push({
            path: `globs[${i}]`,
            message: 'Glob pattern must be a string',
            value: glob,
          });
        }
      }
    }
  }

  // Validate requires
  if (data.requires !== undefined) {
    if (!Array.isArray(data.requires)) {
      errors.push({
        path: 'requires',
        message: 'Requires must be an array',
        value: data.requires,
      });
    } else {
      for (const [i, req] of data.requires.entries()) {
        if (typeof req !== 'string') {
          errors.push({
            path: `requires[${i}]`,
            message: 'Required rule name must be a string',
            value: req,
          });
        }
      }
    }
  }

  // Validate category
  if (data.category !== undefined) {
    if (typeof data.category !== 'string') {
      errors.push({
        path: 'category',
        message: 'Category must be a string',
        value: data.category,
      });
    } else if (!VALID_CATEGORIES.includes(data.category as RuleCategory)) {
      errors.push({
        path: 'category',
        message: `Invalid category: ${data.category}. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
        value: data.category,
      });
    }
  }

  // Validate priority
  if (data.priority !== undefined) {
    if (typeof data.priority !== 'string') {
      errors.push({
        path: 'priority',
        message: 'Priority must be a string',
        value: data.priority,
      });
    } else if (!VALID_PRIORITIES.includes(data.priority as RulePriority)) {
      errors.push({
        path: 'priority',
        message: `Invalid priority: ${data.priority}. Must be one of: ${VALID_PRIORITIES.join(', ')}`,
        value: data.priority,
      });
    }
  }

  // Validate platform extensions (must be objects if present)
  for (const platform of ['cursor', 'claude', 'factory'] as const) {
    if (data[platform] !== undefined) {
      if (typeof data[platform] !== 'object' || data[platform] === null || Array.isArray(data[platform])) {
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
 * Apply defaults to rule frontmatter (filters out undefined for exactOptionalPropertyTypes)
 */
function applyRuleDefaults(data: Record<string, unknown>): Rule {
  const rule: Rule = {
    name: data.name as string,
    always_apply: data.always_apply !== undefined ? (data.always_apply as boolean) : RULE_DEFAULTS.always_apply!,
    globs: data.globs !== undefined ? (data.globs as string[]) : RULE_DEFAULTS.globs!,
    targets: data.targets !== undefined ? (data.targets as TargetType[]) : RULE_DEFAULTS.targets!,
    requires: data.requires !== undefined ? (data.requires as string[]) : RULE_DEFAULTS.requires!,
    priority: data.priority !== undefined ? (data.priority as RulePriority) : RULE_DEFAULTS.priority!,
  };

  if (data.description !== undefined) {
    rule.description = data.description as string;
  }
  if (data.version !== undefined) {
    rule.version = data.version as string;
  }
  if (data.category !== undefined) {
    rule.category = data.category as RuleCategory;
  }

  // Platform-specific extensions
  if (data.cursor !== undefined) {
    rule.cursor = data.cursor as CursorExtension;
  }
  if (data.claude !== undefined) {
    rule.claude = data.claude as ClaudeExtension;
  }
  if (data.factory !== undefined) {
    rule.factory = data.factory as FactoryExtension;
  }

  return rule;
}

/**
 * Parse a rule file
 *
 * @param content - The markdown content of the rule file
 * @param filePath - Optional file path for error messages
 * @returns Result containing parsed rule or error
 */
export function parseRule(content: string, filePath?: string): Result<ParsedRule, ParseError> {
  // Parse frontmatter
  const frontmatterResult = parseFrontmatter<Record<string, unknown>>(content);

  if (!frontmatterResult.ok) {
    const fmError = frontmatterResult.error;
    return err(createParseError(fmError.message, {
      filePath,
      line: fmError.line,
      column: fmError.column,
    }));
  }

  const { data, content: bodyContent, isEmpty } = frontmatterResult.value;

  // Check for empty frontmatter
  if (isEmpty) {
    return err(createParseError('Rule file is missing frontmatter', { filePath }));
  }

  // Validate fields
  const validationErrors = validateRuleFields(data);

  if (validationErrors.length > 0) {
    return err(createParseError('Rule validation failed', {
      filePath,
      validationErrors,
    }));
  }

  // Apply defaults and create rule object
  const rule = applyRuleDefaults(data);

  // Build result with only defined properties (for exactOptionalPropertyTypes)
  const result: ParsedRule = {
    frontmatter: rule,
    content: bodyContent,
  };

  if (filePath !== undefined) {
    result.filePath = filePath;
  }

  return ok(result);
}

/**
 * Parse multiple rule files
 *
 * @param files - Array of { content, filePath } objects
 * @returns Result containing array of parsed rules or array of errors
 */
export function parseRules(
  files: Array<{ content: string; filePath?: string }>
): Result<ParsedRule[], ParseError[]> {
  const rules: ParsedRule[] = [];
  const errors: ParseError[] = [];

  for (const file of files) {
    const result = parseRule(file.content, file.filePath);
    if (result.ok) {
      rules.push(result.value);
    } else {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    return err(errors);
  }

  return ok(rules);
}

/**
 * Check if rule should be applied based on file path
 */
export function shouldApplyRule(rule: Rule, filePath?: string): boolean {
  // Always apply rules are always applied
  if (rule.always_apply) {
    return true;
  }

  // If no file path provided, only apply always_apply rules
  if (!filePath) {
    return false;
  }

  // If no globs defined, don't apply
  if (!rule.globs || rule.globs.length === 0) {
    return false;
  }

  // Glob matching would be done here using the glob-matcher transformer
  // For now, return false - actual matching is done in transformers
  return false;
}

/**
 * Filter rules by target
 */
export function filterRulesByTarget(rules: ParsedRule[], target: TargetType): ParsedRule[] {
  return rules.filter((rule) => {
    const targets = rule.frontmatter.targets ?? DEFAULT_TARGETS;
    return targets.includes(target);
  });
}

/**
 * Sort rules by priority
 */
export function sortRulesByPriority(rules: ParsedRule[]): ParsedRule[] {
  const priorityOrder: Record<RulePriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return [...rules].sort((a, b) => {
    const aPriority = a.frontmatter.priority ?? 'medium';
    const bPriority = b.frontmatter.priority ?? 'medium';
    return priorityOrder[aPriority] - priorityOrder[bPriority];
  });
}
