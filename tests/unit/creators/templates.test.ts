import { describe, expect, it } from 'vitest';

import { applyBodyTemplate, getTemplate, listTemplates } from '../../../src/creators/templates.js';

describe('creator templates', () => {
  it('returns basic template for each kind', () => {
    const kinds = ['rule', 'persona', 'command', 'hook'] as const;
    for (const kind of kinds) {
      const template = getTemplate(kind);
      expect(template?.id).toBe(`${kind}/basic`);
      expect(template?.kind).toBe(kind);
    }
  });

  it('lists templates by kind', () => {
    const ruleTemplates = listTemplates('rule');
    expect(ruleTemplates.length).toBeGreaterThan(0);
    expect(ruleTemplates.every((tpl) => tpl.kind === 'rule')).toBe(true);
  });

  it('applies name placeholder in body templates', () => {
    const template = getTemplate('rule');
    expect(template).toBeDefined();
    if (template) {
      const body = applyBodyTemplate(template.body, 'test-rule');
      expect(body).toContain('test-rule');
    }
  });
});
