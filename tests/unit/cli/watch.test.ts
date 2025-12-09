import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { watch } from '../../../src/cli/commands/watch.js';
import { DEFAULT_CONFIG_DIR } from '../../../src/config/loader.js';
import { debounce } from '../../../src/utils/debounce.js';

import type { FSWatcher } from 'node:fs';

const { watchSpy } = vi.hoisted(() => ({ watchSpy: vi.fn() }));
let changeHandler: ((event: string, filename: string | Buffer | undefined | null) => void) | null =
  null;
let closeSpy = vi.fn();

vi.mock('node:fs', async () => {
  return {
    watch: watchSpy,
  };
});

const { syncMock } = vi.hoisted(() => ({ syncMock: vi.fn() }));
vi.mock('../../../src/cli/commands/sync.js', () => ({
  sync: syncMock,
}));

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

vi.mock('../../../src/cli/output.js', async () => {
  const actual = await vi.importActual('../../../src/cli/output.js');
  return {
    ...actual,
    printHeader: vi.fn(),
    printInfo: vi.fn(),
    printSuccess: vi.fn(),
    printWarning: vi.fn(),
    printError: vi.fn(),
    printSummary: vi.fn(),
  };
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESTS_TMP_DIR = path.resolve(__dirname, '..', '..', '.tmp');

describe('debounce utility', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls function after delay', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid calls into single execution', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();

    await vi.runAllTimersAsync();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel prevents pending execution', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced.cancel();

    await vi.runAllTimersAsync();
    expect(fn).not.toHaveBeenCalled();
  });

  it('flush triggers immediate execution', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced.flush();

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('Watch Command', () => {
  let testDir: string;

  beforeEach(async () => {
    changeHandler = null;
    closeSpy = vi.fn();
    watchSpy.mockImplementation((_path, _options, listener) => {
      changeHandler = listener as typeof changeHandler;
      const watcher = {
        close: closeSpy,
        on: vi.fn(() => watcher),
      } as unknown as FSWatcher;
      return watcher;
    });

    syncMock.mockReset();
    syncMock.mockResolvedValue({
      success: true,
      filesGenerated: 1,
      filesDeleted: 0,
      warnings: [],
      errors: [],
      duration: 10,
    });

    testDir = path.join(
      TESTS_TMP_DIR,
      `watch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fsp.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    vi.useRealTimers();
    watchSpy.mockReset();
    try {
      await fsp.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('fails if config directory does not exist', async () => {
    const result = await watch({ projectRoot: testDir });

    expect(result.success).toBe(false);
    expect(result.syncCount).toBe(0);
    expect(watchSpy).not.toHaveBeenCalled();
  });

  it('runs initial sync before starting watch', async () => {
    await fsp.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR), { recursive: true });

    const promise = watch({ projectRoot: testDir, debounceMs: 10 });
    await promise.ready;

    expect(syncMock).toHaveBeenCalledTimes(1);

    promise.stop();
    const result = await promise;

    expect(result.syncCount).toBe(1);
    expect(result.successfulSyncs).toBe(1);
  });

  it('detects file changes and triggers debounced sync', async () => {
    await fsp.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR), { recursive: true });

    const promise = watch({ projectRoot: testDir, debounceMs: 20 });
    await promise.ready;
    expect(changeHandler).toBeTruthy();

    await changeHandler?.('change', 'rules/core.md');
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(syncMock).toHaveBeenCalledTimes(2); // initial + debounced change

    promise.stop();
    const result = await promise;
    expect(result.syncCount).toBe(2);
  });

  it('debounces rapid successive changes', async () => {
    await fsp.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR), { recursive: true });

    const promise = watch({ projectRoot: testDir, debounceMs: 20 });
    await promise.ready;

    await changeHandler?.('change', 'rules/core.md');
    await changeHandler?.('change', 'rules/core.md');

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(syncMock).toHaveBeenCalledTimes(2); // initial + single debounced sync

    promise.stop();
    const result = await promise;
    expect(result.syncCount).toBe(2);
    expect(result.failedSyncs).toBe(0);
  });

  it('continues watching after sync failure', async () => {
    await fsp.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR), { recursive: true });

    syncMock
      .mockResolvedValueOnce({
        success: true,
        filesGenerated: 1,
        filesDeleted: 0,
        warnings: [],
        errors: [],
        duration: 10,
      })
      .mockResolvedValueOnce({
        success: false,
        filesGenerated: 0,
        filesDeleted: 0,
        warnings: [],
        errors: ['failed'],
        duration: 5,
      })
      .mockResolvedValueOnce({
        success: true,
        filesGenerated: 1,
        filesDeleted: 0,
        warnings: [],
        errors: [],
        duration: 8,
      });

    const promise = watch({ projectRoot: testDir, debounceMs: 10 });
    await promise.ready;

    await changeHandler?.('change', 'rules/core.md');
    await new Promise((resolve) => setTimeout(resolve, 15));

    await changeHandler?.('change', 'rules/other.md');
    await new Promise((resolve) => setTimeout(resolve, 15));

    promise.stop();
    const result = await promise;

    expect(syncMock).toHaveBeenCalledTimes(3);
    expect(result.syncCount).toBe(3);
    expect(result.failedSyncs).toBe(1);
    expect(result.success).toBe(false);
  });

  it('exits with error if config directory is removed while watching', async () => {
    vi.useFakeTimers();
    await fsp.mkdir(path.join(testDir, DEFAULT_CONFIG_DIR), { recursive: true });

    const promise = watch({ projectRoot: testDir, debounceMs: 10 });
    await promise.ready;

    await fsp.rm(path.join(testDir, DEFAULT_CONFIG_DIR), { recursive: true, force: true });
    changeHandler?.('change', 'rules/core.md');
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.exitReason).toBe('error');
    expect(closeSpy).toHaveBeenCalled();
  });
});
