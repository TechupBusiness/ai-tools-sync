/**
 * @file Git Loader Tests
 * @description Tests for loading content from Git repositories
 */

import { execSync, exec } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  GitLoader,
  createGitLoader,
  parseGitSource,
  isGitAvailable,
  clearGitCache,
  listCachedRepos,
  GIT_PREFIXES,
  DEFAULT_GIT_CACHE_DIR,
  DEFAULT_GIT_CACHE_TTL_MS,
  DEFAULT_CLONE_DEPTH,
  DEFAULT_GIT_TIMEOUT_MS,
  type GitLoaderOptions,
} from '../../../src/loaders/git.js';
import { generatePluginId, DEFAULT_PLUGIN_CACHE_DIR } from '../../../src/utils/plugin-cache.js';

// Mock child_process
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual('node:child_process');
  return {
    ...actual,
    execSync: vi.fn(),
    exec: vi.fn((cmd, opts, callback) => {
      if (callback) {
        callback(null, { stdout: '', stderr: '' });
      }
    }),
  };
});

// Sample content for creating mock repos
const SAMPLE_RULE = `---
name: git-rule
description: Rule from git repo
version: 1.0.0
globs:
  - "**/*.ts"
targets:
  - cursor
  - claude
---

# Git Rule

A rule loaded from a git repository.
`;

const SAMPLE_PERSONA = `---
name: git-expert
description: Expert persona from git
version: 1.0.0
tools:
  - read
  - write
model: default
---

# Git Expert

An expert persona from a git repository.
`;

const getRepoPath = (baseDir: string, source: string) =>
  path.join(baseDir, DEFAULT_PLUGIN_CACHE_DIR, generatePluginId(source));

