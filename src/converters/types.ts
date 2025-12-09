/**
 * @file Converter Types
 * @description Shared types for platform-to-generic conversion
 */

import type { Command } from '@/parsers/command.js';
import type { Hook } from '@/parsers/hook.js';
import type { Persona } from '@/parsers/persona.js';
import type { Rule } from '@/parsers/rule.js';
import type { TargetType } from '@/parsers/types.js';
import type { Result } from '@/utils/result.js';

export type Platform = 'cursor' | 'claude' | 'factory';
export type GenericKind = 'rule' | 'persona' | 'command' | 'hook';

export interface PlatformFileInput {
  platform: Platform;
  kind: GenericKind | 'config' | 'mixed' | 'unknown';
  sourcePath: string;
  relativePath: string;
  content: string;
  frontmatter?: Record<string, unknown>;
}

export interface ParsedPlatformFileInput extends PlatformFileInput {
  frontmatter: Record<string, unknown>;
  body: string;
  hasFrontmatter: boolean;
  targets?: TargetType[];
}

export interface ConversionIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
  path?: string;
  line?: number;
  column?: number;
  value?: unknown;
  suggestion?: string;
}

export interface GenericConversion {
  kind: GenericKind;
  frontmatter: Rule | Persona | Command | Hook;
  body: string;
  source: { platform: Platform; path: string };
  warnings: string[];
}

export interface ConvertOptions {
  strict?: boolean;
  includeUnknown?: boolean;
  inferNameFromPath?: boolean;
  runLint?: boolean;
}

export type ConvertResult = Result<GenericConversion[], ConvertError>;

export class ConvertError extends Error {
  constructor(
    message: string,
    readonly issues?: ConversionIssue[]
  ) {
    super(message);
    this.name = 'ConvertError';
  }
}
