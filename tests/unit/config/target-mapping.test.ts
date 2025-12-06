/**
 * @file Target Mapping Loader Tests
 * @description Tests for loading and merging target configuration files
 */

import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadTargetMapping,
  loadAllTargetMappings,
  getOutputDir,
  isFeatureSupported,
  getTerminology,
  getToolMapping,
  getModelMapping,
  getFrontmatterConfig,
  supportsImportSyntax,
  getImportFormat,
  type TargetMapping,
} from '../../../src/config/target-mapping.js';

// Path to the actual targets directory
const TARGETS_DIR = path.resolve(__dirname, '../../../targets');

// Path to fixtures
const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures');

describe('loadTargetMapping', () => {
  describe('loading default targets', () => {
    it('should load cursor target mapping', async () => {
      const result = await loadTargetMapping('cursor', { toolRoot: path.resolve(__dirname, '../../..') });
      
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      
      expect(result.value.name).toBe('cursor');
      expect(result.value.output.rules_dir).toBe('.cursor/rules');
      expect(result.value.output.rules_format).toBe('mdc');
      expect(result.value.output.personas_dir).toBe('.cursor/commands/roles');
      expect(result.value.output.entry_point).toBe('AGENTS.md');
    });

    it('should load claude target mapping', async () => {
      const result = await loadTargetMapping('claude', { toolRoot: path.resolve(__dirname, '../../..') });
      
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      
      expect(result.value.name).toBe('claude');
      expect(result.value.output.rules_dir).toBe('.claude/skills');
      expect(result.value.output.rules_format).toBe('skill');
      expect(result.value.output.personas_dir).toBe('.claude/agents');
      expect(result.value.output.entry_point).toBe('CLAUDE.md');
    });

    it('should load factory target mapping', async () => {
      const result = await loadTargetMapping('factory', { toolRoot: path.resolve(__dirname, '../../..') });
      
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      
      expect(result.value.name).toBe('factory');
      expect(result.value.output.rules_dir).toBe('.factory/skills');
      expect(result.value.output.rules_format).toBe('skill');
      expect(result.value.output.personas_dir).toBe('.factory/droids');
      expect(result.value.output.entry_point).toBe('AGENTS.md');
    });
  });

  describe('tool mappings', () => {
    it('should have correct cursor tool mappings', async () => {
      const result = await loadTargetMapping('cursor', { toolRoot: path.resolve(__dirname, '../../..') });
      
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      
      const tools = result.value.tool_mapping;
      expect(tools.read).toBe('Read');
      expect(tools.write).toBe('Create');
      expect(tools.edit).toBe('Edit');
      expect(tools.execute).toBe('Execute');
      expect(tools.search).toBe('Grep');
    });

    it('should have correct claude tool mappings', async () => {
      const result = await loadTargetMapping('claude', { toolRoot: path.resolve(__dirname, '../../..') });
      
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      
      const tools = result.value.tool_mapping;
      expect(tools.read).toBe('Read');
      expect(tools.write).toBe('Write');
      expect(tools.execute).toBe('Bash');
      expect(tools.search).toBe('Search');
    });

    it('should have correct factory tool mappings (lowercase)', async () => {
      const result = await loadTargetMapping('factory', { toolRoot: path.resolve(__dirname, '../../..') });
      
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      
      const tools = result.value.tool_mapping;
      expect(tools.read).toBe('read');
      expect(tools.write).toBe('write');
      expect(tools.execute).toBe('execute');
    });
  });

  describe('model mappings', () => {
    it('should have inherit for cursor models', async () => {
      const result = await loadTargetMapping('cursor', { toolRoot: path.resolve(__dirname, '../../..') });
      
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      
      expect(result.value.model_mapping.default).toBe('inherit');
      expect(result.value.model_mapping.fast).toBe('inherit');
      expect(result.value.model_mapping.powerful).toBe('inherit');
    });

    it('should have specific claude models', async () => {
      const result = await loadTargetMapping('claude', { toolRoot: path.resolve(__dirname, '../../..') });
      
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      
      expect(result.value.model_mapping.default).toContain('claude');
      expect(result.value.model_mapping.fast).toContain('haiku');
    });
  });

  describe('unsupported features', () => {
    it('should mark hooks as unsupported for cursor', async () => {
      const result = await loadTargetMapping('cursor', { toolRoot: path.resolve(__dirname, '../../..') });
      
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      
      expect(result.value.unsupported).toContain('hooks');
    });

    it('should mark hooks as unsupported for factory', async () => {
      const result = await loadTargetMapping('factory', { toolRoot: path.resolve(__dirname, '../../..') });
      
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      
      expect(result.value.unsupported).toContain('hooks');
    });

    it('should have no unsupported features for claude', async () => {
      const result = await loadTargetMapping('claude', { toolRoot: path.resolve(__dirname, '../../..') });
      
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      
      expect(result.value.unsupported).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should return error for non-existent target', async () => {
      const result = await loadTargetMapping('nonexistent' as any, { toolRoot: path.resolve(__dirname, '../../..') });
      
      expect(result.ok).toBe(false);
      if (result.ok) return;
      
      expect(result.error.message).toContain('nonexistent');
    });
  });
});

