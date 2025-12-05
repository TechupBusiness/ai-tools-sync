/**
 * @file URL Loader Tests
 * @description Tests for loading content from remote URLs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  UrlLoader,
  createUrlLoader,
  clearUrlCache,
  getUrlCacheEntries,
  isValidUrl,
  URL_PREFIX,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_CACHE_TTL_MS,
} from '../../../src/loaders/url.js';

// Mock the global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Sample content for mocking
const SAMPLE_RULE = `---
name: typescript-url
description: TypeScript rules from URL
version: 1.0.0
globs:
  - "**/*.ts"
  - "**/*.tsx"
targets:
  - cursor
  - claude
---

# TypeScript URL Rule

Follow TypeScript best practices loaded from URL.
`;

const SAMPLE_PERSONA = `---
name: url-expert
description: Expert persona from URL
version: 1.0.0
tools:
  - read
  - search
model: default
---

# URL Expert

An expert persona loaded from a remote URL.
`;

const SAMPLE_COMMAND = `---
name: remote-deploy
description: Deploy command from URL
version: 1.0.0
execute: ./deploy.sh
args:
  - name: environment
    type: string
    default: staging
---

# Remote Deploy

Deploy command fetched from URL.
`;

const SAMPLE_HOOK = `---
name: url-pre-commit
description: Pre-commit hook from URL
version: 1.0.0
event: PreToolUse
tool_match: "Bash(git commit*)"
targets:
  - claude
---

# URL Pre-commit Hook

