import * as fs from 'node:fs';
import * as path from 'node:path';

import { resolveConfigDir } from '../../config/loader.js';
import { debounce, type DebouncedFunction } from '../../utils/debounce.js';
import { dirExists } from '../../utils/fs.js';
import {
  printHeader,
  printInfo,
  printSuccess,
  printWarning,
  printError,
  printSummary,
} from '../output.js';

import { sync, type SyncOptions, type SyncResult } from './sync.js';

/**
 * Options for watch mode
 */
export interface WatchOptions {
  /** Enable verbose output */
  verbose?: boolean | undefined;
  /** Dry run mode - don't write files */
  dryRun?: boolean | undefined;
  /** Clean output directories before generating */
  clean?: boolean | undefined;
  /** Project root directory */
  projectRoot?: string | undefined;
  /** Configuration directory name (relative to project root) */
  configDir?: string | undefined;
  /** Update .gitignore with generated paths */
  updateGitignore?: boolean | undefined;
  /** Debounce interval in milliseconds (default: 300) */
  debounceMs?: number | undefined;
}

/**
 * Result of watch command (returned when watch exits)
 */
export interface WatchResult {
  success: boolean;
  /** Total number of sync runs performed */
  syncCount: number;
  /** Number of successful syncs */
  successfulSyncs: number;
  /** Number of failed syncs */
  failedSyncs: number;
  /** Reason for exit (if any) */
  exitReason?: 'signal' | 'error' | 'manual' | undefined;
}

const DEFAULT_DEBOUNCE_MS = 300;

export function watch(
  options: WatchOptions = {}
): Promise<WatchResult> & { stop: () => void; ready: Promise<void> } {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const configDirPromise = resolveConfigDir({ projectRoot, configDir: options.configDir });

  const startPromise = (async () => {
    const configDirName = await configDirPromise;
    const configDir = path.join(projectRoot, configDirName);

    if (!(await dirExists(configDir))) {
      printError(`Configuration directory not found: ${configDir}`);
      return { configDirName, configDir, exists: false };
    }

    printHeader('AI Tool Sync (Watch Mode)');

    const syncOptions: SyncOptions = {
      verbose: options.verbose,
      dryRun: options.dryRun,
      clean: options.clean,
      updateGitignore: options.updateGitignore,
      projectRoot,
      configDir: configDirName,
    };

    return { configDirName, configDir, exists: true, syncOptions };
  })();

  let syncCount = 0;
  let successfulSyncs = 0;
  let failedSyncs = 0;
  let closed = false;
  let watcher: fs.FSWatcher | null = null;
  let debouncedSync: DebouncedFunction<() => void> | null = null;

  const runSync = async (syncOptions: SyncOptions): Promise<SyncResult> => {
    try {
      const result = await sync(syncOptions);
      syncCount += 1;
      if (result.success) {
        successfulSyncs += 1;
      } else {
        failedSyncs += 1;
        printWarning('Sync completed with errors');
      }
      return result;
    } catch (error) {
      syncCount += 1;
      failedSyncs += 1;
      const message = error instanceof Error ? error.message : String(error);
      printError(`Sync failed: ${message}`);
      return {
        success: false,
        filesGenerated: 0,
        filesDeleted: 0,
        warnings: [],
        errors: [message],
        duration: 0,
      };
    }
  };

  let stop: () => void = () => {};

  let readyResolve: () => void = () => {};
  const ready = new Promise<void>((resolveReady) => {
    readyResolve = resolveReady;
  });

  const watchPromise = new Promise<WatchResult>((resolve) => {
    const cleanup = (reason: WatchResult['exitReason']) => {
      if (closed) {
        return;
      }
      closed = true;
      if (debouncedSync) {
        debouncedSync.cancel();
      }
      watcher?.close();
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      const success = failedSyncs === 0 && reason !== 'error';

      printSummary({
        success,
        message: `Watch complete: ${syncCount} sync${syncCount === 1 ? '' : 's'} (${successfulSyncs} successful, ${failedSyncs} failed)`,
      });
      resolve({ success, syncCount, successfulSyncs, failedSyncs, exitReason: reason });
    };

    stop = () => cleanup('manual');

    const onSigint = () => cleanup('signal');
    const onSigterm = () => cleanup('signal');

    const handleChange = async (
      configDir: string,
      eventType: string,
      filename: string | Buffer | undefined | null
    ) => {
      if (closed) {
        return;
      }

      const exists = await dirExists(configDir);
      if (!exists) {
        printError(`Configuration directory was removed: ${configDir}`);
        cleanup('error');
        return;
      }

      const displayName =
        typeof filename === 'string'
          ? filename
          : filename instanceof Buffer
            ? filename.toString()
            : 'unknown file';

      if (options.verbose) {
        printInfo(`Detected ${eventType} in ${displayName}`);
      }
      debouncedSync?.();
    };

    (async () => {
      const config = await startPromise;
      if (!config.exists || !config.syncOptions) {
        readyResolve();
        cleanup('error');
        return;
      }

      const initialResult = await runSync(config.syncOptions);
      if (initialResult.success) {
        printSuccess('Initial sync complete');
      } else {
        printWarning('Initial sync failed - continuing to watch for changes');
      }

      const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
      debouncedSync = debounce(() => {
        if (closed) {
          return;
        }
        void runSync(config.syncOptions);
      }, debounceMs);

      watcher = fs.watch(config.configDir, { recursive: true }, (eventType, filename) => {
        void handleChange(config.configDir, eventType, filename);
      });

      watcher.on('error', (error) => {
        const message = error instanceof Error ? error.message : String(error);
        printError(`Watch error: ${message}`);
        cleanup('error');
      });

      process.on('SIGINT', onSigint);
      process.on('SIGTERM', onSigterm);

      const displayDir =
        path.relative(projectRoot, config.configDir) || path.basename(config.configDir);
      printInfo(`👁 Watching ${displayDir}/ for changes...`);
      printInfo('  Press Ctrl+C to stop');
      readyResolve();
    })().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      printError(`Watch failed: ${message}`);
      cleanup('error');
    });
  });

  return Object.assign(watchPromise, { stop, ready });
}
