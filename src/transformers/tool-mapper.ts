/**
 * @file Tool Mapper
 * @description Map generic tool names to target-specific names
 *
 * This is a stub file - full implementation in Phase 4
 */

/**
 * Default tool mappings for each target
 */
export const DEFAULT_TOOL_MAPPINGS: Record<string, Record<string, string>> = {
  cursor: {
    read: 'Read',
    write: 'Create',
    edit: 'Edit',
    execute: 'Execute',
    search: 'Grep',
    glob: 'Glob',
    fetch: 'FetchUrl',
    ls: 'LS',
  },
  claude: {
    read: 'Read',
    write: 'Write',
    edit: 'Edit',
    execute: 'Bash',
    search: 'Search',
    glob: 'Glob',
    fetch: 'WebFetch',
    ls: 'ListDir',
  },
  factory: {
    read: 'read',
    write: 'write',
    edit: 'edit',
    execute: 'execute',
    search: 'search',
    glob: 'glob',
    fetch: 'fetch',
    ls: 'list',
  },
};

/**
 * Map a generic tool name to a target-specific name
 */
export function mapTool(tool: string, target: string): string {
  const targetMappings = DEFAULT_TOOL_MAPPINGS[target];
  if (!targetMappings) {
    return tool;
  }
  return targetMappings[tool.toLowerCase()] ?? tool;
}

/**
 * Map an array of tools to target-specific names
 */
export function mapTools(tools: string[], target: string): string[] {
  return tools.map((tool) => mapTool(tool, target));
}