Check things before committing.
`;

const SAMPLE_INDEX = JSON.stringify({
  rules: ['typescript.md'],
  personas: ['expert.md'],
  commands: ['deploy.md'],
  hooks: ['pre-commit.md'],
});

/**
 * Create a mock Response object
 */
function createMockResponse(
  body: string,
  options: { status?: number; statusText?: string; headers?: Record<string, string> } = {}
): Response {
  const { status = 200, statusText = 'OK', headers = {} } = options;

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: vi.fn().mockResolvedValue(body),
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as Response;
}

describe('UrlLoader', () => {
  let loader: UrlLoader;
  let tempCacheDir: string;

  beforeEach(() => {
    loader = new UrlLoader();
    clearUrlCache();
    mockFetch.mockReset();
    tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'url-loader-test-'));
  });

  afterEach(() => {
    clearUrlCache();
    // Clean up temp directory
    try {
      fs.rmSync(tempCacheDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('canLoad()', () => {
    it('should return true for url: prefixed URLs', () => {
      expect(loader.canLoad('url:https://example.com/rules.md')).toBe(true);
      expect(loader.canLoad('url:http://localhost:3000/rules/')).toBe(true);
    });

    it('should return true for direct HTTP/HTTPS URLs', () => {
      expect(loader.canLoad('https://example.com/rules.md')).toBe(true);
      expect(loader.canLoad('http://example.com/rules/')).toBe(true);
      expect(loader.canLoad('https://raw.githubusercontent.com/user/repo/main/rules.md')).toBe(true);
    });

    it('should return false for local paths', () => {
      expect(loader.canLoad('./local/path')).toBe(false);
      expect(loader.canLoad('../relative/path')).toBe(false);
      expect(loader.canLoad('/absolute/path')).toBe(false);
    });

    it('should return false for npm/pip prefixes', () => {
      expect(loader.canLoad('npm:package')).toBe(false);
      expect(loader.canLoad('pip:package')).toBe(false);
    });

    it('should return false for file:// URLs', () => {
      expect(loader.canLoad('file:///path/to/file')).toBe(false);
    });

    it('should return false for invalid URLs', () => {
      expect(loader.canLoad('not-a-url')).toBe(false);
      expect(loader.canLoad('ftp://example.com')).toBe(false);
    });
  });

  describe('load() - single file', () => {
    it('should load a rule from URL', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));

      const result = await loader.load('https://example.com/rules/typescript.md');

      expect(result.rules.length).toBe(1);
      expect(result.rules[0].frontmatter.name).toBe('typescript-url');
      expect(result.rules[0].frontmatter.globs).toEqual(['**/*.ts', '**/*.tsx']);
      expect(result.errors).toBeUndefined();
      expect(result.source).toBe('https://example.com/rules/typescript.md');
    });

    it('should load a persona from URL', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_PERSONA));

      const result = await loader.load('https://example.com/personas/expert.md');

      expect(result.personas.length).toBe(1);
      expect(result.personas[0].frontmatter.name).toBe('url-expert');
      expect(result.personas[0].frontmatter.tools).toEqual(['read', 'search']);
      expect(result.errors).toBeUndefined();
    });

    it('should load a command from URL', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_COMMAND));

      const result = await loader.load('https://example.com/commands/deploy.md');

      expect(result.commands.length).toBe(1);
      expect(result.commands[0].frontmatter.name).toBe('remote-deploy');
      expect(result.commands[0].frontmatter.execute).toBe('./deploy.sh');
      expect(result.errors).toBeUndefined();
    });

    it('should load a hook from URL', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_HOOK));

      const result = await loader.load('https://example.com/hooks/pre-commit.md');

      expect(result.hooks.length).toBe(1);
      expect(result.hooks[0].frontmatter.name).toBe('url-pre-commit');
      expect(result.hooks[0].frontmatter.event).toBe('PreToolUse');
      expect(result.errors).toBeUndefined();
    });

    it('should work with url: prefix', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));

      const result = await loader.load('url:https://example.com/rules/typescript.md');

      expect(result.rules.length).toBe(1);
      expect(result.errors).toBeUndefined();
    });

    it('should detect content type from URL path', async () => {
      // Rule path
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));
      let result = await loader.load('https://example.com/rules/test.md');
      expect(result.rules.length).toBe(1);

      // Persona path (agents alias)
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_PERSONA));
      result = await loader.load('https://example.com/agents/test.md');
      expect(result.personas.length).toBe(1);

      // Command path
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_COMMAND));
      result = await loader.load('https://example.com/commands/test.md');
      expect(result.commands.length).toBe(1);

      // Hook path
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_HOOK));
      result = await loader.load('https://example.com/hooks/test.md');
      expect(result.hooks.length).toBe(1);
    });
  });

  describe('load() - directory with index', () => {
    it('should load content from index.json', async () => {
      // First call: index.json
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_INDEX));
      // Subsequent calls: individual files
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_PERSONA));
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_COMMAND));
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_HOOK));

      const result = await loader.load('https://example.com/ai-rules/');

      expect(result.rules.length).toBe(1);
      expect(result.personas.length).toBe(1);
      expect(result.commands.length).toBe(1);
      expect(result.hooks.length).toBe(1);
      expect(result.errors).toBeUndefined();
    });

    it('should handle partial index (only rules)', async () => {
      const partialIndex = JSON.stringify({ rules: ['typescript.md'] });
      mockFetch.mockResolvedValueOnce(createMockResponse(partialIndex));
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));

      const result = await loader.load('https://example.com/ai-rules/');

      expect(result.rules.length).toBe(1);
      expect(result.personas.length).toBe(0);
      expect(result.commands.length).toBe(0);
      expect(result.hooks.length).toBe(0);
    });
  });

  describe('load() - error handling', () => {
    it('should return error for invalid URL format', async () => {
      const result = await loader.load('url:not-a-valid-url');

      expect(result.rules.length).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBe(1);
      expect(result.errors![0].message).toBe('Invalid URL format');
    });

    it('should return error for HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse('', { status: 500, statusText: 'Internal Server Error' })
      );

      const result = await loader.load('https://example.com/rules/test.md');

      expect(result.rules.length).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('HTTP 500');
    });

    it('should return error for 403 Forbidden', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse('', { status: 403, statusText: 'Forbidden' })
      );

      const result = await loader.load('https://example.com/rules/test.md');

      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('HTTP 403');
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await loader.load('https://example.com/rules/test.md');

      expect(result.rules.length).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('Network error');
    });

    it('should handle timeout errors', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await loader.load('https://example.com/rules/test.md', {
        timeout: 1000,
      });

      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('timeout');
    });

    it('should not return error for 404 on optional files', async () => {
      // When loading directory, 404 on index.json should not be an error
      mockFetch.mockResolvedValueOnce(
        createMockResponse('', { status: 404, statusText: 'Not Found' })
      );
      // Try subdirectory indexes
      mockFetch.mockResolvedValueOnce(
        createMockResponse('', { status: 404, statusText: 'Not Found' })
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse('', { status: 404, statusText: 'Not Found' })
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse('', { status: 404, statusText: 'Not Found' })
      );
      mockFetch.mockResolvedValueOnce(
        createMockResponse('', { status: 404, statusText: 'Not Found' })
      );

      const result = await loader.load('https://example.com/ai-rules/');

      // Should have one error about no content found
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('No content found');
    });

    it('should return parse errors for invalid content', async () => {
      const invalidContent = `---
invalid: yaml: : :
---

