/**
 * @file Generators Index
 * @description Export all generator modules
 */

export * from './base.js';
export * from './cursor.js';
export * from './claude.js';
export * from './factory.js';
export * from './subfolder-context.js';

// Re-export types for convenience
export type {
  Generator,
  GeneratorOptions,
  GenerateResult,
  GeneratedFile,
  ResolvedContent,
} from './base.js';

export type {
  SubfolderContextConfig,
  SubfolderContextOptions,
} from './subfolder-context.js';

// Export generator factory functions
import { createCursorGenerator, CursorGenerator } from './cursor.js';
import { createClaudeGenerator, ClaudeGenerator } from './claude.js';
import { createFactoryGenerator, FactoryGenerator } from './factory.js';
import { createSubfolderContextGenerator, SubfolderContextGenerator } from './subfolder-context.js';
import type { TargetType } from '../parsers/types.js';
import type { Generator } from './base.js';

export {
  createCursorGenerator,
  createClaudeGenerator,
  createFactoryGenerator,
  createSubfolderContextGenerator,
  CursorGenerator,
  ClaudeGenerator,
  FactoryGenerator,
  SubfolderContextGenerator,
};

/**
 * Create a generator for the specified target
 */
export function createGenerator(target: TargetType): Generator {
  switch (target) {
    case 'cursor':
      return createCursorGenerator();
    case 'claude':
      return createClaudeGenerator();
    case 'factory':
      return createFactoryGenerator();
    default:
      throw new Error(`Unknown target: ${target}`);
  }
}

/**
 * Get all available generators
 */
export function getAllGenerators(): Generator[] {
  return [
    createCursorGenerator(),
    createClaudeGenerator(),
    createFactoryGenerator(),
  ];
}

/**
 * Available generator targets
 */
export const GENERATOR_TARGETS: TargetType[] = ['cursor', 'claude', 'factory'];

