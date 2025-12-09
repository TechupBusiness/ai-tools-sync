/**
 * @file CLI Output Utilities
 * @description Console output formatting, progress indicators, and styling
 *
 * Provides a consistent output experience for CLI commands with:
 * - Progress spinners and steps
 * - Formatted tables and lists
 * - Error formatting
 * - Summary statistics
 */

/* eslint-disable no-console */

import pc from 'picocolors';

/**
 * Progress step status
 */
export type StepStatus = 'pending' | 'running' | 'success' | 'warning' | 'error' | 'skipped';

/**
 * Get status icon for a step
 */
function getStatusIcon(status: StepStatus): string {
  switch (status) {
    case 'pending':
      return pc.dim('○');
    case 'running':
      return pc.cyan('◐');
    case 'success':
      return pc.green('✓');
    case 'warning':
      return pc.yellow('⚠');
    case 'error':
      return pc.red('✗');
    case 'skipped':
      return pc.dim('⊘');
  }
}

/**
 * Format a step message with status
 */
export function formatStep(
  step: number,
  total: number,
  message: string,
  status: StepStatus = 'running'
): string {
  const icon = getStatusIcon(status);
  const stepNum = pc.dim(`[${step}/${total}]`);
  return `${icon} ${stepNum} ${message}`;
}

/**
 * Print a section header
 */
export function printHeader(title: string): void {
  console.log('');
  console.log(pc.bold(pc.cyan(`━━━ ${title} ━━━`)));
  console.log('');
}

/**
 * Print a sub-section header
 */
export function printSubHeader(title: string): void {
  console.log('');
  console.log(pc.bold(title));
}

/**
 * Print an info message
 */
export function printInfo(message: string): void {
  console.log(message);
}

/**
 * Print a success message
 */
export function printSuccess(message: string): void {
  console.log(pc.green(`✓ ${message}`));
}

/**
 * Print a warning message
 */
export function printWarning(message: string): void {
  console.log(pc.yellow(`⚠ ${message}`));
}

/**
 * Print an error message
 */
export function printError(message: string): void {
  console.error(pc.red(`✗ ${message}`));
}

/**
 * Print a list item
 */
export function printListItem(message: string, indent: number = 0): void {
  const padding = '  '.repeat(indent);
  console.log(`${padding}${pc.dim('•')} ${message}`);
}

/**
 * Print a key-value pair
 */
export function printKeyValue(key: string, value: string | number | boolean): void {
  console.log(`  ${pc.dim(key + ':')} ${value}`);
}

/**
 * Print a blank line
 */
export function printNewLine(): void {
  console.log('');
}

/**
 * Statistics display interface
 */
export interface Stats {
  rules?: number;
  personas?: number;
  commands?: number;
  hooks?: number;
  files?: number;
  deleted?: number;
  warnings?: number;
  errors?: number;
}

/**
 * Print statistics summary
 */
export function printStats(label: string, stats: Stats): void {
  const parts: string[] = [];

  if (stats.rules !== undefined && stats.rules > 0) {
    parts.push(`${stats.rules} rule${stats.rules !== 1 ? 's' : ''}`);
  }
  if (stats.personas !== undefined && stats.personas > 0) {
    parts.push(`${stats.personas} persona${stats.personas !== 1 ? 's' : ''}`);
  }
  if (stats.commands !== undefined && stats.commands > 0) {
    parts.push(`${stats.commands} command${stats.commands !== 1 ? 's' : ''}`);
  }
  if (stats.hooks !== undefined && stats.hooks > 0) {
    parts.push(`${stats.hooks} hook${stats.hooks !== 1 ? 's' : ''}`);
  }
  if (stats.files !== undefined && stats.files > 0) {
    parts.push(`${stats.files} file${stats.files !== 1 ? 's' : ''}`);
  }

  if (parts.length > 0) {
    console.log(`  ${pc.dim(label + ':')} ${parts.join(', ')}`);
  }

  // Show warnings/errors in different colors
  if (stats.warnings !== undefined && stats.warnings > 0) {
    console.log(`  ${pc.yellow(`⚠ ${stats.warnings} warning${stats.warnings !== 1 ? 's' : ''}`)}`);
  }
  if (stats.errors !== undefined && stats.errors > 0) {
    console.log(`  ${pc.red(`✗ ${stats.errors} error${stats.errors !== 1 ? 's' : ''}`)}`);
  }
}

