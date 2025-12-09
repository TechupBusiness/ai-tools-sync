import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { status } from '../../../src/cli/commands/status.js';
import { MANIFEST_FILENAME, type ManifestV2 } from '../../../src/utils/manifest.js';

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

describe('Status Command', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `ai-sync-status-${Date.now()}-${Math.random().toString(36).slice(2)}`
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
    const result = await status({ projectRoot: testDir });

    expect(result.success).toBe(true);
    expect(result.totalFiles).toBe(0);
  });

  it('should report correct counts for v2 manifest', async () => {
    const unchangedPath = 'unchanged.md';
    const modifiedPath = 'modified.md';
    const missingPath = 'missing.md';

    const manifest: ManifestV2 = {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      files: [
        { path: unchangedPath, hash: hashContent('same') },
        { path: modifiedPath, hash: hashContent('original') },
        { path: missingPath, hash: hashContent('missing') },
      ],
      directories: [],
    };

    await writeManifest(testDir, manifest);

    await fs.writeFile(path.join(testDir, unchangedPath), 'same');
    await fs.writeFile(path.join(testDir, modifiedPath), 'changed');

    const result = await status({ projectRoot: testDir });

    expect(result.success).toBe(true);
    expect(result.totalFiles).toBe(3);
    expect(result.unchangedFiles).toBe(1);
    expect(result.modifiedFiles).toBe(1);
    expect(result.missingFiles).toBe(1);
  });

  it('should return file details in verbose mode', async () => {
    const manifest: ManifestV2 = {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      files: [{ path: 'file.txt', hash: hashContent('content') }],
      directories: [],
    };

    await writeManifest(testDir, manifest);
    await fs.writeFile(path.join(testDir, 'file.txt'), 'content');

    const result = await status({ projectRoot: testDir, verbose: true });

    expect(result.success).toBe(true);
    expect(result.files).toBeDefined();
    expect(result.files?.length).toBe(1);
    expect(result.files?.[0]).toEqual({ path: 'file.txt', status: 'unchanged' });
  });
});

async function writeManifest(projectRoot: string, manifest: ManifestV2): Promise<void> {
  const manifestPath = path.join(projectRoot, MANIFEST_FILENAME);
  const content = JSON.stringify(manifest, null, 2);
  await fs.writeFile(manifestPath, content);
}

function hashContent(content: string): string {
  const hash = createHash('sha256').update(content).digest('hex');
  return `sha256:${hash}`;
}
