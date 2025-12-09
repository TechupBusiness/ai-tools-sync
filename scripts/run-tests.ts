import { spawn } from 'node:child_process';
import path from 'node:path';

interface TestRunnerOptions {
  /** Max old space size in MB applied to the Vitest process */
  maxOldSpaceMb: number;
}

const DEFAULT_MAX_OLD_SPACE_MB = 4096;
const MAX_OLD_SPACE_PATTERN = /(?:^|\s)--max-old-space-size(?:[=\s]\S+)?/;

const buildNodeOptions = (
  existing: string | undefined,
  options: TestRunnerOptions,
): string => {
  const trimmed = existing?.trim();
  if (trimmed && MAX_OLD_SPACE_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const memoryFlag = `--max-old-space-size=${options.maxOldSpaceMb}`;
  return trimmed ? `${trimmed} ${memoryFlag}` : memoryFlag;
};

const runTests = (options: TestRunnerOptions): void => {
  const nodeOptions = buildNodeOptions(process.env.NODE_OPTIONS, options);
  const vitestPath = path.resolve(
    process.cwd(),
    'node_modules',
    'vitest',
    'vitest.mjs',
  );

  const child = spawn(
    process.execPath,
    [vitestPath, 'run', ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_OPTIONS: nodeOptions,
      },
    },
  );

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error('Failed to start Vitest process:', error);
    process.exit(1);
  });
};

runTests({
  maxOldSpaceMb: DEFAULT_MAX_OLD_SPACE_MB,
});
