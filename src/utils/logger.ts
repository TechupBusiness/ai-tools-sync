/**
 * @file Logger Utility
 * @description Logging with levels, colors, and verbose mode support
 */

/* eslint-disable no-console */

import pc from 'picocolors';

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  level: LogLevel;
  prefix?: string;
  timestamps?: boolean;
}

/**
 * Logger class with support for levels, colors, and formatting
 */
class Logger {
  private level: LogLevel = LogLevel.INFO;
  private prefix: string = '';
  private timestamps: boolean = false;

  /**
   * Configure the logger
   */
  configure(options: Partial<LoggerOptions>): void {
    if (options.level !== undefined) {
      this.level = options.level;
    }
    if (options.prefix !== undefined) {
      this.prefix = options.prefix;
    }
    if (options.timestamps !== undefined) {
      this.timestamps = options.timestamps;
    }
  }

  /**
   * Set verbose mode (enables debug logging)
   */
  setVerbose(verbose: boolean): void {
    this.level = verbose ? LogLevel.DEBUG : LogLevel.INFO;
  }

  /**
   * Set silent mode (disables all logging)
   */
  setSilent(silent: boolean): void {
    this.level = silent ? LogLevel.SILENT : LogLevel.INFO;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Format a log message with optional timestamp and prefix
   */
  private format(message: string): string {
    const parts: string[] = [];

    if (this.timestamps) {
      const now = new Date().toISOString();
      parts.push(pc.dim(`[${now}]`));
    }

    if (this.prefix) {
      parts.push(pc.dim(`[${this.prefix}]`));
    }

    parts.push(message);
    return parts.join(' ');
  }

  /**
   * Log a debug message (only shown in verbose mode)
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      const formatted = this.format(pc.dim(`[DEBUG] ${message}`));
      console.log(formatted, ...args);
    }
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      const formatted = this.format(message);
      console.log(formatted, ...args);
    }
  }

  /**
   * Log a success message (green)
   */
  success(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      const formatted = this.format(pc.green(`✓ ${message}`));
      console.log(formatted, ...args);
    }
  }

  /**
   * Log a warning message (yellow)
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      const formatted = this.format(pc.yellow(`⚠ ${message}`));
      console.warn(formatted, ...args);
    }
  }

  /**
   * Log an error message (red)
   */
  error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      const formatted = this.format(pc.red(`✗ ${message}`));
      console.error(formatted, ...args);
    }
  }

  /**
   * Log a step in a process
   */
  step(step: number, total: number, message: string): void {
    if (this.level <= LogLevel.INFO) {
      const stepStr = pc.cyan(`[${step}/${total}]`);
      const formatted = this.format(`${stepStr} ${message}`);
      console.log(formatted);
    }
  }

  /**
   * Log a header/title
   */
  header(message: string): void {
    if (this.level <= LogLevel.INFO) {
      console.log('');
      console.log(pc.bold(pc.cyan(`━━━ ${message} ━━━`)));
      console.log('');
    }
  }

  /**
   * Log a list item
   */
  list(message: string, indent: number = 0): void {
    if (this.level <= LogLevel.INFO) {
      const padding = '  '.repeat(indent);
      console.log(`${padding}${pc.dim('•')} ${message}`);
    }
  }

  /**
   * Log a key-value pair
   */
  keyValue(key: string, value: string | number | boolean): void {
    if (this.level <= LogLevel.INFO) {
      console.log(`  ${pc.dim(key + ':')} ${value}`);
    }
  }

  /**
   * Create a new line
   */
  newLine(): void {
    if (this.level <= LogLevel.INFO) {
      console.log('');
    }
  }
}

/**
 * Singleton logger instance
 */
export const logger = new Logger();

/**
 * Re-export LogLevel for external use
 */
export { LogLevel as Level };

