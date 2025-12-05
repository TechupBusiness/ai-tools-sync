import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**/*.test.ts', 'node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/index.ts',
        'src/cli/index.ts',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/config': resolve(__dirname, './src/config'),
      '@/parsers': resolve(__dirname, './src/parsers'),
      '@/loaders': resolve(__dirname, './src/loaders'),
      '@/generators': resolve(__dirname, './src/generators'),
      '@/transformers': resolve(__dirname, './src/transformers'),
      '@/schemas': resolve(__dirname, './src/schemas'),
      '@/utils': resolve(__dirname, './src/utils'),
      '@/cli': resolve(__dirname, './src/cli'),
    },
  },
});

