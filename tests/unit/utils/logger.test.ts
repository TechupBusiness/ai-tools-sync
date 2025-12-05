/**
 * @file Logger Tests
 * @description Tests for the logger utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { logger, LogLevel } from '../../../src/utils/logger.js';

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.configure({ level: LogLevel.DEBUG });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    logger.configure({ level: LogLevel.INFO });
  });

  describe('configure()', () => {
    it('should set log level', () => {
      logger.configure({ level: LogLevel.ERROR });
      expect(logger.getLevel()).toBe(LogLevel.ERROR);
    });
  });

  describe('setVerbose()', () => {
    it('should enable debug logging when verbose is true', () => {
      logger.setVerbose(true);
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should disable debug logging when verbose is false', () => {
      logger.setVerbose(false);
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });
  });

  describe('setSilent()', () => {
    it('should disable all logging when silent is true', () => {
      logger.setSilent(true);
      expect(logger.getLevel()).toBe(LogLevel.SILENT);
    });

    it('should enable logging when silent is false', () => {
      logger.setSilent(true);
      logger.setSilent(false);
      expect(logger.getLevel()).toBe(LogLevel.INFO);
    });
  });

  describe('debug()', () => {
    it('should log at debug level', () => {
      logger.configure({ level: LogLevel.DEBUG });
      logger.debug('test message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should not log when level is higher than DEBUG', () => {
      logger.configure({ level: LogLevel.INFO });
      logger.debug('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('info()', () => {
    it('should log at info level', () => {
      logger.configure({ level: LogLevel.INFO });
      logger.info('test message');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should not log when level is higher than INFO', () => {
      logger.configure({ level: LogLevel.WARN });
      logger.info('test message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('success()', () => {
    it('should log success message', () => {
      logger.success('operation complete');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0];
      expect(call?.[0]).toContain('✓');
    });
  });

  describe('warn()', () => {
    it('should log at warn level', () => {
      logger.warn('warning message');
      expect(consoleWarnSpy).toHaveBeenCalled();
      const call = consoleWarnSpy.mock.calls[0];
      expect(call?.[0]).toContain('⚠');
    });
  });

  describe('error()', () => {
    it('should log at error level', () => {
      logger.error('error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
      const call = consoleErrorSpy.mock.calls[0];
      expect(call?.[0]).toContain('✗');
    });
  });

  describe('step()', () => {
    it('should log step progress', () => {
      logger.step(1, 5, 'Processing...');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0];
      expect(call?.[0]).toContain('[1/5]');
    });
  });

  describe('header()', () => {
    it('should log header with formatting', () => {
      logger.header('Test Header');
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('silent mode', () => {
    it('should not log anything when silent', () => {
      logger.setSilent(true);
      logger.debug('debug');
      logger.info('info');
      logger.success('success');
      logger.warn('warn');
      logger.error('error');
      logger.step(1, 2, 'step');
      logger.header('header');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});

