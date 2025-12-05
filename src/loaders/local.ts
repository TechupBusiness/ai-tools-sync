/**
 * @file Local Loader
 * @description Load content from local directories
 *
 * This is a stub file - full implementation in Phase 5
 */

import { type Loader, type LoaderOptions, type LoadResult, emptyLoadResult } from './base.js';

/**
 * Loader for local file system directories
 */
export class LocalLoader implements Loader {
  readonly name = 'local';

  canLoad(source: string): boolean {
    // Local loader handles relative and absolute paths
    return !source.includes(':') || source.startsWith('/') || source.startsWith('./');
  }

  async load(_source: string, _options?: LoaderOptions): Promise<LoadResult> {
    // Stub implementation
    return emptyLoadResult();
  }
}