describe('GitLoader', () => {
  let loader: GitLoader;
  let tempDir: string;

  beforeEach(() => {
    loader = new GitLoader();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-loader-test-'));
    vi.clearAllMocks();

    // Default mock for git version check
    (execSync as ReturnType<typeof vi.fn>).mockReturnValue('git version 2.40.0');
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('canLoad()', () => {
    it('should return true for github: prefix', () => {
      expect(loader.canLoad('github:user/repo')).toBe(true);
      expect(loader.canLoad('github:org/repo#v1.0.0')).toBe(true);
      expect(loader.canLoad('github:user/repo/subpath')).toBe(true);
    });

    it('should return true for gitlab: prefix', () => {
      expect(loader.canLoad('gitlab:user/repo')).toBe(true);
      expect(loader.canLoad('gitlab:org/repo#main')).toBe(true);
    });

    it('should return true for bitbucket: prefix', () => {
      expect(loader.canLoad('bitbucket:user/repo')).toBe(true);
      expect(loader.canLoad('bitbucket:org/repo#develop')).toBe(true);
    });

    it('should return true for git: prefix', () => {
      expect(loader.canLoad('git:github.com/user/repo')).toBe(true);
      expect(loader.canLoad('git:gitlab.com/user/repo#v1.0.0')).toBe(true);
      expect(loader.canLoad('git:https://github.com/user/repo.git')).toBe(true);
    });

    it('should return true for SSH git URLs', () => {
      expect(loader.canLoad('git@github.com:user/repo.git')).toBe(true);
      expect(loader.canLoad('git@gitlab.com:org/repo.git')).toBe(true);
    });

    it('should return true for HTTPS .git URLs', () => {
      expect(loader.canLoad('https://github.com/user/repo.git')).toBe(true);
      expect(loader.canLoad('https://gitlab.com/org/repo.git#v1.0.0')).toBe(true);
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

    it('should return false for HTTP URLs without .git', () => {
      expect(loader.canLoad('https://example.com/rules')).toBe(false);
      expect(loader.canLoad('http://example.com/path')).toBe(false);
    });

    it('should return false for url: prefix', () => {
      expect(loader.canLoad('url:https://example.com')).toBe(false);
    });
  });

  describe('parseSource()', () => {
    describe('github: shorthand', () => {
      it('should parse simple github:user/repo', () => {
        const parsed = loader.parseSource('github:user/repo');

        expect(parsed).not.toBeNull();
        expect(parsed!.host).toBe('github.com');
        expect(parsed!.owner).toBe('user');
        expect(parsed!.repo).toBe('repo');
        expect(parsed!.ref).toBeUndefined();
        expect(parsed!.subpath).toBeUndefined();
        expect(parsed!.cloneUrl).toBe('https://github.com/user/repo.git');
        expect(parsed!.useSsh).toBe(false);
      });

      it('should parse github:user/repo with ref', () => {
        const parsed = loader.parseSource('github:user/repo#v1.0.0');

        expect(parsed).not.toBeNull();
        expect(parsed!.ref).toBe('v1.0.0');
        expect(parsed!.owner).toBe('user');
        expect(parsed!.repo).toBe('repo');
      });

      it('should parse github:user/repo with branch ref', () => {
        const parsed = loader.parseSource('github:user/repo#main');

        expect(parsed).not.toBeNull();
        expect(parsed!.ref).toBe('main');
      });

      it('should parse github:user/repo with subpath', () => {
        const parsed = loader.parseSource('github:user/repo/path/to/rules');

        expect(parsed).not.toBeNull();
        expect(parsed!.owner).toBe('user');
        expect(parsed!.repo).toBe('repo');
        expect(parsed!.subpath).toBe('path/to/rules');
      });

      it('should parse github:user/repo with subpath and ref', () => {
        const parsed = loader.parseSource('github:user/repo/rules#v2.0.0');

        expect(parsed).not.toBeNull();
        expect(parsed!.owner).toBe('user');
        expect(parsed!.repo).toBe('repo');
        expect(parsed!.subpath).toBe('rules');
        expect(parsed!.ref).toBe('v2.0.0');
      });

      it('should use SSH URL when useSsh is true', () => {
        const parsed = loader.parseSource('github:user/repo', true);

        expect(parsed).not.toBeNull();
        expect(parsed!.cloneUrl).toBe('git@github.com:user/repo.git');
        expect(parsed!.useSsh).toBe(true);
      });
    });

    describe('gitlab: shorthand', () => {
      it('should parse simple gitlab:user/repo', () => {
        const parsed = loader.parseSource('gitlab:user/repo');

        expect(parsed).not.toBeNull();
        expect(parsed!.host).toBe('gitlab.com');
        expect(parsed!.owner).toBe('user');
        expect(parsed!.repo).toBe('repo');
        expect(parsed!.cloneUrl).toBe('https://gitlab.com/user/repo.git');
      });

      it('should parse gitlab:user/repo with ref', () => {
        const parsed = loader.parseSource('gitlab:org/project#develop');

        expect(parsed).not.toBeNull();
        expect(parsed!.ref).toBe('develop');
      });
    });

    describe('bitbucket: shorthand', () => {
      it('should parse simple bitbucket:user/repo', () => {
        const parsed = loader.parseSource('bitbucket:user/repo');

        expect(parsed).not.toBeNull();
        expect(parsed!.host).toBe('bitbucket.org');
        expect(parsed!.owner).toBe('user');
        expect(parsed!.repo).toBe('repo');
        expect(parsed!.cloneUrl).toBe('https://bitbucket.org/user/repo.git');
      });
    });

    describe('git: prefix', () => {
      it('should parse git:host/user/repo format', () => {
        const parsed = loader.parseSource('git:github.com/user/repo');

        expect(parsed).not.toBeNull();
        expect(parsed!.host).toBe('github.com');
        expect(parsed!.owner).toBe('user');
        expect(parsed!.repo).toBe('repo');
        expect(parsed!.cloneUrl).toBe('https://github.com/user/repo.git');
      });

      it('should parse git:host/user/repo with ref', () => {
        const parsed = loader.parseSource('git:gitlab.com/user/repo#v1.0.0');

        expect(parsed).not.toBeNull();
        expect(parsed!.host).toBe('gitlab.com');
        expect(parsed!.ref).toBe('v1.0.0');
      });

      it('should parse git:https:// URLs', () => {
        const parsed = loader.parseSource('git:https://github.com/user/repo.git');

        expect(parsed).not.toBeNull();
        expect(parsed!.host).toBe('github.com');
        expect(parsed!.owner).toBe('user');
        expect(parsed!.repo).toBe('repo');
      });

      it('should handle custom git hosts', () => {
        const parsed = loader.parseSource('git:git.company.com/team/project');

        expect(parsed).not.toBeNull();
        expect(parsed!.host).toBe('git.company.com');
        expect(parsed!.owner).toBe('team');
        expect(parsed!.repo).toBe('project');
        expect(parsed!.cloneUrl).toBe('https://git.company.com/team/project.git');
      });
    });

    describe('SSH URLs', () => {
      it('should parse SSH git URLs', () => {
        const parsed = loader.parseSource('git@github.com:user/repo.git');

        expect(parsed).not.toBeNull();
        expect(parsed!.host).toBe('github.com');
        expect(parsed!.owner).toBe('user');
        expect(parsed!.repo).toBe('repo');
        expect(parsed!.cloneUrl).toBe('git@github.com:user/repo.git');
        expect(parsed!.useSsh).toBe(true);
      });

      it('should parse SSH URLs with ref', () => {
        const parsed = loader.parseSource('git@github.com:user/repo.git#v1.0.0');

        expect(parsed).not.toBeNull();
        expect(parsed!.ref).toBe('v1.0.0');
      });

      it('should handle SSH URLs without .git extension', () => {
        const parsed = loader.parseSource('git@github.com:user/repo');

        expect(parsed).not.toBeNull();
        expect(parsed!.cloneUrl).toBe('git@github.com:user/repo.git');
      });
    });

    describe('HTTPS URLs', () => {
      it('should parse HTTPS .git URLs', () => {
        const parsed = loader.parseSource('https://github.com/user/repo.git');

        expect(parsed).not.toBeNull();
        expect(parsed!.host).toBe('github.com');
        expect(parsed!.owner).toBe('user');
        expect(parsed!.repo).toBe('repo');
        expect(parsed!.useSsh).toBe(false);
      });

      it('should parse HTTPS URLs with ref', () => {
        const parsed = loader.parseSource('https://github.com/user/repo.git#main');

        expect(parsed).not.toBeNull();
        expect(parsed!.ref).toBe('main');
      });

      it('should parse HTTPS URLs without subpath (subpath not typical for .git URLs)', () => {
        const parsed = loader.parseSource('https://github.com/user/repo.git');

        expect(parsed).not.toBeNull();
        expect(parsed!.owner).toBe('user');
        expect(parsed!.repo).toBe('repo');
        expect(parsed!.subpath).toBeUndefined();
      });
    });

    describe('invalid sources', () => {
      it('should return null for invalid shorthand', () => {
        expect(loader.parseSource('github:invalid')).toBeNull();
        expect(loader.parseSource('github:')).toBeNull();
      });

      it('should return null for invalid git: prefix', () => {
        expect(loader.parseSource('git:invalid')).toBeNull();
        expect(loader.parseSource('git:host/user')).toBeNull();
      });

      it('should return null for non-git sources', () => {
        expect(loader.parseSource('./local/path')).toBeNull();
        expect(loader.parseSource('npm:package')).toBeNull();
      });
    });
  });

  describe('load()', () => {
    it('should return error for invalid source', async () => {
      const result = await loader.load('invalid-source');

      expect(result.rules.length).toBe(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toBe('Invalid Git source format');
    });

    it('should set source in result', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockImplementation((_cmd, _opts, callback) => {
        if (typeof callback === 'function') {
          callback(new Error('Git not available'), { stdout: '', stderr: '' });
        }
        return {} as ReturnType<typeof exec>;
      });

      const result = await loader.load('github:user/repo', {
        cacheDir: tempDir,
      });

      expect(result.source).toBe('github:user/repo');
    });
  });

  describe('caching', () => {
    let mockRepoPath: string;

    beforeEach(() => {
      // Create a mock repo structure
      mockRepoPath = getRepoPath(tempDir, 'github:user/repo');
      const rulesDir = path.join(mockRepoPath, 'rules');
      const personasDir = path.join(mockRepoPath, 'personas');

      fs.mkdirSync(rulesDir, { recursive: true });
      fs.mkdirSync(personasDir, { recursive: true });
      fs.mkdirSync(path.join(mockRepoPath, '.git'), { recursive: true });

      // Write sample content
      fs.writeFileSync(path.join(rulesDir, 'test.md'), SAMPLE_RULE);
      fs.writeFileSync(path.join(personasDir, 'expert.md'), SAMPLE_PERSONA);

      // Write cache metadata
      const metadata = {
        source: 'github:user/repo',
        cloneUrl: 'https://github.com/user/repo.git',
        lastFetched: Date.now(),
        commitSha: 'abc123',
      };
      fs.writeFileSync(
        path.join(mockRepoPath, '.ai-tool-sync-metadata.json'),
        JSON.stringify(metadata)
      );
    });

    it('should use cached repo when valid', async () => {
      const result = await loader.load('github:user/repo', {
        cacheDir: tempDir,
        useCache: true,
        cacheTtl: DEFAULT_GIT_CACHE_TTL_MS,
      });

      expect(result.rules.length).toBe(1);
      expect(result.rules[0].frontmatter.name).toBe('git-rule');
      expect(result.personas.length).toBe(1);
      expect(result.personas[0].frontmatter.name).toBe('git-expert');
    });

    it('should list cached repos', () => {
      const repos = listCachedRepos(tempDir);

      expect(repos.length).toBe(1);
      expect(repos[0].source).toBe('github:user/repo');
      expect(repos[0].commitSha).toBe('abc123');
    });

    it('should clear specific repo cache', () => {
      clearGitCache(tempDir, 'github:user/repo');

      expect(fs.existsSync(mockRepoPath)).toBe(false);
    });

    it('should clear all git cache', () => {
      clearGitCache(tempDir);

      expect(fs.existsSync(path.join(tempDir, DEFAULT_PLUGIN_CACHE_DIR))).toBe(false);
    });

    it('should refetch when cache TTL is expired', async () => {
      const metadataPath = path.join(mockRepoPath, '.ai-tool-sync-metadata.json');
      const expiredMetadata = {
        source: 'github:user/repo',
        cloneUrl: 'https://github.com/user/repo.git',
        lastFetched: Date.now() - DEFAULT_GIT_CACHE_TTL_MS - 1000,
        commitSha: 'stale123',
      };
      fs.writeFileSync(metadataPath, JSON.stringify(expiredMetadata));

      const mockExec = vi.mocked(exec);
      mockExec.mockClear();

      await loader.load('github:user/repo', {
        cacheDir: tempDir,
        useCache: true,
        cacheTtl: DEFAULT_GIT_CACHE_TTL_MS,
      });

      expect(mockExec).toHaveBeenCalled();
    });

    it('should refetch when forceRefresh is true even with valid cache', async () => {
      const mockExec = vi.mocked(exec);
      mockExec.mockClear();

      await loader.load('github:user/repo', {
        cacheDir: tempDir,
        useCache: true,
        cacheTtl: DEFAULT_GIT_CACHE_TTL_MS,
        forceRefresh: true,
      });

      expect(mockExec).toHaveBeenCalled();
    });
  });
});

describe('createGitLoader()', () => {
  it('should create a new GitLoader instance', () => {
    const loader = createGitLoader();
    expect(loader).toBeInstanceOf(GitLoader);
    expect(loader.name).toBe('git');
  });
});

describe('isGitAvailable()', () => {
  it('should return true when git is available', () => {
    (execSync as ReturnType<typeof vi.fn>).mockReturnValue('git version 2.40.0');

    expect(isGitAvailable()).toBe(true);
  });

  it('should return false when git is not available', () => {
    (execSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Command not found');
    });

    expect(isGitAvailable()).toBe(false);
  });
});

describe('parseGitSource()', () => {
  it('should parse github shorthand', () => {
    const parsed = parseGitSource('github:user/repo');

    expect(parsed).not.toBeNull();
    expect(parsed!.host).toBe('github.com');
  });

  it('should use SSH when specified', () => {
    const parsed = parseGitSource('github:user/repo', true);

    expect(parsed).not.toBeNull();
    expect(parsed!.useSsh).toBe(true);
    expect(parsed!.cloneUrl).toContain('git@');
  });
});

describe('GIT_PREFIXES constant', () => {
  it('should contain all supported prefixes', () => {
    expect(GIT_PREFIXES).toContain('git:');
    expect(GIT_PREFIXES).toContain('github:');
    expect(GIT_PREFIXES).toContain('gitlab:');
    expect(GIT_PREFIXES).toContain('bitbucket:');
  });
});

describe('DEFAULT constants', () => {
  it('should have correct default cache directory', () => {
    expect(DEFAULT_GIT_CACHE_DIR).toBe('.ai-tool-sync');
  });

  it('should have correct default cache TTL (24 hours)', () => {
    expect(DEFAULT_GIT_CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('should have correct default clone depth', () => {
    expect(DEFAULT_CLONE_DEPTH).toBe(1);
  });

  it('should have correct default git timeout (5 minutes)', () => {
    expect(DEFAULT_GIT_TIMEOUT_MS).toBe(5 * 60 * 1000);
  });
});

describe('integration with LocalLoader', () => {
  let loader: GitLoader;
  let tempDir: string;

  beforeEach(() => {
    loader = new GitLoader();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-local-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should load content with subpath', async () => {
    // Create mock cached repo with subpath structure
    const source = 'github:user/repo/packages/rules';
    const repoPath = getRepoPath(tempDir, source);
    const subpathDir = path.join(repoPath, 'packages', 'rules');
    const rulesDir = path.join(subpathDir, 'rules');

    fs.mkdirSync(rulesDir, { recursive: true });
    fs.mkdirSync(path.join(repoPath, '.git'), { recursive: true });
    fs.writeFileSync(path.join(rulesDir, 'test.md'), SAMPLE_RULE);

    // Write cache metadata
    fs.writeFileSync(
      path.join(repoPath, '.ai-tool-sync-metadata.json'),
      JSON.stringify({
        source,
        cloneUrl: 'https://github.com/user/repo.git',
        lastFetched: Date.now(),
      })
    );

    const result = await loader.load(source, {
      cacheDir: tempDir,
      useCache: true,
    });

    expect(result.rules.length).toBe(1);
    expect(result.rules[0].frontmatter.name).toBe('git-rule');
  });

  it('should return error for non-existent subpath', async () => {
    // Create mock cached repo without the subpath
    const source = 'github:user/repo/nonexistent/path';
    const repoPath = getRepoPath(tempDir, source);

    fs.mkdirSync(path.join(repoPath, '.git'), { recursive: true });
    fs.mkdirSync(path.join(repoPath, 'rules'), { recursive: true });

    // Write cache metadata
    fs.writeFileSync(
      path.join(repoPath, '.ai-tool-sync-metadata.json'),
      JSON.stringify({
        source,
        cloneUrl: 'https://github.com/user/repo.git',
        lastFetched: Date.now(),
      })
    );

    const result = await loader.load(source, {
      cacheDir: tempDir,
      useCache: true,
    });

    expect(result.errors).toBeDefined();
    expect(result.errors![0].message).toContain('Subpath does not exist');
  });
});

describe('ref handling', () => {
  it('should create separate cache paths for different refs', () => {
    const loader = new GitLoader();

    const parsed1 = loader.parseSource('github:user/repo');
    const parsed2 = loader.parseSource('github:user/repo#v1.0.0');
    const parsed3 = loader.parseSource('github:user/repo#main');

    // All should have same base info
    expect(parsed1!.owner).toBe(parsed2!.owner);
    expect(parsed1!.repo).toBe(parsed2!.repo);

    // But different refs
    expect(parsed1!.ref).toBeUndefined();
    expect(parsed2!.ref).toBe('v1.0.0');
    expect(parsed3!.ref).toBe('main');
  });
});

describe('authentication', () => {
  it('should accept token option for HTTPS', async () => {
    const loader = new GitLoader();

    // This is mainly to ensure the option is accepted
    // Actual authentication testing would require integration tests
    const options: GitLoaderOptions = {
      token: 'ghp_xxxxxxxxxxxx',
      cacheDir: os.tmpdir(),
    };

    // Should not throw when parsing options
    expect(() => loader.load('github:user/private-repo', options)).not.toThrow();
  });
});

