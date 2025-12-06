/**
 * @file Configurable Directory Tests
 * @description Tests for configurable configuration directory name
 *
 * Priority order:
 * 1. CLI flag (--config-dir=<path>)
 * 2. Environment variable (AI_TOOL_SYNC_DIR)
 * 3. package.json ("ai-tool-sync": { "configDir": ".ai" })
 * 4. Default (.ai-tool-sync)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  loadConfig,
  resolveConfigDir,
  resolveConfigDirSync,
  hasConfigDir,
  hasConfigFile,
  getAiDir,
  getAiPaths,
  getAiPathsAsync,
  DEFAULT_CONFIG_DIR,
  CONFIG_DIR_ENV_VAR,
} from '../../../src/config/loader.js';
import { isOk } from '../../../src/utils/result.js';

describe('Configurable Directory', () => {
  let tempDir: string;
  const originalEnv = process.env[CONFIG_DIR_ENV_VAR];

  beforeEach(async () => {
    tempDir = path.join(__dirname, `../../.temp-config-dir-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    // Clear environment variable
    delete process.env[CONFIG_DIR_ENV_VAR];
  });

  afterEach(async () => {
    // Restore environment variable
    if (originalEnv !== undefined) {
      process.env[CONFIG_DIR_ENV_VAR] = originalEnv;
    } else {
      delete process.env[CONFIG_DIR_ENV_VAR];
    }

    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('resolveConfigDir()', () => {
    it('should return default (.ai-tool-sync) when no overrides', async () => {
      const result = await resolveConfigDir({ projectRoot: tempDir });
      expect(result).toBe(DEFAULT_CONFIG_DIR);
    });

    it('should prioritize explicit configDir option (CLI flag)', async () => {
      // Set environment variable
      process.env[CONFIG_DIR_ENV_VAR] = '.env-dir';

      // Create package.json with configDir
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ 'ai-tool-sync': { configDir: '.pkg-dir' } })
      );

      // Explicit option should win
      const result = await resolveConfigDir({
        projectRoot: tempDir,
        configDir: '.cli-dir',
      });
      expect(result).toBe('.cli-dir');
    });

    it('should use environment variable when no CLI flag', async () => {
      process.env[CONFIG_DIR_ENV_VAR] = '.env-dir';

      // Create package.json with configDir
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ 'ai-tool-sync': { configDir: '.pkg-dir' } })
      );

      const result = await resolveConfigDir({ projectRoot: tempDir });
      expect(result).toBe('.env-dir');
    });

    it('should use package.json when no CLI flag or env var', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ 'ai-tool-sync': { configDir: '.custom-ai' } })
      );

      const result = await resolveConfigDir({ projectRoot: tempDir });
      expect(result).toBe('.custom-ai');
    });

    it('should return default when package.json has no ai-tool-sync config', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'test-project', version: '1.0.0' })
      );

      const result = await resolveConfigDir({ projectRoot: tempDir });
      expect(result).toBe(DEFAULT_CONFIG_DIR);
    });

    it('should return default when package.json does not exist', async () => {
      const result = await resolveConfigDir({ projectRoot: tempDir });
      expect(result).toBe(DEFAULT_CONFIG_DIR);
    });
  });

  describe('resolveConfigDirSync()', () => {
    it('should return default when no overrides', () => {
      const result = resolveConfigDirSync();
      expect(result).toBe(DEFAULT_CONFIG_DIR);
    });

    it('should prioritize explicit configDir option', () => {
      process.env[CONFIG_DIR_ENV_VAR] = '.env-dir';

      const result = resolveConfigDirSync({ configDir: '.cli-dir' });
      expect(result).toBe('.cli-dir');
    });

    it('should use environment variable when no configDir option', () => {
      process.env[CONFIG_DIR_ENV_VAR] = '.env-dir';

      const result = resolveConfigDirSync();
      expect(result).toBe('.env-dir');
    });
  });

  describe('loadConfig() with configDir', () => {
    it('should load config from custom directory via CLI option', async () => {
      const customDir = '.custom-config';
      const aiDir = path.join(tempDir, customDir);
      await fs.mkdir(aiDir, { recursive: true });
      await fs.writeFile(
        path.join(aiDir, 'config.yaml'),
        `version: "1.0.0"
project_name: custom-project`
      );

      const result = await loadConfig({
        projectRoot: tempDir,
        configDir: customDir,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.project_name).toBe('custom-project');
        expect(result.value.aiDir).toBe(aiDir);
      }
    });

    it('should load config from directory specified in env var', async () => {
      const envDir = '.env-config';
      process.env[CONFIG_DIR_ENV_VAR] = envDir;

      const aiDir = path.join(tempDir, envDir);
      await fs.mkdir(aiDir, { recursive: true });
      await fs.writeFile(
        path.join(aiDir, 'config.yaml'),
        `version: "1.0.0"
project_name: env-project`
      );

      const result = await loadConfig({ projectRoot: tempDir });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.project_name).toBe('env-project');
        expect(result.value.aiDir).toBe(aiDir);
      }
    });

    it('should load config from directory specified in package.json', async () => {
      const pkgDir = '.pkg-config';
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ 'ai-tool-sync': { configDir: pkgDir } })
      );

      const aiDir = path.join(tempDir, pkgDir);
      await fs.mkdir(aiDir, { recursive: true });
      await fs.writeFile(
        path.join(aiDir, 'config.yaml'),
        `version: "1.0.0"
project_name: pkg-project`
      );

      const result = await loadConfig({ projectRoot: tempDir });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.project_name).toBe('pkg-project');
        expect(result.value.aiDir).toBe(aiDir);
      }
    });
  });

  describe('hasConfigDir() with configDir', () => {
    it('should check custom directory when specified', async () => {
      const customDir = '.custom';
      await fs.mkdir(path.join(tempDir, customDir), { recursive: true });

      expect(await hasConfigDir(tempDir, customDir)).toBe(true);
      expect(await hasConfigDir(tempDir)).toBe(false); // default doesn't exist
    });

    it('should resolve from package.json when no configDir specified', async () => {
      const pkgDir = '.pkg-ai';
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ 'ai-tool-sync': { configDir: pkgDir } })
      );
      await fs.mkdir(path.join(tempDir, pkgDir), { recursive: true });

      expect(await hasConfigDir(tempDir)).toBe(true);
    });
  });

  describe('hasConfigFile() with configDir', () => {
    it('should check config file in custom directory', async () => {
      const customDir = '.custom';
      const aiDir = path.join(tempDir, customDir);
      await fs.mkdir(aiDir, { recursive: true });
      await fs.writeFile(path.join(aiDir, 'config.yaml'), 'version: "1.0.0"');

      expect(await hasConfigFile(tempDir, customDir)).toBe(true);
      expect(await hasConfigFile(tempDir)).toBe(false); // default doesn't exist
    });
  });

  describe('getAiDir() with configDir', () => {
    it('should use custom directory when specified', () => {
      const aiDir = getAiDir(tempDir, '.custom');
      expect(aiDir).toBe(path.join(tempDir, '.custom'));
    });

    it('should use environment variable when no configDir specified', () => {
      process.env[CONFIG_DIR_ENV_VAR] = '.env-ai';

      const aiDir = getAiDir(tempDir);
      expect(aiDir).toBe(path.join(tempDir, '.env-ai'));
    });

    it('should use default when no override', () => {
      const aiDir = getAiDir(tempDir);
      expect(aiDir).toBe(path.join(tempDir, DEFAULT_CONFIG_DIR));
    });
  });

  describe('getAiPaths() with configDir', () => {
    it('should return paths for custom directory', () => {
      const customDir = '.my-ai';
      const paths = getAiPaths(tempDir, customDir);

      expect(paths.aiDir).toBe(path.join(tempDir, customDir));
      expect(paths.rulesDir).toBe(path.join(tempDir, customDir, 'rules'));
      expect(paths.personasDir).toBe(path.join(tempDir, customDir, 'personas'));
    });
  });

  describe('getAiPathsAsync() with configDir', () => {
    it('should resolve from package.json', async () => {
      const pkgDir = '.pkg-ai';
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ 'ai-tool-sync': { configDir: pkgDir } })
      );

      const paths = await getAiPathsAsync(tempDir);

      expect(paths.aiDir).toBe(path.join(tempDir, pkgDir));
      expect(paths.rulesDir).toBe(path.join(tempDir, pkgDir, 'rules'));
    });

    it('should use explicit configDir over package.json', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ 'ai-tool-sync': { configDir: '.pkg' } })
      );

      const paths = await getAiPathsAsync(tempDir, '.explicit');

      expect(paths.aiDir).toBe(path.join(tempDir, '.explicit'));
    });
  });

  describe('Priority order verification', () => {
    it('should follow priority: CLI > ENV > package.json > default', async () => {
      // Set up all sources
      process.env[CONFIG_DIR_ENV_VAR] = '.env-dir';
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ 'ai-tool-sync': { configDir: '.pkg-dir' } })
      );

      // Test 1: CLI wins
      let result = await resolveConfigDir({
        projectRoot: tempDir,
        configDir: '.cli-dir',
      });
      expect(result).toBe('.cli-dir');

      // Test 2: ENV wins when no CLI
      result = await resolveConfigDir({ projectRoot: tempDir });
      expect(result).toBe('.env-dir');

      // Test 3: package.json wins when no CLI or ENV
      delete process.env[CONFIG_DIR_ENV_VAR];
      result = await resolveConfigDir({ projectRoot: tempDir });
      expect(result).toBe('.pkg-dir');

      // Test 4: default when nothing set
      await fs.unlink(path.join(tempDir, 'package.json'));
      result = await resolveConfigDir({ projectRoot: tempDir });
      expect(result).toBe(DEFAULT_CONFIG_DIR);
    });
  });
});