Content
`;
      mockFetch.mockResolvedValueOnce(createMockResponse(invalidContent));

      const result = await loader.load('https://example.com/rules/invalid.md');

      expect(result.rules.length).toBe(0);
      expect(result.errors).toBeDefined();
    });
  });

  describe('load() - caching', () => {
    it('should cache fetched content in memory', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));

      // First load
      await loader.load('https://example.com/rules/test.md');

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second load should use cache
      const result = await loader.load('https://example.com/rules/test.md');

      expect(mockFetch).toHaveBeenCalledTimes(1); // Not called again
      expect(result.rules.length).toBe(1);
    });

    it('should cache fetched content to file when cacheDir is provided', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));

      await loader.load('https://example.com/rules/test.md', {
        cacheDir: tempCacheDir,
      });

      // Check that cache file was created
      const files = fs.readdirSync(tempCacheDir);
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/\.cache$/);
    });

    it('should use cached file on subsequent loads', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));

      // First load
      await loader.load('https://example.com/rules/test.md', {
        cacheDir: tempCacheDir,
      });

      // Clear memory cache to test file cache
      clearUrlCache();

      // Second load should use file cache
      const result = await loader.load('https://example.com/rules/test.md', {
        cacheDir: tempCacheDir,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.rules.length).toBe(1);
    });

    it('should not cache when useCache is false', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));

      // First load
      await loader.load('https://example.com/rules/test.md', { useCache: false });

      // Second load
      await loader.load('https://example.com/rules/test.md', { useCache: false });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not cache when cacheTtl is 0', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));

      await loader.load('https://example.com/rules/test.md', { cacheTtl: 0 });
      await loader.load('https://example.com/rules/test.md', { cacheTtl: 0 });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should clear cache with clearUrlCache()', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));

      await loader.load('https://example.com/rules/test.md');

      expect(getUrlCacheEntries().size).toBeGreaterThan(0);

      clearUrlCache();

      expect(getUrlCacheEntries().size).toBe(0);
    });

    it('should handle ETag/If-None-Match caching', async () => {
      // First request returns content with ETag
      mockFetch.mockResolvedValueOnce(
        createMockResponse(SAMPLE_RULE, {
          headers: { etag: '"abc123"' },
        })
      );

      await loader.load('https://example.com/rules/test.md');

      // Clear memory cache to force conditional request
      const cache = getUrlCacheEntries();
      const entry = cache.get('https://example.com/rules/test.md');
      expect(entry?.etag).toBe('"abc123"');
    });

    it('should handle 304 Not Modified responses', async () => {
      // First request
      mockFetch.mockResolvedValueOnce(
        createMockResponse(SAMPLE_RULE, {
          headers: { etag: '"abc123"' },
        })
      );

      await loader.load('https://example.com/rules/test.md');

      // Manually expire in-memory cache but keep entry for conditional request
      const entry = getUrlCacheEntries().get('https://example.com/rules/test.md');
      if (entry) {
        entry.fetchedAt = 0; // Mark as expired
      }

      // Second request returns 304
      mockFetch.mockResolvedValueOnce(
        createMockResponse('', { status: 304, statusText: 'Not Modified' })
      );

      const result = await loader.load('https://example.com/rules/test.md');

      expect(result.rules.length).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('load() - custom headers', () => {
    it('should send custom headers with request', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));

      await loader.load('https://example.com/rules/test.md', {
        headers: {
          Authorization: 'Bearer token123',
          'X-Custom-Header': 'value',
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token123',
            'X-Custom-Header': 'value',
          }),
        })
      );
    });
  });

  describe('load() - timeout', () => {
    it('should use default timeout', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));

      await loader.load('https://example.com/rules/test.md');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('should use custom timeout from options', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse(SAMPLE_RULE));

      await loader.load('https://example.com/rules/test.md', {
        timeout: 5000,
      });

      // The AbortController is created internally with the timeout
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});

describe('createUrlLoader()', () => {
  it('should create a new UrlLoader instance', () => {
    const loader = createUrlLoader();
    expect(loader).toBeInstanceOf(UrlLoader);
    expect(loader.name).toBe('url');
  });
});

describe('isValidUrl()', () => {
  it('should return true for valid HTTP URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
    expect(isValidUrl('https://example.com/path')).toBe(true);
    expect(isValidUrl('https://example.com/path?query=value')).toBe(true);
  });

  it('should return true for url: prefixed URLs', () => {
    expect(isValidUrl('url:https://example.com')).toBe(true);
    expect(isValidUrl('url:http://localhost:3000')).toBe(true);
  });

  it('should return false for invalid URLs', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('file:///path/to/file')).toBe(false);
  });
});

describe('URL_PREFIX constant', () => {
  it('should be "url:"', () => {
    expect(URL_PREFIX).toBe('url:');
  });
});

describe('DEFAULT_TIMEOUT_MS constant', () => {
  it('should be 30000 (30 seconds)', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30000);
  });
});

describe('DEFAULT_CACHE_TTL_MS constant', () => {
  it('should be 3600000 (1 hour)', () => {
    expect(DEFAULT_CACHE_TTL_MS).toBe(60 * 60 * 1000);
  });
});

