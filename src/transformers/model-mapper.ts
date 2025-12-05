/**
 * @file Model Mapper
 * @description Map generic model names to target-specific names
 *
 * This is a stub file - full implementation in Phase 4
 */

/**
 * Default model mappings for each target
 */
export const DEFAULT_MODEL_MAPPINGS: Record<string, Record<string, string>> = {
  cursor: {
    default: 'inherit',
    fast: 'inherit',
    powerful: 'inherit',
  },
  claude: {
    default: 'claude-sonnet-4-20250514',
    fast: 'claude-3-5-haiku-20241022',
    powerful: 'claude-sonnet-4-20250514',
  },
  factory: {
    default: 'default',
    fast: 'fast',
    powerful: 'powerful',
  },
};

/**
 * Map a generic model name to a target-specific name
 */
export function mapModel(model: string, target: string): string {
  if (model === 'inherit') {
    return 'inherit';
  }

  const targetMappings = DEFAULT_MODEL_MAPPINGS[target];
  if (!targetMappings) {
    return model;
  }

  return targetMappings[model.toLowerCase()] ?? model;
}

