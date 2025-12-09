import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { deleteFile, ensureDir, fileExists, readFile, writeFile } from './fs.js';
import { logger } from './logger.js';
import { err, ok, tryCatchAsync, type Result } from './result.js';

import type { ManifestV2 } from './manifest.js';

const DEFAULT_HISTORY_DIR = '.ai-tool-sync';
const HISTORY_SUBDIR = 'history';
const DEFAULT_MAX_HISTORY = 10;

export interface HistoryOptions {
  /** Configuration directory (default: '.ai-tool-sync') */
  configDir?: string;
  /** Maximum history entries to retain (default: 10) */
  maxHistory?: number;
}

export interface HistoryEntry {
  /** Filename (e.g., '2024-01-15T10-30-00-000Z.json') */
  filename: string;
  /** Parsed timestamp */
  timestamp: Date;
  /** Full path to snapshot file */
  path: string;
}

function resolveHistoryDir(projectRoot: string, configDir?: string): string {
  const baseDir = configDir ?? DEFAULT_HISTORY_DIR;
  const resolvedBase = path.isAbsolute(baseDir) ? baseDir : path.join(projectRoot, baseDir);
  return path.join(resolvedBase, HISTORY_SUBDIR);
}

export function timestampToFilename(timestamp: Date): string {
  return timestamp.toISOString().replace(/:/g, '-') + '.json';
}

export function filenameToTimestamp(filename: string): Date | null {
  if (!filename.endsWith('.json')) {
    return null;
  }

  const base = filename.slice(0, -'.json'.length);
  const tIndex = base.indexOf('T');
  if (tIndex === -1) {
    return null;
  }

  const datePart = base.slice(0, tIndex);
  const timePart = base.slice(tIndex + 1).replace(/-/g, ':');
  const isoString = `${datePart}T${timePart}`;
  const parsed = new Date(isoString);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export async function saveHistorySnapshot(
  projectRoot: string,
  manifest: ManifestV2,
  options?: HistoryOptions
): Promise<Result<string>> {
  const maxHistory = options?.maxHistory ?? DEFAULT_MAX_HISTORY;

  if (maxHistory === 0) {
    logger.debug('History snapshot skipped because maxHistory is 0');
    return ok('');
  }

  const historyDir = resolveHistoryDir(projectRoot, options?.configDir);
  const ensureResult = await ensureDir(historyDir);
  if (!ensureResult.ok) {
    return err(ensureResult.error);
  }

  const filename = timestampToFilename(new Date());
  const filePath = path.join(historyDir, filename);
  const content = JSON.stringify(manifest, null, 2) + '\n';

  const writeResult = await writeFile(filePath, content);
  if (!writeResult.ok) {
    return err(writeResult.error);
  }

  const pruneResult = await pruneHistory(historyDir, maxHistory);
  if (!pruneResult.ok) {
    logger.warn(
      `Failed to prune history after saving snapshot: ${
        pruneResult.error instanceof Error ? pruneResult.error.message : String(pruneResult.error)
      }`
    );
  }

  return ok(filename);
}

export async function listHistory(historyDir: string): Promise<Result<HistoryEntry[]>> {
  if (!(await fileExists(historyDir))) {
    return ok([]);
  }

  const entriesResult = await tryCatchAsync(async () => {
    const dirents = await fs.readdir(historyDir, { withFileTypes: true });
    const entries: HistoryEntry[] = [];

    for (const dirent of dirents) {
      if (!dirent.isFile() || !dirent.name.endsWith('.json')) {
        continue;
      }

      const timestamp = filenameToTimestamp(dirent.name);
      if (!timestamp) {
        logger.debug(`Skipping invalid history filename: ${dirent.name}`);
        continue;
      }

      entries.push({
        filename: dirent.name,
        timestamp,
        path: path.join(historyDir, dirent.name),
      });
    }

    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return entries;
  });

  if (!entriesResult.ok) {
    return err(
      entriesResult.error instanceof Error
        ? entriesResult.error
        : new Error(String(entriesResult.error))
    );
  }

  return ok(entriesResult.value);
}

export async function pruneHistory(
  historyDir: string,
  maxHistory: number
): Promise<Result<string[]>> {
  const entriesResult = await listHistory(historyDir);
  if (!entriesResult.ok) {
    return entriesResult;
  }

  const entries = entriesResult.value;
  if (entries.length <= maxHistory) {
    return ok([]);
  }

  const toDelete = entries.slice(maxHistory);
  const deleted: string[] = [];

  for (const entry of toDelete) {
    const result = await deleteFile(entry.path);
    if (result.ok) {
      deleted.push(entry.filename);
    }
  }

  return ok(deleted);
}

export async function getLatestSnapshot(historyDir: string): Promise<Result<ManifestV2 | null>> {
  const entriesResult = await listHistory(historyDir);
  if (!entriesResult.ok) {
    return err(entriesResult.error);
  }

  const latest = entriesResult.value[0];
  if (!latest) {
    return ok(null);
  }

  const contentResult = await readFile(latest.path);
  if (!contentResult.ok) {
    return err(contentResult.error);
  }

  const parseResult = tryParseManifest(contentResult.value);
  if (!parseResult.ok) {
    return err(parseResult.error);
  }

  return ok(parseResult.value);
}

function tryParseManifest(content: string): Result<ManifestV2> {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (isManifestV2Shape(parsed)) {
      return ok(parsed);
    }
    return err(new Error('Invalid manifest format'));
  } catch (e) {
    return err(
      new Error(`Failed to parse manifest: ${e instanceof Error ? e.message : String(e)}`)
    );
  }
}

function isManifestV2Shape(value: unknown): value is ManifestV2 {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const manifest = value as Partial<ManifestV2>;
  return (
    typeof manifest.version === 'string' &&
    typeof manifest.timestamp === 'string' &&
    Array.isArray(manifest.files) &&
    manifest.files.every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof (entry as { path?: unknown }).path === 'string' &&
        typeof (entry as { hash?: unknown }).hash === 'string'
    ) &&
    Array.isArray(manifest.directories) &&
    manifest.directories.every((dir) => typeof dir === 'string')
  );
}
