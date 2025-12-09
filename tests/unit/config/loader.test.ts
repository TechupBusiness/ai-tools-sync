/**
 * @file Configuration Loader Tests
 * @description Tests for configuration loading
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  loadConfig,
  loadConfigWithDefaults,
  hasConfigDir,
  hasConfigFile,
  getAiDir,
  getAiPaths,
  ConfigLoadError,
  DEFAULT_CONFIG_DIR,
} from '../../../src/config/loader.js';
import { isOk, isErr } from '../../../src/utils/result.js';

// Test fixtures directory
const _FIXTURES_DIR = path.join(__dirname, '../../fixtures/configs');

describe('Configuration Loader', () => {
  // Temporary directory for tests
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(__dirname, `../../.temp-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadConfig()', () => {
    it('should load valid config from default config directory', async () => {
      // Create config directory
      const aiDir = path.join(tempDir, DEFAULT_CONFIG_DIR);
      await fs.mkdir(aiDir, { recursive: true });
      await fs.writeFile(
        path.join(aiDir, 'config.yaml'),
        `version: "1.0.0"
project_name: test-project
targets:
  - cursor
  - claude
`
      );

      const result = await loadConfig({ projectRoot: tempDir });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.version).toBe('1.0.0');
        expect(result.value.project_name).toBe('test-project');
        expect(result.value.targets).toEqual(['cursor', 'claude']);
        expect(result.value.projectRoot).toBe(tempDir);
        expect(result.value.aiDir).toBe(aiDir);
      }
    });

    it('should apply defaults to partial config', async () => {
      const aiDir = path.join(tempDir, DEFAULT_CONFIG_DIR);
      await fs.mkdir(aiDir, { recursive: true });
      await fs.writeFile(path.join(aiDir, 'config.yaml'), `version: "1.0.0"`);

      const result = await loadConfig({ projectRoot: tempDir });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.targets).toEqual(['cursor', 'claude', 'factory']);
        expect(result.value.output?.clean_before_sync).toBe(true);
      }
    });

    it('should support .yml extension', async () => {
      const aiDir = path.join(tempDir, DEFAULT_CONFIG_DIR);
      await fs.mkdir(aiDir, { recursive: true });
      await fs.writeFile(path.join(aiDir, 'config.yml'), `version: "1.0.0"`);

      const result = await loadConfig({ projectRoot: tempDir });

      expect(isOk(result)).toBe(true);
    });

    it('should return error if config directory does not exist', async () => {
      const result = await loadConfig({ projectRoot: tempDir });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ConfigLoadError);
        expect(result.error.message).toContain('not found');
      }
    });

    it('should return error if config file does not exist', async () => {
      const aiDir = path.join(tempDir, DEFAULT_CONFIG_DIR);
      await fs.mkdir(aiDir, { recursive: true });

      const result = await loadConfig({ projectRoot: tempDir });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Configuration file not found');
      }
    });

    it('should return error for invalid YAML', async () => {
      const aiDir = path.join(tempDir, DEFAULT_CONFIG_DIR);
      await fs.mkdir(aiDir, { recursive: true });
      await fs.writeFile(
        path.join(aiDir, 'config.yaml'),
        `version: "1.0.0
invalid yaml [[[`
      );

      const result = await loadConfig({ projectRoot: tempDir });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Failed to parse YAML');
      }
    });

    it('should return error for empty config file', async () => {
      const aiDir = path.join(tempDir, DEFAULT_CONFIG_DIR);
      await fs.mkdir(aiDir, { recursive: true });
      await fs.writeFile(path.join(aiDir, 'config.yaml'), '');

      const result = await loadConfig({ projectRoot: tempDir });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('empty');
      }
    });

    it('should return error for invalid config', async () => {
      const aiDir = path.join(tempDir, DEFAULT_CONFIG_DIR);
      await fs.mkdir(aiDir, { recursive: true });
      await fs.writeFile(
        path.join(aiDir, 'config.yaml'),
        `version: invalid
targets:
  - unknown-target`
      );

      const result = await loadConfig({ projectRoot: tempDir });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('validation failed');
      }
    });

    it('should use custom aiDir path', async () => {
      const customAiDir = path.join(tempDir, 'custom-ai');
      await fs.mkdir(customAiDir, { recursive: true });
      await fs.writeFile(path.join(customAiDir, 'config.yaml'), `version: "1.0.0"`);

      const result = await loadConfig({
        projectRoot: tempDir,
        aiDir: customAiDir,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.aiDir).toBe(customAiDir);
      }
    });

    it('should use custom configPath', async () => {
      const aiDir = path.join(tempDir, DEFAULT_CONFIG_DIR);
      await fs.mkdir(aiDir, { recursive: true });
      await fs.writeFile(path.join(aiDir, 'custom-config.yaml'), `version: "1.0.0"`);

      const result = await loadConfig({
        projectRoot: tempDir,
        configPath: path.join(aiDir, 'custom-config.yaml'),
      });

      expect(isOk(result)).toBe(true);
    });
  });

  describe('loadConfigWithDefaults()', () => {
    it('should return default config when config directory does not exist', async () => {
      const config = await loadConfigWithDefaults({ projectRoot: tempDir });

      expect(config.version).toBe('1.0.0');
      expect(config.targets).toEqual(['cursor', 'claude', 'factory']);
      expect(config.projectRoot).toBe(tempDir);
    });

    it('should return loaded config when it exists', async () => {
      const aiDir = path.join(tempDir, DEFAULT_CONFIG_DIR);
      await fs.mkdir(aiDir, { recursive: true });
      await fs.writeFile(
        path.join(aiDir, 'config.yaml'),
        `version: "1.0.0"
project_name: my-project`
      );

      const config = await loadConfigWithDefaults({ projectRoot: tempDir });

      expect(config.project_name).toBe('my-project');
    });
  });

  describe('hasConfigDir()', () => {
    it('should return true when config directory exists', async () => {
      const aiDir = path.join(tempDir, DEFAULT_CONFIG_DIR);
      await fs.mkdir(aiDir, { recursive: true });

      expect(await hasConfigDir(tempDir)).toBe(true);
    });

    it('should return false when config directory does not exist', async () => {
      expect(await hasConfigDir(tempDir)).toBe(false);
    });
  });

  describe('hasConfigFile()', () => {
    it('should return true when config.yaml exists', async () => {
      const aiDir = path.join(tempDir, DEFAULT_CONFIG_DIR);
      await fs.mkdir(aiDir, { recursive: true });
      await fs.writeFile(path.join(aiDir, 'config.yaml'), 'version: "1.0.0"');

      expect(await hasConfigFile(tempDir)).toBe(true);
    });

    it('should return true when config.yml exists', async () => {
      const aiDir = path.join(tempDir, DEFAULT_CONFIG_DIR);
      await fs.mkdir(aiDir, { recursive: true });
      await fs.writeFile(path.join(aiDir, 'config.yml'), 'version: "1.0.0"');

      expect(await hasConfigFile(tempDir)).toBe(true);
    });

    it('should return false when no config file exists', async () => {
      const aiDir = path.join(tempDir, DEFAULT_CONFIG_DIR);
      await fs.mkdir(aiDir, { recursive: true });

      expect(await hasConfigFile(tempDir)).toBe(false);
    });
  });

  describe('getAiDir()', () => {
    it('should return default config path for project root', () => {
      const aiDir = getAiDir(tempDir);
      expect(aiDir).toBe(path.join(tempDir, DEFAULT_CONFIG_DIR));
    });

    it('should use cwd when no project root provided', () => {
      const aiDir = getAiDir();
      expect(aiDir).toBe(path.join(process.cwd(), DEFAULT_CONFIG_DIR));
    });
  });

  describe('getAiPaths()', () => {
    it('should return all config subdirectory paths', () => {
      const paths = getAiPaths(tempDir);

      expect(paths.aiDir).toBe(path.join(tempDir, DEFAULT_CONFIG_DIR));
      expect(paths.rulesDir).toBe(path.join(tempDir, DEFAULT_CONFIG_DIR, 'rules'));
      expect(paths.personasDir).toBe(path.join(tempDir, DEFAULT_CONFIG_DIR, 'personas'));
      expect(paths.commandsDir).toBe(path.join(tempDir, DEFAULT_CONFIG_DIR, 'commands'));
      expect(paths.hooksDir).toBe(path.join(tempDir, DEFAULT_CONFIG_DIR, 'hooks'));
      expect(paths.pluginsDir).toBe(path.join(tempDir, DEFAULT_CONFIG_DIR, 'plugins'));
      expect(paths.overridesDir).toBe(path.join(tempDir, DEFAULT_CONFIG_DIR, 'overrides'));
      expect(paths.inputDir).toBe(path.join(tempDir, DEFAULT_CONFIG_DIR, 'input'));
      expect(paths.targetsDir).toBe(path.join(tempDir, DEFAULT_CONFIG_DIR, 'targets'));
    });
  });
});
