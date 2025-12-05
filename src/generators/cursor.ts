/**
 * @file Cursor Generator
 * @description Generate .cursor/rules/*.mdc and related files
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
 * Generator for Cursor IDE output
 */
export class CursorGenerator implements Generator {
  readonly name = 'cursor';

  async generate(
    _content: ResolvedContent,
    _options?: GeneratorOptions
  ): Promise<GenerateResult> {
    // Stub implementation
    return emptyGenerateResult();
  }
}

