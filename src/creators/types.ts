import type { Command } from '@/parsers/command.js';
import type { Hook } from '@/parsers/hook.js';
import type { Persona } from '@/parsers/persona.js';
import type { Rule } from '@/parsers/rule.js';
import type { Result } from '@/utils/result.js';

import { BaseError } from '@/utils/errors.js';

export type GenericKind = 'rule' | 'persona' | 'command' | 'hook';
export type Priority = 'low' | 'medium' | 'high';

export interface GenerateOptions {
  kind: GenericKind;
  name: string;
  description?: string;
  targets?: string[];
  globs?: string[];
  tools?: string[];
  model?: string;
  execute?: string;
  priority?: Priority;
  template?: string;
  body?: string;
  overwrite?: boolean;
  dryRun?: boolean;
  runLint?: boolean;
  projectRoot?: string;
  configDir?: string;
}

export interface GeneratedFile {
  kind: GenericKind;
  path: string;
  frontmatter: Rule | Persona | Command | Hook;
  body: string;
  warnings: string[];
}

export interface GenerateIssue {
  level: 'error' | 'warning';
  field?: string;
  message: string;
  suggestion?: string;
}

export type GenerateResult = Result<GeneratedFile, GenerateError>;

export class GenerateError extends BaseError {
  constructor(
    message: string,
    readonly issues?: GenerateIssue[]
  ) {
    super(message);
  }
}
