import { compareVersions as compareSemver } from '../config/defaults.js';

/**
 * Normalize a version string by stripping the leading "v" if present.
 */
export function normalizeVersion(version: string | null | undefined): string | null {
  if (!version) {
    return null;
  }
  return version.replace(/^v/, '');
}

/**
 * Compare two versions with best-effort semver semantics.
 *
 * Falls back to plain string comparison if semver parsing fails.
 */
export function compareVersions(a: string, b: string): number {
  const normalizedA = normalizeVersion(a);
  const normalizedB = normalizeVersion(b);

  if (!normalizedA || !normalizedB) {
    return 0;
  }

  try {
    return compareSemver(normalizedA, normalizedB);
  } catch {
    return normalizedA.localeCompare(normalizedB);
  }
}

/**
 * Sort versions from newest to oldest.
 */
export function sortVersionsDesc(versions: string[]): string[] {
  return [...versions].sort((a, b) =>
    compareVersions(normalizeVersion(b) ?? '', normalizeVersion(a) ?? '')
  );
}
