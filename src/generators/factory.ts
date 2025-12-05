/**
 * @file Factory Generator
 * @description Generate .factory/ directory structure and AGENTS.md
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
 * Generator for Factory output
 */
export class FactoryGenerator implements Generator {
  readonly name = 'factory';

  async generate(
    _content: ResolvedContent,
    _options?: GeneratorOptions
  ): Promise<GenerateResult> {
    // Stub implementation
    return emptyGenerateResult();
  }
}

