/**
 * @file CLI Output Tests
 * @description Tests for CLI output utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  formatStep,
  formatDuration,
  formatPath,
  formatError,
  Spinner,
  createSpinner,
} from '../../../src/cli/output.js';

describe('CLI Output Utilities', () => {
  describe('formatStep', () => {
    it('should format step with running status', () => {
      const result = formatStep(1, 3, 'Loading config');
      expect(result).toContain('1/3');
      expect(result).toContain('Loading config');
    });

    it('should include step number in format', () => {
      const result = formatStep(2, 5, 'Processing');
      expect(result).toContain('2/5');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(50)).toBe('50ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(59999)).toBe('60.0s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(150000)).toBe('2m 30s');
    });
  });

  describe('formatPath', () => {
    it('should format path without highlight', () => {
      const result = formatPath('.ai/config.yaml');
      expect(result).toContain('.ai/config.yaml');
    });

    it('should format path with highlight', () => {
      const result = formatPath('.ai/config.yaml', true);
      expect(result).toContain('.ai/config.yaml');
    });
  });

  describe('formatError', () => {
    it('should format error message from string', () => {
      const result = formatError('Something went wrong');
      expect(result).toContain('Something went wrong');
    });

    it('should format error message from Error object', () => {
      const error = new Error('Test error');
      const result = formatError(error);
      expect(result).toContain('Test error');
    });
  });

  describe('Spinner', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should create a spinner with message', () => {
      const spinner = new Spinner('Loading...');
      expect(spinner).toBeDefined();
    });

    it('should update spinner message', () => {
      const spinner = new Spinner('Loading...');
      spinner.update('Still loading...');
      // Message updated internally
      expect(spinner).toBeDefined();
    });

    it('should stop with success', () => {
      const spinner = new Spinner('Loading...');
      spinner.stop('Done!', true);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Done!'));
    });

    it('should stop with failure', () => {
      const spinner = new Spinner('Loading...');
      spinner.stop('Failed!', false);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed!'));
    });

    it('should use default message when stopping without final message', () => {
      const spinner = new Spinner('Loading...');
      spinner.stop();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Loading...'));
    });
  });

  describe('createSpinner', () => {
    it('should create a Spinner instance', () => {
      const spinner = createSpinner('Test');
      expect(spinner).toBeInstanceOf(Spinner);
    });
  });
});

