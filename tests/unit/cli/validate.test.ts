/**
 * @file Validate Command Tests
 * @description Tests for the validate CLI command
 */

import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { validate } from '../../../src/cli/commands/validate.js';
import { DEFAULT_CONFIG_DIR } from '../../../src/config/loader.js';

// Mock logger to suppress output during tests
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    list: vi.fn(),
    setVerbose: vi.fn(),
  },
}));

// Mock output functions to suppress console output
vi.mock('../../../src/cli/output.js', async () => {
  const actual = await vi.importActual('../../../src/cli/output.js');
  return {
    ...actual,
    printHeader: vi.fn(),
    printSubHeader: vi.fn(),
    printSuccess: vi.fn(),
    printWarning: vi.fn(),
    printError: vi.fn(),
    printNewLine: vi.fn(),
    printSummary: vi.fn(),
    printValidationErrors: vi.fn(),
    printStats: vi.fn(),
    printKeyValue: vi.fn(),
  };
});

describe('Validate Command', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(
      tmpdir(),
      `ai-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('missing configuration', () => {
    it('should fail when .ai directory does not exist', async () => {
      const result = await validate({ projectRoot: testDir });

      expect(result.success).toBe(false);
      expect(result.configValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail when config.yaml does not exist', async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR), { recursive: true });

      const result = await validate({ projectRoot: testDir });

      expect(result.success).toBe(false);
      expect(result.configValid).toBe(false);
    });
  });

  describe('valid configuration', () => {
    beforeEach(async () => {
      // Create valid .ai structure
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules'), { recursive: true });
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'personas'), { recursive: true });
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'commands'), { recursive: true });
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'hooks'), { recursive: true });

      // Create valid config
      const config = `
version: "1.0.0"
targets:
  - cursor
  - claude
`;
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'), config);
    });

    it('should validate a minimal config successfully', async () => {
      const result = await validate({ projectRoot: testDir });

      expect(result.success).toBe(true);
      expect(result.configValid).toBe(true);
    });

    it('should validate config with rules', async () => {
      // Add a valid rule
      const rule = `---
name: test-rule
description: A test rule
version: 1.0.0
always_apply: true
---

# Test Rule

This is a test rule.
`;
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'test-rule.md'), rule);

      const result = await validate({ projectRoot: testDir });

      expect(result.success).toBe(true);
      expect(result.contentValid).toBe(true);
    });

    it('should validate config with personas', async () => {
      // Add a valid persona
      const persona = `---
name: tester
description: A test persona
version: 1.0.0
tools:
  - read
  - write
---

# Tester

This is a test persona.
`;
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'personas', 'tester.md'), persona);

      const result = await validate({ projectRoot: testDir });

      expect(result.success).toBe(true);
      expect(result.contentValid).toBe(true);
    });
  });

  describe('invalid configuration', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules'), { recursive: true });
    });

    it('should fail on invalid YAML syntax', async () => {
      const badConfig = `
version: "1.0.0"
targets:
  - cursor
  invalid yaml here
`;
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'), badConfig);

      const result = await validate({ projectRoot: testDir });

      expect(result.success).toBe(false);
      expect(result.configValid).toBe(false);
    });

    it('should fail on missing required fields', async () => {
      const badConfig = `
targets:
  - cursor
`;
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'), badConfig);

      const result = await validate({ projectRoot: testDir });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.message.includes('version'))).toBe(true);
    });

    it('should detect invalid rule files', async () => {
      // Create valid config first
      const config = `
version: "1.0.0"
targets:
  - cursor
`;
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'), config);

      // Add an invalid rule (missing name)
      const badRule = `---
description: Missing name field
---

# Bad Rule
`;
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'bad-rule.md'), badRule);

      const result = await validate({ projectRoot: testDir });

      // The validation should catch the invalid rule
      expect(result.success).toBe(false);
      expect(result.contentValid).toBe(false);
      // Check that there's at least one error related to the rule file
      expect(
        result.errors.some(
          (e) =>
            e.path.includes('bad-rule') ||
            e.message.includes('name') ||
            e.message.includes('required') ||
            e.message.toLowerCase().includes('missing')
        )
      ).toBe(true);
    });
  });

  describe('reference validation', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules'), { recursive: true });

      const config = `
version: "1.0.0"
targets:
  - cursor
subfolder_contexts:
  packages/frontend:
    rules: [core, database]
`;
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'), config);
    });

    it('should detect missing rule references in subfolder_contexts', async () => {
      // Only create 'core' rule, 'database' is missing
      const coreRule = `---
name: core
description: Core rule
version: 1.0.0
always_apply: true
---

# Core
`;
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'core.md'), coreRule);

      const result = await validate({ projectRoot: testDir });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.message.includes('database'))).toBe(true);
    });

    it('should pass when all references exist', async () => {
      const coreRule = `---
name: core
description: Core rule
version: 1.0.0
always_apply: true
---
# Core
`;
      const dbRule = `---
name: database
description: Database rule
version: 1.0.0
---
# Database
`;
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'core.md'), coreRule);
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'database.md'), dbRule);

      const result = await validate({ projectRoot: testDir });

      expect(result.success).toBe(true);
    });
  });

  describe('warnings', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules'), { recursive: true });

      const config = `
version: "1.0.0"
targets:
  - cursor
`;
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'), config);
    });

    it('should warn about rules without always_apply or globs', async () => {
      const rule = `---
name: orphan-rule
description: A rule without triggers
version: 1.0.0
always_apply: false
---

# Orphan Rule
`;
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'orphan.md'), rule);

      const result = await validate({ projectRoot: testDir });

      expect(result.warnings.some((w) => w.includes('may never trigger'))).toBe(true);
    });

    it('should warn about duplicate rule names', async () => {
      const rule1 = `---
name: duplicate
description: First rule
version: 1.0.0
always_apply: true
---
# First
`;
      const rule2 = `---
name: duplicate
description: Second rule
version: 1.0.0
always_apply: true
---
# Second
`;
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'first.md'), rule1);
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules', 'second.md'), rule2);

      const result = await validate({ projectRoot: testDir });

      expect(result.warnings.some((w) => w.includes('Duplicate rule names'))).toBe(true);
    });
  });

  describe('verbose mode', () => {
    beforeEach(async () => {
      await fs.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR, 'rules'), { recursive: true });

      const config = `
version: "1.0.0"
project_name: test-project
targets:
  - cursor
  - claude
`;
      await fs.writeFile(path.join(testDir, DEFAULT_CONFIG_DIR, 'config.yaml'), config);
    });

    it('should include additional information in verbose mode', async () => {
      const result = await validate({ projectRoot: testDir, verbose: true });

      expect(result.success).toBe(true);
    });
  });
});
