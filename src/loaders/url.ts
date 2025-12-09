/**
 * @file URL Loader
 * @description Load content from remote URLs
 *
 * Fetches content from remote URLs (HTTP/HTTPS) and loads
 * rules, personas, commands, and hooks from them.
 *
 * Supports:
 * - Single markdown files: url:https://example.com/rules/typescript.md
 * - Directory-style endpoints (JSON index): url:https://example.com/ai-rules/
 * - Caching with configurable TTL
 * - Timeout handling
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseCommand } from '../parsers/command.js';
import { parseHook } from '../parsers/hook.js';
import { parsePersona } from '../parsers/persona.js';
import { parseRule } from '../parsers/rule.js';
import { logger } from '../utils/logger.js';

import {
  type Loader,
  type LoaderOptions,
  type LoadError,
  type LoadResult,
  emptyLoadResultWithSource,
} from './base.js';

/**
 * URL prefix for the loader
 */
export const URL_PREFIX = 'url:';

/**
 * Default timeout in milliseconds (30 seconds)
 */
export const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Default cache TTL in milliseconds (1 hour)
 */
export const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Content types we support
 */
type ContentType = 'rule' | 'persona' | 'command' | 'hook';

/**
 * Index file structure for directory-style endpoints
 */
interface UrlIndexFile {
  rules?: string[];
  personas?: string[];
  commands?: string[];
  hooks?: string[];
}

/**
 * Cache entry for fetched content
 */
interface CacheEntry {
  content: string;
  fetchedAt: number;
  etag?: string | undefined;
  lastModified?: string | undefined;
}

/**
 * Options specific to URL loader
 */
export interface UrlLoaderOptions extends LoaderOptions {
  /**
   * Request timeout in milliseconds (default: 30000)
   */
  timeout?: number;

  /**
   * Cache directory path for persisting fetched content
   * If not provided, caching is only in-memory for the session
   */
  cacheDir?: string;

  /**
   * Cache TTL in milliseconds (default: 1 hour)
   * Set to 0 to disable caching
   */
  cacheTtl?: number;

  /**
   * Whether to use cached content (default: true)
   */
  useCache?: boolean;

  /**
   * Custom headers to send with requests
   */
  headers?: Record<string, string>;

  /**
   * Whether to follow redirects (default: true)
   */
  followRedirects?: boolean;

  /**
   * Maximum number of redirects to follow (default: 5)
   */
  maxRedirects?: number;
}

/**
 * In-memory cache for fetched content
 */
const memoryCache = new Map<string, CacheEntry>();

/**
 * Loader for remote URLs
 */
export class UrlLoader implements Loader {
  readonly name = 'url';

  /**
   * Check if this loader can handle the given source
   * URL loader handles:
   * - Sources starting with 'url:'
   * - HTTP/HTTPS URLs
   */
  canLoad(source: string): boolean {
    // Explicit url: prefix
    if (source.startsWith(URL_PREFIX)) {
      return true;
    }

    // Direct HTTP/HTTPS URLs
    if (source.startsWith('http://') || source.startsWith('https://')) {
      return true;
    }

    return false;
  }

  /**
   * Load content from a URL
   *
   * @param source - URL to load from (url:https://... or https://...)
   * @param options - Loading options
   * @returns LoadResult containing all parsed content
   */
  async load(source: string, options?: UrlLoaderOptions): Promise<LoadResult> {
    const result = emptyLoadResultWithSource(source);
    const errors: LoadError[] = [];

    // Parse the URL
    const url = this.parseUrl(source);

    if (!url) {
      errors.push({
        type: 'file',
        path: source,
        message: 'Invalid URL format',
      });
      result.errors = errors;
      return result;
    }

    logger.debug(`Loading from URL: ${url}`);

    // Determine if this is a single file or directory-style endpoint
    if (this.isSingleFile(url)) {
      // Single file - determine type from path
      const contentType = this.detectContentType(url);
      await this.loadSingleFile(url, contentType, result, errors, options);
    } else {
      // Directory-style - try to fetch index
      await this.loadDirectory(url, result, errors, options);
    }

    if (errors.length > 0) {
      result.errors = errors;
    }

    logger.debug(
      `Loaded from URL: ${result.rules.length} rules, ${result.personas.length} personas, ` +
        `${result.commands.length} commands, ${result.hooks.length} hooks`
    );

    return result;
  }

