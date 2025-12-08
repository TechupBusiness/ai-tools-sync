/**
 * @file Conditional Content Transformer
 * @description Removes or keeps inline conditional blocks for specific targets
 */

import { isValidTarget, type TargetType } from '../parsers/types.js';

/**
 * Options for conditional content transformation
 */
export interface ConditionalContentOptions {
  /**
   * Whether to preserve whitespace around removed blocks
   * @default false - Collapse empty lines from removed blocks
   */
  preserveWhitespace?: boolean;
}

/**
 * Result of parsing a conditional tag
 */
interface ParsedCondition {
  /** Target platforms in the condition */
  targets: TargetType[];
  /** Negated targets (those with ! prefix) */
  negatedTargets: TargetType[];
  /** Operator: 'or' for |, 'and' for & */
  operator: 'or' | 'and';
}

/**
 * Parse a condition string into structured form
 * Handles: claude, !cursor, claude|factory, cursor&!claude
 */
function parseCondition(condition: string): ParsedCondition {
  const targets: TargetType[] = [];
  const negatedTargets: TargetType[] = [];
  const trimmedCondition = condition.trim();

  const hasOr = trimmedCondition.includes('|');
  const hasAnd = trimmedCondition.includes('&');

  const operator: 'or' | 'and' =
    hasAnd && !hasOr ? 'and' : hasOr && !hasAnd ? 'or' : 'and';

  const parts = trimmedCondition.split(/[|&]/);

  for (const part of parts) {
    const value = part.trim();
    if (!value) continue;

    if (value.startsWith('!')) {
      const target = value.slice(1);
      if (isValidTarget(target)) {
        negatedTargets.push(target);
      }
    } else if (isValidTarget(value)) {
      targets.push(value);
    }
  }

  return { targets, negatedTargets, operator };
}

/**
 * Evaluate if content should be included for a target
 */
function evaluateCondition(parsed: ParsedCondition, target: TargetType): boolean {
  const { targets, negatedTargets, operator } = parsed;
  const hasConditions = targets.length > 0 || negatedTargets.length > 0;

  // If nothing parsed, treat as invalid condition
  if (!hasConditions) {
    return false;
  }

  // Check negations first - if target is negated, exclude
  if (negatedTargets.includes(target)) {
    return false;
  }

  // If no positive targets specified (only negations), include if not negated
  if (targets.length === 0) {
    return true;
  }

  if (operator === 'or') {
    return targets.includes(target);
  }

  // AND: all specified targets must be the same as the current target
  const allMatchTarget = targets.every((value) => value === target);
  return allMatchTarget;
}

/**
 * Transform conditional content for a specific target platform
 *
 * Removes blocks that don't match the target and strips the tags from matching blocks.
 *
 * @param content - Markdown content with conditional blocks
 * @param target - Target platform to generate for
 * @param options - Transform options
 * @returns Transformed content with non-matching blocks removed
 *
 * @example
 * const content = `
 * # Guide
 *
 * {{#claude}}Use /command for Claude{{/claude}}
 * {{#cursor}}Use Cmd+K for Cursor{{/cursor}}
 *
 * Common content here.
 * `;
 *
 * transformConditionalContent(content, 'claude');
 * // Result:
 * // # Guide
 * //
 * // Use /command for Claude
 * //
 * // Common content here.
 */
export function transformConditionalContent(
  content: string,
  target: TargetType,
  options: ConditionalContentOptions = {}
): string {
  const { preserveWhitespace = false } = options;

  // Pattern matches {{#condition}}...{{/condition}}
  const BLOCK_PATTERN = /\{\{#([^\s}][^}]*?)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

  let replaced = false;

  let result = content.replace(
    BLOCK_PATTERN,
    (_match, condition: string, blockContent: string) => {
      replaced = true;
      const parsed = parseCondition(condition);
      const shouldInclude = evaluateCondition(parsed, target);

      if (shouldInclude) {
        // Include content, strip tags
        return blockContent;
      }

      // Exclude content entirely
      return '';
    }
  );

  // Clean up whitespace if not preserving and only when changes occurred
  if (replaced && !preserveWhitespace) {
    // Remove trailing whitespace on lines
    result = result.replace(/[ \t]+$/gm, '');
    // Remove leading blank lines (e.g., when the first block was removed)
    result = result.replace(/^\n+/, '');
    // Collapse multiple blank lines to a maximum of two
    result = result.replace(/\n{3,}/g, '\n\n');
    // Limit trailing blank lines to at most one
    result = result.replace(/\n+$/, (match) => (match.length > 1 ? '\n' : match));
  }

  return result;
}
