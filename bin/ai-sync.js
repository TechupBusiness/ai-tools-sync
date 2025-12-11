#!/usr/bin/env node

/**
 * ai-sync CLI entry point
 *
 * This file serves as the executable entry point for the ai-sync command.
 * It imports and runs the CLI from the compiled TypeScript output.
 */

import('../dist/cli/index.js')
  .then((module) => {
    if (typeof module.run === 'function') {
      module.run();
    } else if (typeof module.default === 'function') {
      module.default();
    } else {
      console.error('Failed to start ai-sync: CLI module loaded but no entry point found');
      console.error('');
      console.error('Expected module.run or module.default to be a function.');
      console.error('This may indicate a corrupted build. Try running:');
      console.error('  npm run build');
      console.error('');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Failed to start ai-sync:', error.message);
    console.error('');
    console.error('If you are developing locally, make sure to run:');
    console.error('  npm run build');
    console.error('');
    process.exit(1);
  });

