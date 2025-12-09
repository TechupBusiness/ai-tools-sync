import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { fileExists } from '../../../src/utils/fs.js';
import {
  filenameToTimestamp,
  getLatestSnapshot,
  listHistory,
  pruneHistory,
  saveHistorySnapshot,
  timestampToFilename,
} from '../../../src/utils/manifest.js';

import type { ManifestV2 } from '../../../src/utils/manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESTS_TMP_DIR = path.resolve(__dirname, '..', '..', '.tmp');

describe('Manifest History', () => {
  let testDir: string;
  let configDir: string;
  let historyDir: string;

  beforeEach(async () => {
    testDir = path.join(
      TESTS_TMP_DIR,
      `manifest-history-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    configDir = path.join(testDir, '.ai-tool-sync');
    historyDir = path.join(configDir, 'history');
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('should convert timestamp to safe filename and back', () => {
    const timestamp = new Date('2024-01-15T10:30:00.000Z');
    const filename = timestampToFilename(timestamp);
    expect(filename).toBe('2024-01-15T10-30-00.000Z.json');

    const parsed = filenameToTimestamp(filename);
    expect(parsed?.toISOString()).toBe(timestamp.toISOString());
  });

  it('should save snapshot and create history directory', async () => {
    const manifest: ManifestV2 = {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      files: [{ path: 'test.md', hash: 'sha256:abc123' }],
      directories: [],
    };

    const saveResult = await saveHistorySnapshot(testDir, manifest, { configDir });
    expect(saveResult.ok).toBe(true);

    const exists = await fileExists(historyDir);
    expect(exists).toBe(true);
  });

  it('should skip saving when maxHistory is 0', async () => {
    const manifest: ManifestV2 = {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      files: [],
      directories: [],
    };

    const saveResult = await saveHistorySnapshot(testDir, manifest, {
      configDir,
      maxHistory: 0,
    });
    expect(saveResult.ok).toBe(true);

    const exists = await fileExists(historyDir);
    expect(exists).toBe(false);
  });

  it('should list history entries sorted by timestamp', async () => {
    await fs.mkdir(historyDir, { recursive: true });

    const older = path.join(historyDir, timestampToFilename(new Date('2024-01-01T00:00:00.000Z')));
    const newer = path.join(historyDir, timestampToFilename(new Date('2024-02-01T00:00:00.000Z')));

    await fs.writeFile(
      older,
      JSON.stringify({
        version: '2.0.0',
        files: [],
        directories: [],
        timestamp: new Date().toISOString(),
      })
    );
    await fs.writeFile(
      newer,
      JSON.stringify({
        version: '2.0.0',
        files: [],
        directories: [],
        timestamp: new Date().toISOString(),
      })
    );
    await fs.writeFile(path.join(historyDir, 'invalid.txt'), 'ignore');

    const listResult = await listHistory(historyDir);
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value).toHaveLength(2);
      expect(listResult.value[0].filename).toBe(path.basename(newer));
      expect(listResult.value[1].filename).toBe(path.basename(older));
    }
  });

  it('should prune old history entries', async () => {
    await fs.mkdir(historyDir, { recursive: true });

    const entryPaths = [
      timestampToFilename(new Date('2024-01-01T00:00:00.000Z')),
      timestampToFilename(new Date('2024-02-01T00:00:00.000Z')),
      timestampToFilename(new Date('2024-03-01T00:00:00.000Z')),
    ];

    for (const filename of entryPaths) {
      const fullPath = path.join(historyDir, filename);
      await fs.writeFile(
        fullPath,
        JSON.stringify({
          version: '2.0.0',
          files: [],
          directories: [],
          timestamp: new Date().toISOString(),
        })
      );
    }

    const pruneResult = await pruneHistory(historyDir, 2);
    expect(pruneResult.ok).toBe(true);
    if (pruneResult.ok) {
      expect(pruneResult.value).toHaveLength(1);
    }

    const remaining = await listHistory(historyDir);
    expect(remaining.ok).toBe(true);
    if (remaining.ok) {
      expect(remaining.value).toHaveLength(2);
      expect(remaining.value[0].filename).toBe(entryPaths[2]);
    }
  });

  it('should return most recent snapshot', async () => {
    await fs.mkdir(historyDir, { recursive: true });

    const oldManifest: ManifestV2 = {
      version: '2.0.0',
      timestamp: new Date('2024-01-01T00:00:00.000Z').toISOString(),
      files: [{ path: 'old.txt', hash: 'sha256:old' }],
      directories: [],
    };

    const newManifest: ManifestV2 = {
      version: '2.0.0',
      timestamp: new Date('2024-02-01T00:00:00.000Z').toISOString(),
      files: [{ path: 'new.txt', hash: 'sha256:new' }],
      directories: [],
    };

    await fs.writeFile(
      path.join(historyDir, timestampToFilename(new Date('2024-01-01T00:00:00.000Z'))),
      JSON.stringify(oldManifest, null, 2)
    );
    await fs.writeFile(
      path.join(historyDir, timestampToFilename(new Date('2024-02-01T00:00:00.000Z'))),
      JSON.stringify(newManifest, null, 2)
    );

    const latestResult = await getLatestSnapshot(historyDir);
    expect(latestResult.ok).toBe(true);
    if (latestResult.ok) {
      expect(latestResult.value?.files[0]?.path).toBe('new.txt');
    }
  });
});
