/**
 * @file Claude Generator
 * @description Generate .claude/ directory structure and CLAUDE.md
 *
 * This is a stub file - full implementation in Phase 6
 */

import {
  type Generator,
  type GeneratorOptions,
  type GenerateResult,
  type ResolvedContent,
  emptyGenerateResult,
} from './base.js';

/**
 * Generator for Claude Code output
 */
export class ClaudeGenerator implements Generator {
  readonly name = 'claude';

  async generate(
    _content: ResolvedContent,
    _options?: GeneratorOptions
  ): Promise<GenerateResult> {
    // Stub implementation
    return emptyGenerateResult();
  }
}

