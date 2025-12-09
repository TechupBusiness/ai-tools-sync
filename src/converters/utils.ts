/**
 * @file Converter Utilities
 */

import path from 'node:path';

import { toSafeFilename } from '@/generators/base.js';
import { DEFAULT_TARGETS, type TargetType } from '@/parsers/types.js';

export function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return [];
}

export function normalizeGlobs(value: unknown): string[] {
  return normalizeStringArray(value);
}

export function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  return undefined;
}

export function inferNameFromPath(relativePath: string): string {
  const base = path.basename(relativePath);
  const withoutExt = base.replace(path.extname(base), '');
  const slug = toSafeFilename(withoutExt);
  return slug || 'untitled';
}

export function normalizeTargets(targets: unknown): TargetType[] | undefined {
  if (!Array.isArray(targets)) {
    return undefined;
  }

  const valid = targets.filter(
    (target): target is TargetType =>
      typeof target === 'string' &&
      (['cursor', 'claude', 'factory'] as TargetType[]).includes(target as TargetType)
  );

  return valid.length > 0 ? valid : DEFAULT_TARGETS;
}