describe('loadAllTargetMappings', () => {
  it('should load all specified targets', async () => {
    const result = await loadAllTargetMappings(['cursor', 'claude', 'factory'], {
      toolRoot: path.resolve(__dirname, '../../..'),
    });
    
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    
    expect(result.value.size).toBe(3);
    expect(result.value.has('cursor')).toBe(true);
    expect(result.value.has('claude')).toBe(true);
    expect(result.value.has('factory')).toBe(true);
  });

  it('should return partial results when some targets fail', async () => {
    const result = await loadAllTargetMappings(['cursor', 'nonexistent' as any], {
      toolRoot: path.resolve(__dirname, '../../..'),
    });
    
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    
    expect(result.value.size).toBe(1);
    expect(result.value.has('cursor')).toBe(true);
  });
});

describe('utility functions', () => {
  let cursorMapping: TargetMapping;
  let claudeMapping: TargetMapping;

  beforeEach(async () => {
    const cursorResult = await loadTargetMapping('cursor', { toolRoot: path.resolve(__dirname, '../../..') });
    const claudeResult = await loadTargetMapping('claude', { toolRoot: path.resolve(__dirname, '../../..') });
    
    if (cursorResult.ok) cursorMapping = cursorResult.value;
    if (claudeResult.ok) claudeMapping = claudeResult.value;
  });

  describe('getOutputDir', () => {
    it('should return rules directory', () => {
      expect(getOutputDir(cursorMapping, 'rules')).toBe('.cursor/rules');
      expect(getOutputDir(claudeMapping, 'rules')).toBe('.claude/skills');
    });

    it('should return personas directory', () => {
      expect(getOutputDir(cursorMapping, 'personas')).toBe('.cursor/commands/roles');
      expect(getOutputDir(claudeMapping, 'personas')).toBe('.claude/agents');
    });

    it('should return commands directory', () => {
      expect(getOutputDir(cursorMapping, 'commands')).toBe('.cursor/commands');
    });
  });

  describe('isFeatureSupported', () => {
    it('should return false for unsupported features', () => {
      expect(isFeatureSupported(cursorMapping, 'hooks')).toBe(false);
    });

    it('should return true for supported features', () => {
      expect(isFeatureSupported(cursorMapping, 'rules')).toBe(true);
      expect(isFeatureSupported(claudeMapping, 'hooks')).toBe(true);
    });
  });

  describe('getTerminology', () => {
    it('should return target-specific terminology', () => {
      expect(getTerminology(cursorMapping, 'persona')).toBe('role');
      expect(getTerminology(claudeMapping, 'persona')).toBe('agent');
    });

    it('should return null for unsupported terms', () => {
      expect(getTerminology(cursorMapping, 'hook')).toBeNull();
    });
  });

  describe('getToolMapping', () => {
    it('should return a copy of tool mappings', () => {
      const tools = getToolMapping(cursorMapping);
      expect(tools.read).toBe('Read');
      
      // Should be a copy
      tools.read = 'Modified';
      expect(cursorMapping.tool_mapping.read).toBe('Read');
    });
  });

  describe('getModelMapping', () => {
    it('should return a copy of model mappings', () => {
      const models = getModelMapping(cursorMapping);
      expect(models.default).toBe('inherit');
    });
  });

  describe('getFrontmatterConfig', () => {
    it('should return frontmatter config for content type', () => {
      const config = getFrontmatterConfig(cursorMapping, 'rules');
      expect(config).toBeDefined();
      expect(config?.include_fields).toContain('description');
      expect(config?.include_fields).toContain('globs');
      expect(config?.include_fields).toContain('alwaysApply');
    });

    it('should have field mappings for cursor rules', () => {
      const config = getFrontmatterConfig(cursorMapping, 'rules');
      expect(config?.field_mappings.always_apply).toBe('alwaysApply');
    });
  });

  describe('supportsImportSyntax', () => {
    it('should return true for claude', () => {
      expect(supportsImportSyntax(claudeMapping)).toBe(true);
    });

    it('should return false for cursor', () => {
      expect(supportsImportSyntax(cursorMapping)).toBe(false);
    });
  });

  describe('getImportFormat', () => {
    it('should return import format for claude', () => {
      expect(getImportFormat(claudeMapping)).toBe('@import {path}');
    });

    it('should return default format when not configured', () => {
      expect(getImportFormat(cursorMapping)).toBe('@import {path}');
    });
  });
});

