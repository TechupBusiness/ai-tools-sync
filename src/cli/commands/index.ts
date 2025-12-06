/**
 * @file CLI Commands Index
 * @description Export all CLI commands
 */

export { sync } from './sync.js';
export type { SyncOptions, SyncResult } from './sync.js';

export { init } from './init.js';
export type { InitOptions, InitResult } from './init.js';

export { validate } from './validate.js';
export type { ValidateOptions, ValidateResult } from './validate.js';

export { migrate, discover } from './migrate.js';
export type { MigrateOptions, MigrateResult, DiscoveryResult, DiscoveredFile } from './migrate.js';

