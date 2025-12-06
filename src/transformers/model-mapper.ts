/**
 * @file Model Mapper
 * @description Map generic model names to target-specific names
 *
 * The model mapper transforms abstract model identifiers (default, fast, powerful)
 * to target-specific model names. It handles special values like "inherit" which
 * tells the tool to use its default model selection.
 */

import type { TargetType } from '../parsers/types.js';

/**
 * Generic model names used in .ai/ configuration
 */
export type GenericModel = 'default' | 'fast' | 'powerful' | 'inherit';

/**
 * Model mapping configuration for a target
 */
export interface ModelMappingConfig {
  /**
   * Map of generic model name to target-specific model identifier
   */
  mappings: Record<string, string>;

  /**
   * The model to use when "inherit" is specified (or null to pass through)
   */
  inheritBehavior: 'passthrough' | 'use-default';

  /**
   * Whether unknown models should be passed through or converted to default
   */
  unknownBehavior: 'passthrough' | 'use-default';
}

/**
 * Default model mappings for each target
 *
 * Note: Model names are current as of the implementation date.
 * These should be updated as new models are released.
 */
export const DEFAULT_MODEL_MAPPINGS: Record<TargetType, ModelMappingConfig> = {
  cursor: {
    mappings: {
      default: 'inherit',
      fast: 'inherit',
      powerful: 'inherit',
    },
    inheritBehavior: 'passthrough',
    unknownBehavior: 'passthrough',
  },
  claude: {
    mappings: {
      default: 'claude-sonnet-4-20250514',
      fast: 'claude-3-5-haiku-20241022',
      powerful: 'claude-sonnet-4-20250514',
    },
    inheritBehavior: 'use-default',
    unknownBehavior: 'passthrough',
  },
  factory: {
    mappings: {
      default: 'default',
      fast: 'fast',
      powerful: 'powerful',
    },
    inheritBehavior: 'passthrough',
    unknownBehavior: 'passthrough',
  },
};

/**
 * Options for model mapping
 */
export interface MapModelOptions {
  /**
   * Custom mappings to merge with or override defaults
   */
  customMappings?: Record<string, string>;

  /**
   * Override inherit behavior
   */
  inheritBehavior?: 'passthrough' | 'use-default';

  /**
   * Override unknown model behavior
   */
  unknownBehavior?: 'passthrough' | 'use-default';
}

/**
 * Map a generic model name to a target-specific name
 *
 * @param model - Generic model name or specific model identifier
 * @param target - Target platform (cursor, claude, factory)
 * @param options - Optional custom mappings and behavior
 * @returns Target-specific model identifier
 *
 * @example
 * mapModel('default', 'claude')  // 'claude-sonnet-4-20250514'
 * mapModel('fast', 'claude')     // 'claude-3-5-haiku-20241022'
 * mapModel('inherit', 'cursor')  // 'inherit'
 * mapModel('gpt-4', 'cursor')    // 'gpt-4' (passed through)
 */
export function mapModel(
  model: string,
  target: TargetType,
  options?: MapModelOptions
): string {
  const targetConfig = DEFAULT_MODEL_MAPPINGS[target];
  if (!targetConfig) {
    // Unknown target, return model as-is
    return model;
  }

  // Handle "inherit" specially
  if (model.toLowerCase() === 'inherit') {
    const behavior = options?.inheritBehavior ?? targetConfig.inheritBehavior;
    if (behavior === 'passthrough') {
      return 'inherit';
    }
    // Use default model for this target
    return targetConfig.mappings['default'] ?? model;
  }

  // Merge custom mappings with defaults (custom takes precedence)
  const effectiveMappings = options?.customMappings
    ? { ...targetConfig.mappings, ...options.customMappings }
    : targetConfig.mappings;

  // Normalize model name for lookup
  const normalizedModel = model.toLowerCase();
  const mappedModel = effectiveMappings[normalizedModel];

  if (mappedModel !== undefined) {
    return mappedModel;
  }

  // Handle unknown model
  const behavior = options?.unknownBehavior ?? targetConfig.unknownBehavior;
  if (behavior === 'use-default') {
    return targetConfig.mappings['default'] ?? model;
  }

  // Pass through unknown models
  return model;
}

/**
 * Get all available models for a target
 *
 * @param target - Target platform
 * @returns Object with generic names as keys and target-specific names as values
 */
export function getModelsForTarget(target: TargetType): Record<string, string> {
  const config = DEFAULT_MODEL_MAPPINGS[target];
  return config ? { ...config.mappings } : {};
}

/**
 * Get the generic model name from a target-specific name
 *
 * @param targetModel - Target-specific model name
 * @param target - Target platform
 * @returns Generic model name, or undefined if not found
 *
 * @example
 * getGenericModelName('claude-sonnet-4-20250514', 'claude') // 'default' or 'powerful'
 */
export function getGenericModelName(
  targetModel: string,
  target: TargetType
): GenericModel | undefined {
  const config = DEFAULT_MODEL_MAPPINGS[target];
  if (!config) return undefined;

  // Find the generic name that maps to this target-specific model
  for (const [generic, mapped] of Object.entries(config.mappings)) {
    if (mapped.toLowerCase() === targetModel.toLowerCase()) {
      return generic as GenericModel;
    }
  }

  return undefined;
}

/**
 * Check if a model name is a generic model identifier
 */
export function isGenericModel(model: string): model is GenericModel {
  const genericModels: GenericModel[] = ['default', 'fast', 'powerful', 'inherit'];
  return genericModels.includes(model.toLowerCase() as GenericModel);
}

/**
 * Check if a model name is "inherit" (case-insensitive)
 */
export function isInheritModel(model: string): boolean {
  return model.toLowerCase() === 'inherit';
}

/**
 * Create a custom model mapper with predefined options
 *
 * @param target - Target platform
 * @param options - Custom mapping options
 * @returns Mapping function bound to the target and options
 *
 * @example
 * const mapClaudeModel = createModelMapper('claude', {
 *   customMappings: { 'custom': 'claude-custom-model' }
 * });
 * mapClaudeModel('custom') // 'claude-custom-model'
 */
export function createModelMapper(
  target: TargetType,
  options?: MapModelOptions
): (model: string) => string {
  return (model: string) => mapModel(model, target, options);
}

/**
 * Validate that a model identifier is valid for the target
 * (either a generic model or a specific model that the target might support)
 *
 * @param model - Model identifier to validate
 * @param target - Target platform
 * @returns true if the model appears valid
 */
export function isValidModelForTarget(model: string, _target: TargetType): boolean {
  // Generic models are always valid
  if (isGenericModel(model)) {
    return true;
  }

  // Target-specific validation could be added here
  // For now, we accept any string as it might be a specific model ID

  return typeof model === 'string' && model.length > 0;
}