/**
 * Format duration in human readable form
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Print command completion summary
 */
export function printSummary(options: {
  success: boolean;
  message: string;
  duration?: number | undefined;
  dryRun?: boolean | undefined;
}): void {
  printNewLine();

  if (options.dryRun) {
    console.log(pc.cyan('─'.repeat(50)));
    console.log(pc.cyan('Dry run complete - no files were written'));
  } else {
    console.log(pc.dim('─'.repeat(50)));
  }

  if (options.success) {
    printSuccess(options.message);
  } else {
    printError(options.message);
  }

  if (options.duration !== undefined) {
    console.log(pc.dim(`  Completed in ${formatDuration(options.duration)}`));
  }

  printNewLine();
}

/**
 * Print a file path in a readable format
 */
export function formatPath(filePath: string, highlight: boolean = false): string {
  if (highlight) {
    return pc.cyan(filePath);
  }
  return pc.dim(filePath);
}

/**
 * Print generated file info
 */
export function printGeneratedFile(
  path: string,
  type: 'created' | 'updated' | 'deleted' | 'skipped'
): void {
  const icons: Record<typeof type, string> = {
    created: pc.green('+'),
    updated: pc.yellow('~'),
    deleted: pc.red('-'),
    skipped: pc.dim('○'),
  };
  console.log(`  ${icons[type]} ${formatPath(path)}`);
}

/**
 * Print a table of data
 */
export function printTable(headers: string[], rows: string[][]): void {
  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxRowWidth = Math.max(0, ...rows.map((r) => (r[i] ?? '').length));
    return Math.max(h.length, maxRowWidth);
  });

  // Print header
  const headerRow = headers.map((h, i) => h.padEnd(widths[i] ?? 0)).join('  ');
  console.log(`  ${pc.bold(headerRow)}`);
  console.log(`  ${widths.map((w) => '─'.repeat(w)).join('  ')}`);

  // Print rows
  for (const row of rows) {
    const rowStr = row.map((cell, i) => (cell ?? '').padEnd(widths[i] ?? 0)).join('  ');
    console.log(`  ${rowStr}`);
  }
}

/**
 * Format error for display
 */
export function formatError(error: Error | string): string {
  const message = error instanceof Error ? error.message : error;
  return pc.red(message);
}

/**
 * Print validation errors
 */
export function printValidationErrors(errors: Array<{ path: string; message: string }>): void {
  for (const error of errors) {
    console.log(`  ${pc.red('•')} ${pc.dim(error.path + ':')} ${error.message}`);
  }
}

/**
 * Print a box around content
 */
export function printBox(title: string, content: string[]): void {
  const maxWidth = Math.max(title.length, ...content.map((c) => c.length));
  const border = '─'.repeat(maxWidth + 2);

  console.log(`┌${border}┐`);
  console.log(`│ ${pc.bold(title.padEnd(maxWidth))} │`);
  console.log(`├${border}┤`);
  for (const line of content) {
    console.log(`│ ${line.padEnd(maxWidth)} │`);
  }
  console.log(`└${border}┘`);
}

/**
 * Spinner class for showing progress
 */
export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private current = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    this.interval = setInterval(() => {
      process.stdout.write(`\r${pc.cyan(this.frames[this.current])} ${this.message}`);
      this.current = (this.current + 1) % this.frames.length;
    }, 80);
  }

  stop(finalMessage?: string, success: boolean = true): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    const icon = success ? pc.green('✓') : pc.red('✗');
    const msg = finalMessage ?? this.message;
    process.stdout.write(`\r${icon} ${msg}\n`);
  }

  update(message: string): void {
    this.message = message;
  }
}

/**
 * Create a spinner instance
 */
export function createSpinner(message: string): Spinner {
  return new Spinner(message);
}
