import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { clean } from '../../../src/cli/commands/clean.js';
import * as fsUtils from '../../../src/utils/fs.js';
import { MANIFEST_FILENAME, type ManifestV2 } from '../../../src/utils/manifest.js';
import { err } from '../../../src/utils/result.js';

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
    newLine: vi.fn(),
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
    printListItem: vi.fn(),
    printStats: vi.fn(),
    printKeyValue: vi.fn(),
  };
});

describe('Clean Command', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `ai-sync-clean-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('should succeed when no manifest exists', async () => {
    const result = await clean({ projectRoot: testDir });

    expect(result.success).toBe(true);
    expect(result.deleted).toHaveLength(0);
  });

  it('should delete unchanged files', async () => {
    const filePath = 'file.txt';
    const content = 'same';
    const manifest: ManifestV2 = {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      files: [{ path: filePath, hash: hashContent(content) }],
      directories: [],
    };

    await writeManifestV2(testDir, manifest);
    await fs.writeFile(path.join(testDir, filePath), content);

    const result = await clean({ projectRoot: testDir });

    expect(result.success).toBe(true);
    expect(result.deleted).toContain(filePath);
    expect(await fsUtils.fileExists(path.join(testDir, filePath))).toBe(false);
  });

  it('should skip modified files by default', async () => {
    const filePath = 'file.txt';
    const manifest: ManifestV2 = {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      files: [{ path: filePath, hash: hashContent('original') }],
      directories: [],
    };

    await writeManifestV2(testDir, manifest);
    await fs.writeFile(path.join(testDir, filePath), 'changed');

    const result = await clean({ projectRoot: testDir });

    expect(result.success).toBe(true);
    expect(result.skipped).toContain(filePath);
    expect(await fsUtils.fileExists(path.join(testDir, filePath))).toBe(true);
  });

  it('should delete modified files with force', async () => {
    const filePath = 'file.txt';
    const manifest: ManifestV2 = {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      files: [{ path: filePath, hash: hashContent('original') }],
      directories: [],
    };

    await writeManifestV2(testDir, manifest);
    await fs.writeFile(path.join(testDir, filePath), 'changed');

    const result = await clean({ projectRoot: testDir, force: true });

    expect(result.success).toBe(true);
    expect(result.deleted).toContain(filePath);
    expect(await fsUtils.fileExists(path.join(testDir, filePath))).toBe(false);
  });

  it('should not delete files in dry run mode', async () => {
    const filePath = 'file.txt';
    const manifest: ManifestV2 = {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      files: [{ path: filePath, hash: hashContent('content') }],
      directories: [],
    };

    await writeManifestV2(testDir, manifest);
    await fs.writeFile(path.join(testDir, filePath), 'content');

    const result = await clean({ projectRoot: testDir, dryRun: true });

    expect(result.success).toBe(true);
    expect(result.deleted).toHaveLength(0);
    expect(await fsUtils.fileExists(path.join(testDir, filePath))).toBe(true);
  });

  it('should continue on delete errors', async () => {
    const filePath = 'file.txt';
    const manifest: ManifestV2 = {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      files: [{ path: filePath, hash: hashContent('content') }],
      directories: [],
    };

    await writeManifestV2(testDir, manifest);
    await fs.writeFile(path.join(testDir, filePath), 'content');

    const deleteSpy = vi.spyOn(fsUtils, 'deleteFile').mockResolvedValueOnce(err(new Error('nope')));

    const result = await clean({ projectRoot: testDir });

    deleteSpy.mockRestore();

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(await fsUtils.fileExists(path.join(testDir, filePath))).toBe(true);
  });
});

async function writeManifestV2(projectRoot: string, manifest: ManifestV2): Promise<void> {
  const manifestPath = path.join(projectRoot, MANIFEST_FILENAME);
  const content = JSON.stringify(manifest, null, 2);
  await fs.writeFile(manifestPath, content);
}

function hashContent(content: string): string {
  const hash = createHash('sha256').update(content).digest('hex');
  return `sha256:${hash}`;
}

