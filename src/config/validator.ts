/**
 * @file Configuration Validator
 * @description Validate config against JSON schema and business rules
 */

import { type Result, err, ok } from '../utils/result.js';

import { isValidVersion, isVersionCompatible, isSupportedTarget } from './defaults.js';
import type { Config, ConfigValidationError } from './types.js';

/**
 * Validation context for accumulating errors
 */
class ValidationContext {
  private errors: ConfigValidationError[] = [];

  addError(path: string, message: string, value?: unknown): void {
    this.errors.push({ path, message, value });
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  getErrors(): ConfigValidationError[] {
    return [...this.errors];
  }
}

/**
 * Validate a configuration object
 * Returns all validation errors, not just the first one
 */
export function validateConfig(config: unknown): Result<Config, ConfigValidationError[]> {
  const ctx = new ValidationContext();

  // Check if config is an object
  if (typeof config !== 'object' || config === null) {
    ctx.addError('', 'Configuration must be an object', config);
    return err(ctx.getErrors());
  }

  const configObj = config as Record<string, unknown>;

  // Validate required fields
  validateRequiredFields(configObj, ctx);

  // Validate version
  validateVersion(configObj, ctx);

  // Validate targets
  validateTargets(configObj, ctx);

  // Validate loaders
  validateLoaders(configObj, ctx);

  // Validate use section
  validateUseSection(configObj, ctx);

  // Validate rules
  validateRules(configObj, ctx);

  // Validate subfolder_contexts
  validateSubfolderContexts(configObj, ctx);

  // Validate hooks
  validateHooks(configObj, ctx);

  // Validate output
  validateOutput(configObj, ctx);

  if (ctx.hasErrors()) {
    return err(ctx.getErrors());
  }

  return ok(configObj as unknown as Config);
}

/**
 * Validate required fields
 */
function validateRequiredFields(config: Record<string, unknown>, ctx: ValidationContext): void {
  if (!config.version) {
    ctx.addError('version', 'Version is required');
  }
}

/**
 * Validate version field
 */
function validateVersion(config: Record<string, unknown>, ctx: ValidationContext): void {
  const version = config.version;

  if (version === undefined) {
    return; // Already checked in required fields
  }

  if (typeof version !== 'string') {
    ctx.addError('version', 'Version must be a string', version);
    return;
  }

  if (!isValidVersion(version)) {
    ctx.addError('version', 'Version must be in semver format (e.g., 1.0.0)', version);
    return;
  }

  if (!isVersionCompatible(version)) {
    ctx.addError('version', 'Version is not compatible with current tool version', version);
  }
}

/**
 * Validate targets array
 */
function validateTargets(config: Record<string, unknown>, ctx: ValidationContext): void {
  const targets = config.targets;

  if (targets === undefined) {
    return; // Will use defaults
  }

  if (!Array.isArray(targets)) {
    ctx.addError('targets', 'Targets must be an array', targets);
    return;
  }

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (typeof target !== 'string') {
      ctx.addError(`targets[${i}]`, 'Target must be a string', target);
    } else if (!isSupportedTarget(target)) {
      ctx.addError(`targets[${i}]`, `Unsupported target: ${target}. Supported: cursor, claude, factory`, target);
    }
  }
}

/**
 * Validate loaders array
 */
function validateLoaders(config: Record<string, unknown>, ctx: ValidationContext): void {
  const loaders = config.loaders;

  if (loaders === undefined) {
    return; // Will use defaults
  }

  if (!Array.isArray(loaders)) {
    ctx.addError('loaders', 'Loaders must be an array', loaders);
    return;
  }

  const validTypes = ['ai-tool-sync', 'local', 'npm', 'pip', 'claude-plugin', 'url'];

  for (let i = 0; i < loaders.length; i++) {
    const loader = loaders[i];

    if (typeof loader !== 'object' || loader === null) {
      ctx.addError(`loaders[${i}]`, 'Loader must be an object', loader);
      continue;
    }

    const loaderObj = loader as Record<string, unknown>;

    if (!loaderObj.type) {
      ctx.addError(`loaders[${i}].type`, 'Loader type is required');
    } else if (typeof loaderObj.type !== 'string') {
      ctx.addError(`loaders[${i}].type`, 'Loader type must be a string', loaderObj.type);
    } else if (!validTypes.includes(loaderObj.type)) {
      ctx.addError(
        `loaders[${i}].type`,
        `Invalid loader type: ${loaderObj.type}. Valid types: ${validTypes.join(', ')}`,
        loaderObj.type
      );
    }

    // Validate source for loaders that need it
    if (loaderObj.type === 'local' || loaderObj.type === 'url') {
      if (!loaderObj.source) {
        ctx.addError(`loaders[${i}].source`, `Source is required for ${loaderObj.type} loader`);
      }
    }

    // Validate package for npm/pip loaders
    if (loaderObj.type === 'npm' || loaderObj.type === 'pip') {
      if (!loaderObj.package) {
        ctx.addError(`loaders[${i}].package`, `Package is required for ${loaderObj.type} loader`);
      }
    }
  }
}

