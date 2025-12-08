/**
 * @file Parsers Module
 * @description Export all parser functions and types
 */

// Frontmatter parser
export {
  parseFrontmatter,
  hasFrontmatter,
  validateRequiredFields,
  applyDefaults,
  formatParseError as formatFrontmatterError,
  type ParsedFrontmatter,
  type FrontmatterParseError,
} from './frontmatter.js';

// Shared types
export {
  type BaseFrontmatter,
  type TargetType,
  type ContentValidationError,
  type ParsedContent,
  type ParseError,
  DEFAULT_TARGETS,
  createParseError,
  formatParseError,
  isValidTarget,
  validateTargets,
  validateVersion,
} from './types.js';

// Rule parser
export {
  parseRule,
  parseRules,
  shouldApplyRule,
  filterRulesByTarget,
  sortRulesByPriority,
  RULE_DEFAULTS,
  type Rule,
  type ParsedRule,
  type RuleCategory,
  type RulePriority,
} from './rule.js';

// Persona parser
export {
  parsePersona,
  parsePersonas,
  filterPersonasByTarget,
  getUniqueTools,
  resolvePersonaInheritance,
  PERSONA_DEFAULTS,
  type Persona,
  type ParsedPersona,
  type PersonaTool,
  type InheritanceWarning,
  type ResolvePersonaInheritanceOptions,
  type ResolvePersonaInheritanceResult,
} from './persona.js';

// Command parser
export {
  parseCommand,
  parseCommands,
  filterCommandsByTarget,
  COMMAND_DEFAULTS,
  type Command,
  type ParsedCommand,
  type CommandArg,
  type CommandArgType,
} from './command.js';

// Hook parser
export {
  parseHook,
  parseHooks,
  filterHooksByTarget,
  filterHooksByEvent,
  groupHooksByEvent,
  HOOK_DEFAULTS,
  type Hook,
  type ParsedHook,
  type HookEvent,
} from './hook.js';

// MCP parser
export {
  parseMcpConfig,
  filterServersByTarget,
  getEnabledServers,
  countServersByType,
  interpolateEnvVars,
  isCommandServer,
  isUrlServer,
  MCP_SERVER_DEFAULTS,
  type McpCommandServer,
  type McpUrlServer,
  type McpServer,
  type McpConfig,
  type ParsedMcpConfig,
} from './mcp.js';