  /**
   * Parse URL from source string
   */
  private parseUrl(source: string): string | null {
    // Remove url: prefix if present
    const urlString = source.startsWith(URL_PREFIX) ? source.slice(URL_PREFIX.length) : source;

    // Validate URL format
    try {
      const url = new URL(urlString);

      // Only allow http and https protocols
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
      }

      return urlString;
    } catch {
      return null;
    }
  }

  /**
   * Check if URL points to a single file
   */
  private isSingleFile(url: string): boolean {
    const pathname = new URL(url).pathname;
    // Check if path ends with a known file extension
    return (
      pathname.endsWith('.md') ||
      pathname.endsWith('.markdown') ||
      pathname.endsWith('.yaml') ||
      pathname.endsWith('.json')
    );
  }

  /**
   * Detect content type from URL path
   */
  private detectContentType(url: string): ContentType {
    const pathname = new URL(url).pathname.toLowerCase();

    if (pathname.includes('/rules/') || pathname.includes('/rule')) {
      return 'rule';
    }
    if (
      pathname.includes('/personas/') ||
      pathname.includes('/persona') ||
      pathname.includes('/agents/') ||
      pathname.includes('/agent')
    ) {
      return 'persona';
    }
    if (pathname.includes('/commands/') || pathname.includes('/command')) {
      return 'command';
    }
    if (pathname.includes('/hooks/') || pathname.includes('/hook')) {
      return 'hook';
    }

    // Default to rule
    return 'rule';
  }

  /**
   * Load a single file from URL
   */
  private async loadSingleFile(
    url: string,
    contentType: ContentType,
    result: LoadResult,
    errors: LoadError[],
    options?: UrlLoaderOptions
  ): Promise<void> {
    const content = await this.fetchContent(url, errors, options);

    if (!content) {
      return;
    }

    // Parse the content based on type
    this.parseContent(content, url, contentType, result, errors);
  }

  /**
   * Load directory-style content from URL
   */
  private async loadDirectory(
    baseUrl: string,
    result: LoadResult,
    errors: LoadError[],
    options?: UrlLoaderOptions
  ): Promise<void> {
    // Try to fetch index.json first
    const indexUrl = this.appendPath(baseUrl, 'index.json');
    const indexContent = await this.fetchContent(indexUrl, [], options);

    if (indexContent) {
      // Parse index and load files
      try {
        const index = JSON.parse(indexContent) as UrlIndexFile;
        await this.loadFromIndex(baseUrl, index, result, errors, options);
        return;
      } catch {
        // Index is not valid JSON, try alternative approaches
        logger.debug('Index file is not valid JSON, trying alternative approaches');
      }
    }

    // Try loading from known subdirectories
    const contentTypes: Array<{ type: ContentType; dirs: string[] }> = [
      { type: 'rule', dirs: ['rules'] },
      { type: 'persona', dirs: ['personas', 'agents'] },
      { type: 'command', dirs: ['commands'] },
      { type: 'hook', dirs: ['hooks'] },
    ];

    for (const { type, dirs } of contentTypes) {
      for (const dir of dirs) {
        const dirIndexUrl = this.appendPath(baseUrl, `${dir}/index.json`);
        const dirIndex = await this.fetchContent(dirIndexUrl, [], options);

        if (dirIndex) {
          try {
            const files = JSON.parse(dirIndex) as string[];
            for (const file of files) {
              const fileUrl = this.appendPath(baseUrl, `${dir}/${file}`);
              const content = await this.fetchContent(fileUrl, errors, options);
              if (content) {
                this.parseContent(content, fileUrl, type, result, errors);
              }
            }
            break; // Found content in this directory type
          } catch {
            // Not a valid file list
          }
        }
      }
    }

    // If we still haven't loaded anything and there are no errors, add an error
    if (
      result.rules.length === 0 &&
      result.personas.length === 0 &&
      result.commands.length === 0 &&
      result.hooks.length === 0 &&
      errors.length === 0
    ) {
      errors.push({
        type: 'directory',
        path: baseUrl,
        message:
          'No content found at URL. Expected single file (.md) or directory with index.json.',
      });
    }
  }

  /**
   * Load files from an index
   */
  private async loadFromIndex(
    baseUrl: string,
    index: UrlIndexFile,
    result: LoadResult,
    errors: LoadError[],
    options?: UrlLoaderOptions
  ): Promise<void> {
    const loads: Promise<void>[] = [];

    if (index.rules) {
      for (const file of index.rules) {
        const fileUrl = this.appendPath(baseUrl, `rules/${file}`);
        loads.push(
          this.fetchContent(fileUrl, errors, options).then((content) => {
            if (content) this.parseContent(content, fileUrl, 'rule', result, errors);
          })
        );
      }
    }

    if (index.personas) {
      for (const file of index.personas) {
        const fileUrl = this.appendPath(baseUrl, `personas/${file}`);
        loads.push(
          this.fetchContent(fileUrl, errors, options).then((content) => {
            if (content) this.parseContent(content, fileUrl, 'persona', result, errors);
          })
        );
      }
    }

    if (index.commands) {
      for (const file of index.commands) {
        const fileUrl = this.appendPath(baseUrl, `commands/${file}`);
        loads.push(
          this.fetchContent(fileUrl, errors, options).then((content) => {
            if (content) this.parseContent(content, fileUrl, 'command', result, errors);
          })
        );
      }
    }

    if (index.hooks) {
      for (const file of index.hooks) {
        const fileUrl = this.appendPath(baseUrl, `hooks/${file}`);
        loads.push(
          this.fetchContent(fileUrl, errors, options).then((content) => {
            if (content) this.parseContent(content, fileUrl, 'hook', result, errors);
          })
        );
      }
    }

    await Promise.all(loads);
  }

  /**
   * Parse content based on type
   */
  private parseContent(
    content: string,
    filePath: string,
    contentType: ContentType,
    result: LoadResult,
    errors: LoadError[]
  ): void {
    switch (contentType) {
      case 'rule': {
        const parseResult = parseRule(content, filePath);
        if (parseResult.ok) {
          result.rules.push(parseResult.value);
        } else {
          errors.push({
            type: contentType,
            path: filePath,
            message: parseResult.error.message,
            parseError: parseResult.error,
          });
        }
        break;
      }
      case 'persona': {
        const parseResult = parsePersona(content, filePath);
        if (parseResult.ok) {
          result.personas.push(parseResult.value);
        } else {
          errors.push({
            type: contentType,
            path: filePath,
            message: parseResult.error.message,
            parseError: parseResult.error,
          });
        }
        break;
      }
      case 'command': {
        const parseResult = parseCommand(content, filePath);
        if (parseResult.ok) {
          result.commands.push(parseResult.value);
        } else {
          errors.push({
            type: contentType,
            path: filePath,
            message: parseResult.error.message,
            parseError: parseResult.error,
          });
        }
        break;
      }
      case 'hook': {
        const parseResult = parseHook(content, filePath);
        if (parseResult.ok) {
          result.hooks.push(parseResult.value);
        } else {
          errors.push({
            type: contentType,
            path: filePath,
            message: parseResult.error.message,
            parseError: parseResult.error,
          });
        }
        break;
      }
    }
  }

  /**
   * Fetch content from URL with caching support
   */
  private async fetchContent(
    url: string,
    errors: LoadError[],
    options?: UrlLoaderOptions
  ): Promise<string | null> {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
    const cacheTtl = options?.cacheTtl ?? DEFAULT_CACHE_TTL_MS;
    const useCache = options?.useCache !== false;

    // Check cache first
    if (useCache && cacheTtl > 0) {
      const cached = this.getCachedContent(url, cacheTtl, options?.cacheDir);
      if (cached) {
        logger.debug(`Using cached content for: ${url}`);
        return cached;
      }
    }

    // Fetch from network
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const headers: Record<string, string> = {
        Accept: 'text/markdown, text/plain, application/json, */*',
        'User-Agent': 'ai-tool-sync/1.0',
        ...options?.headers,
      };

      // Add conditional headers if we have cached metadata
      const cachedEntry = memoryCache.get(url);
      if (cachedEntry?.etag) {
        headers['If-None-Match'] = cachedEntry.etag;
      }
      if (cachedEntry?.lastModified) {
        headers['If-Modified-Since'] = cachedEntry.lastModified;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
        redirect: options?.followRedirects !== false ? 'follow' : 'manual',
      });

      clearTimeout(timeoutId);

      // Handle 304 Not Modified
      if (response.status === 304 && cachedEntry) {
        logger.debug(`Content not modified (304): ${url}`);
        // Update cache timestamp
        cachedEntry.fetchedAt = Date.now();
        return cachedEntry.content;
      }

      if (!response.ok) {
        if (response.status === 404) {
          // Not found is not necessarily an error (e.g., optional index.json)
          logger.debug(`Not found (404): ${url}`);
          return null;
        }

        errors.push({
          type: 'file',
          path: url,
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
        return null;
      }

      const content = await response.text();

      // Cache the content
      if (useCache && cacheTtl > 0) {
        const etag = response.headers.get('etag');
        const lastModified = response.headers.get('last-modified');
        const metadata: { etag?: string; lastModified?: string } = {};
        if (etag !== null) metadata.etag = etag;
        if (lastModified !== null) metadata.lastModified = lastModified;
        this.cacheContent(url, content, metadata, options?.cacheDir);
      }

      return content;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errors.push({
            type: 'file',
            path: url,
            message: `Request timeout after ${timeout}ms`,
          });
        } else {
          errors.push({
            type: 'file',
            path: url,
            message: `Network error: ${error.message}`,
          });
        }
      } else {
        errors.push({
          type: 'file',
          path: url,
          message: 'Unknown network error',
        });
      }
      return null;
    }
  }

  /**
   * Get cached content if available and not expired
   */
  private getCachedContent(url: string, ttl: number, cacheDir?: string): string | null {
    // Check memory cache first
    const memCached = memoryCache.get(url);
    if (memCached && Date.now() - memCached.fetchedAt < ttl) {
      return memCached.content;
    }

    // Check file cache if directory is provided
    if (cacheDir) {
      const cacheFile = this.getCacheFilePath(url, cacheDir);
      try {
        const stat = fs.statSync(cacheFile);
        if (Date.now() - stat.mtimeMs < ttl) {
          const content = fs.readFileSync(cacheFile, 'utf-8');
          // Also store in memory cache
          memoryCache.set(url, {
            content,
            fetchedAt: stat.mtimeMs,
          });
          return content;
        }
      } catch {
        // Cache file doesn't exist or can't be read
      }
    }

    return null;
  }

  /**
   * Cache content in memory and optionally to file
   */
  private cacheContent(
    url: string,
    content: string,
    metadata: { etag?: string; lastModified?: string },
    cacheDir?: string
  ): void {
    const entry: CacheEntry = {
      content,
      fetchedAt: Date.now(),
    };
    if (metadata.etag) entry.etag = metadata.etag;
    if (metadata.lastModified) entry.lastModified = metadata.lastModified;

    // Store in memory cache
    memoryCache.set(url, entry);

    // Store to file cache if directory is provided
    if (cacheDir) {
      const cacheFile = this.getCacheFilePath(url, cacheDir);
      try {
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        fs.writeFileSync(cacheFile, content, 'utf-8');
      } catch (error) {
        logger.debug(
          `Failed to write cache file: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * Get cache file path for a URL
   */
  private getCacheFilePath(url: string, cacheDir: string): string {
    // Create a hash of the URL for the filename
    const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
    const urlObj = new URL(url);
    const filename = `${urlObj.hostname}_${hash}.cache`;
    return path.join(cacheDir, filename);
  }

  /**
   * Append path to base URL
   */
  private appendPath(baseUrl: string, pathToAppend: string): string {
    const url = new URL(baseUrl);

    // Ensure base path ends with /
    if (!url.pathname.endsWith('/')) {
      url.pathname += '/';
    }

    // Append the path
    url.pathname += pathToAppend;

    return url.href;
  }
}

/**
 * Create a UrlLoader instance
 */
export function createUrlLoader(): UrlLoader {
  return new UrlLoader();
}

/**
 * Clear the URL content cache
 */
export function clearUrlCache(): void {
  memoryCache.clear();
}

/**
 * Get cached entries (for testing/debugging)
 */
export function getUrlCacheEntries(): Map<string, CacheEntry> {
  return new Map(memoryCache);
}

/**
 * Validate URL format
 */
export function isValidUrl(source: string): boolean {
  try {
    const url = new URL(source.startsWith(URL_PREFIX) ? source.slice(URL_PREFIX.length) : source);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