/**
 * Validate use section
 */
function validateUseSection(config: Record<string, unknown>, ctx: ValidationContext): void {
  const use = config.use;

  if (use === undefined) {
    return;
  }

  if (typeof use !== 'object' || use === null) {
    ctx.addError('use', 'Use section must be an object', use);
    return;
  }

  const useObj = use as Record<string, unknown>;

  // Validate personas
  if (useObj.personas !== undefined) {
    if (!Array.isArray(useObj.personas)) {
      ctx.addError('use.personas', 'Personas must be an array', useObj.personas);
    } else {
      for (let i = 0; i < useObj.personas.length; i++) {
        if (typeof useObj.personas[i] !== 'string') {
          ctx.addError(`use.personas[${i}]`, 'Persona name must be a string', useObj.personas[i]);
        }
      }
    }
  }

  // Validate commands
  if (useObj.commands !== undefined) {
    if (!Array.isArray(useObj.commands)) {
      ctx.addError('use.commands', 'Commands must be an array', useObj.commands);
    } else {
      for (let i = 0; i < useObj.commands.length; i++) {
        if (typeof useObj.commands[i] !== 'string') {
          ctx.addError(`use.commands[${i}]`, 'Command name must be a string', useObj.commands[i]);
        }
      }
    }
  }

  // Validate plugins
  if (useObj.plugins !== undefined) {
    validatePlugins(useObj.plugins, ctx);
  }
}

/**
 * Validate plugins array
 */
function validatePlugins(plugins: unknown, ctx: ValidationContext): void {
  if (!Array.isArray(plugins)) {
    ctx.addError('use.plugins', 'Plugins must be an array', plugins);
    return;
  }

  for (let i = 0; i < plugins.length; i++) {
    const plugin = plugins[i];

    if (typeof plugin !== 'object' || plugin === null) {
      ctx.addError(`use.plugins[${i}]`, 'Plugin must be an object', plugin);
      continue;
    }

    const pluginObj = plugin as Record<string, unknown>;

    if (!pluginObj.name) {
      ctx.addError(`use.plugins[${i}].name`, 'Plugin name is required');
    } else if (typeof pluginObj.name !== 'string') {
      ctx.addError(`use.plugins[${i}].name`, 'Plugin name must be a string', pluginObj.name);
    }

    if (!pluginObj.source) {
      ctx.addError(`use.plugins[${i}].source`, 'Plugin source is required');
    } else if (typeof pluginObj.source !== 'string') {
      ctx.addError(`use.plugins[${i}].source`, 'Plugin source must be a string', pluginObj.source);
    }
  }
}

/**
 * Validate rules section
 */
function validateRules(config: Record<string, unknown>, ctx: ValidationContext): void {
  const rules = config.rules;

  if (rules === undefined) {
    return;
  }

  if (typeof rules !== 'object' || rules === null || Array.isArray(rules)) {
    ctx.addError('rules', 'Rules must be an object', rules);
    return;
  }

  const rulesObj = rules as Record<string, unknown>;

  for (const [name, rule] of Object.entries(rulesObj)) {
    if (typeof rule !== 'object' || rule === null) {
      ctx.addError(`rules.${name}`, 'Rule config must be an object', rule);
      continue;
    }

    const ruleObj = rule as Record<string, unknown>;

    // Validate always_apply
    if (ruleObj.always_apply !== undefined && typeof ruleObj.always_apply !== 'boolean') {
      ctx.addError(`rules.${name}.always_apply`, 'always_apply must be a boolean', ruleObj.always_apply);
    }

    // Validate globs
    if (ruleObj.globs !== undefined) {
      if (!Array.isArray(ruleObj.globs)) {
        ctx.addError(`rules.${name}.globs`, 'Globs must be an array', ruleObj.globs);
      } else {
        for (let i = 0; i < ruleObj.globs.length; i++) {
          if (typeof ruleObj.globs[i] !== 'string') {
            ctx.addError(`rules.${name}.globs[${i}]`, 'Glob pattern must be a string', ruleObj.globs[i]);
          }
        }
      }
    }

    // Validate targets
    if (ruleObj.targets !== undefined) {
      if (!Array.isArray(ruleObj.targets)) {
        ctx.addError(`rules.${name}.targets`, 'Targets must be an array', ruleObj.targets);
      } else {
        for (let i = 0; i < ruleObj.targets.length; i++) {
          const target = ruleObj.targets[i];
          if (typeof target !== 'string') {
            ctx.addError(`rules.${name}.targets[${i}]`, 'Target must be a string', target);
          } else if (!isSupportedTarget(target)) {
            ctx.addError(`rules.${name}.targets[${i}]`, `Unsupported target: ${target}`, target);
          }
        }
      }
    }
  }
}