describe('terminology mappings', () => {
  it('should map rule to skill for claude', async () => {
    const result = await loadTargetMapping('claude', { toolRoot: path.resolve(__dirname, '../../..') });
    
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    
    expect(result.value.terminology.rule).toBe('skill');
  });

  it('should map persona to droid for factory', async () => {
    const result = await loadTargetMapping('factory', { toolRoot: path.resolve(__dirname, '../../..') });
    
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    
    expect(result.value.terminology.persona).toBe('droid');
  });

  it('should map persona to role for cursor', async () => {
    const result = await loadTargetMapping('cursor', { toolRoot: path.resolve(__dirname, '../../..') });
    
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    
    expect(result.value.terminology.persona).toBe('role');
  });
});

describe('frontmatter configurations', () => {
  it('should have cursor rule frontmatter config', async () => {
    const result = await loadTargetMapping('cursor', { toolRoot: path.resolve(__dirname, '../../..') });
    
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    
    const config = result.value.frontmatter.rules;
    expect(config).toBeDefined();
    expect(config?.include_fields).toEqual(['description', 'globs', 'alwaysApply']);
    expect(config?.transforms.globs).toBe('array_to_comma_separated');
  });

  it('should have claude persona frontmatter config', async () => {
    const result = await loadTargetMapping('claude', { toolRoot: path.resolve(__dirname, '../../..') });
    
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    
    const config = result.value.frontmatter.personas;
    expect(config).toBeDefined();
    expect(config?.include_fields).toContain('tools');
    expect(config?.include_fields).toContain('model');
  });
});

describe('hook events', () => {
  it('should list supported hook events for claude', async () => {
    const result = await loadTargetMapping('claude', { toolRoot: path.resolve(__dirname, '../../..') });
    
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    
    expect(result.value.hook_events).toBeDefined();
    expect(result.value.hook_events).toContain('PreToolUse');
    expect(result.value.hook_events).toContain('PostToolUse');
    expect(result.value.hook_events).toContain('PreMessage');
    expect(result.value.hook_events).toContain('PostMessage');
    expect(result.value.hook_events).toContain('PreCommit');
  });
});

