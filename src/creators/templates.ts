import type { GenericKind } from './types.js';
import type { Command } from '@/parsers/command.js';
import type { Hook } from '@/parsers/hook.js';
import type { Persona } from '@/parsers/persona.js';
import type { Rule } from '@/parsers/rule.js';

export type TemplateFrontmatter<K extends GenericKind> = K extends 'rule'
  ? Partial<Rule>
  : K extends 'persona'
    ? Partial<Persona>
    : K extends 'command'
      ? Partial<Command>
      : Partial<Hook>;

export interface TemplateDefinition<K extends GenericKind = GenericKind> {
  id: string;
  kind: K;
  frontmatter: TemplateFrontmatter<K>;
  body: string;
}

const ruleTemplate: TemplateDefinition<'rule'> = {
  id: 'rule/basic',
  kind: 'rule',
  frontmatter: {
    version: '1.0.0',
    always_apply: false,
    globs: [],
    priority: 'medium',
  },
  body: '# {{name}}\n\nDescribe when this rule should apply and what guidance it provides.',
};

const personaTemplate: TemplateDefinition<'persona'> = {
  id: 'persona/basic',
  kind: 'persona',
  frontmatter: {
    version: '1.0.0',
    tools: ['read', 'write', 'edit', 'search', 'glob', 'ls'],
    model: 'default',
  },
  body: "# {{name}}\n\nDescribe this persona's responsibilities, constraints, and style.",
};

const commandTemplate: TemplateDefinition<'command'> = {
  id: 'command/basic',
  kind: 'command',
  frontmatter: {
    version: '1.0.0',
    args: [],
  },
  body: '# {{name}}\n\nDocument how to use this command and any required arguments.',
};

const hookTemplate: TemplateDefinition<'hook'> = {
  id: 'hook/basic',
  kind: 'hook',
  frontmatter: {
    version: '1.0.0',
    event: 'PreToolUse',
    targets: ['claude'],
  },
  body: '# {{name}}\n\nExplain what this hook should do and when it should run.',
};

const TEMPLATE_MAP: Record<string, TemplateDefinition> = {
  [ruleTemplate.id]: ruleTemplate,
  [personaTemplate.id]: personaTemplate,
  [commandTemplate.id]: commandTemplate,
  [hookTemplate.id]: hookTemplate,
};

function normalizeTemplateId(kind: GenericKind, templateId?: string): string {
  if (!templateId) {
    return `${kind}/basic`;
  }
  if (templateId.includes('/')) {
    return templateId;
  }
  return `${kind}/${templateId}`;
}

export function getTemplate(
  kind: GenericKind,
  templateId?: string
): TemplateDefinition | undefined {
  return TEMPLATE_MAP[normalizeTemplateId(kind, templateId)];
}

export function listTemplates(kind?: GenericKind): TemplateDefinition[] {
  const templates = Object.values(TEMPLATE_MAP);
  if (!kind) {
    return templates;
  }
  return templates.filter((template) => template.kind === kind);
}

export function applyBodyTemplate(body: string, name: string): string {
  return body.replaceAll('{{name}}', name);
}