/**
 * Validate subfolder_contexts section
 */
function validateSubfolderContexts(config: Record<string, unknown>, ctx: ValidationContext): void {
  const contexts = config.subfolder_contexts;

  if (contexts === undefined) {
    return;
  }

  if (typeof contexts !== 'object' || contexts === null || Array.isArray(contexts)) {
    ctx.addError('subfolder_contexts', 'Subfolder contexts must be an object', contexts);
    return;
  }

  const contextsObj = contexts as Record<string, unknown>;

  for (const [path, context] of Object.entries(contextsObj)) {
    if (typeof context !== 'object' || context === null) {
      ctx.addError(`subfolder_contexts.${path}`, 'Context config must be an object', context);
      continue;
    }

    const contextObj = context as Record<string, unknown>;

    // Validate rules (required)
    if (!contextObj.rules) {
      ctx.addError(`subfolder_contexts.${path}.rules`, 'Rules array is required');
    } else if (!Array.isArray(contextObj.rules)) {
      ctx.addError(`subfolder_contexts.${path}.rules`, 'Rules must be an array', contextObj.rules);
    }

    // Validate personas (optional)
    if (contextObj.personas !== undefined && !Array.isArray(contextObj.personas)) {
      ctx.addError(`subfolder_contexts.${path}.personas`, 'Personas must be an array', contextObj.personas);
    }
  }
}

/**
 * Validate hooks section
 */
function validateHooks(config: Record<string, unknown>, ctx: ValidationContext): void {
  const hooks = config.hooks;

  if (hooks === undefined) {
    return;
  }

  if (typeof hooks !== 'object' || hooks === null || Array.isArray(hooks)) {
    ctx.addError('hooks', 'Hooks must be an object', hooks);
    return;
  }

  const validEvents = ['PreToolUse', 'PostToolUse', 'PreMessage', 'PostMessage', 'PreCommit'];
  const hooksObj = hooks as Record<string, unknown>;

  for (const [event, hookList] of Object.entries(hooksObj)) {
    if (!validEvents.includes(event)) {
      ctx.addError(`hooks.${event}`, `Invalid hook event: ${event}. Valid events: ${validEvents.join(', ')}`, event);
    }

    if (!Array.isArray(hookList)) {
      ctx.addError(`hooks.${event}`, 'Hook list must be an array', hookList);
      continue;
    }

    for (let i = 0; i < hookList.length; i++) {
      const hook = hookList[i];

      if (typeof hook !== 'object' || hook === null) {
        ctx.addError(`hooks.${event}[${i}]`, 'Hook must be an object', hook);
        continue;
      }

      const hookObj = hook as Record<string, unknown>;

      if (!hookObj.name) {
        ctx.addError(`hooks.${event}[${i}].name`, 'Hook name is required');
      }

      if (!hookObj.match) {
        ctx.addError(`hooks.${event}[${i}].match`, 'Hook match pattern is required');
      }

      if (!hookObj.action) {
        ctx.addError(`hooks.${event}[${i}].action`, 'Hook action is required');
      } else if (!['warn', 'block', 'allow'].includes(hookObj.action as string)) {
        ctx.addError(`hooks.${event}[${i}].action`, 'Hook action must be: warn, block, or allow', hookObj.action);
      }
    }
  }
}

/**
 * Validate output section
 */
function validateOutput(config: Record<string, unknown>, ctx: ValidationContext): void {
  const output = config.output;

  if (output === undefined) {
    return;
  }

  if (typeof output !== 'object' || output === null) {
    ctx.addError('output', 'Output section must be an object', output);
    return;
  }

  const outputObj = output as Record<string, unknown>;

  if (outputObj.clean_before_sync !== undefined && typeof outputObj.clean_before_sync !== 'boolean') {
    ctx.addError('output.clean_before_sync', 'clean_before_sync must be a boolean', outputObj.clean_before_sync);
  }

  if (outputObj.add_do_not_edit_headers !== undefined && typeof outputObj.add_do_not_edit_headers !== 'boolean') {
    ctx.addError(
      'output.add_do_not_edit_headers',
      'add_do_not_edit_headers must be a boolean',
      outputObj.add_do_not_edit_headers
    );
  }
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: ConfigValidationError[]): string {
  return errors.map((e) => `  - ${e.path || '(root)'}: ${e.message}`).join('\n');
}

