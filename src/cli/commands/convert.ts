/**
 * @file Convert Command
 * @description Convert platform-specific files into generic .ai-tool-sync format
 */

import path from 'node:path';

import { discover } from './migrate.js';

import type {
  ConvertOptions as ConverterOptions,
  ConversionIssue,
  GenericConversion,
  PlatformFileInput,
} from '@/converters/types.js';

import { getAiPaths } from '@/config/loader.js';
import { convertPlatformFile } from '@/converters/platform-to-generic.js';
import { toSafeFilename } from '@/generators/base.js';
import { ensureDir, readFile, writeFile, copyFile, toPosixPath } from '@/utils/fs.js';
import { ok } from '@/utils/result.js';
import { serializeYaml } from '@/utils/yaml.js';

export interface ConvertCommandOptions extends ConverterOptions {
  projectRoot?: string;
  configDir?: string;
  dryRun?: boolean;
  file?: string;
}

export interface ConvertCommandResult {
  success: boolean;
  converted: string[];
  skipped: string[];
  warnings: string[];
  errors: string[];
  issues: ConversionIssue[];
}

export async function convert(options: ConvertCommandOptions = {}): Promise<ConvertCommandResult> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const aiPaths = getAiPaths(projectRoot, options.configDir);

  const converted: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const issues: ConversionIssue[] = [];

  const discovery = await discover(projectRoot);
  const files = options.file
    ? discovery.files.filter((file) => path.resolve(file.path) === path.resolve(options.file!))
    : discovery.files;

  const usedPaths = new Set<string>();

  for (const file of files) {
    if (file.platform === 'unknown') {
      const message = `Skipped unknown platform for ${file.relativePath}`;
      warnings.push(message);
      issues.push({ level: 'warning', message, path: file.relativePath });
      skipped.push(file.relativePath);
      continue;
    }

    const contentResult = await readFile(file.path);
    if (!contentResult.ok) {
      const message = `Failed to read ${file.relativePath}: ${contentResult.error.message}`;
      errors.push(message);
      issues.push({ level: 'error', message, path: file.relativePath });
      continue;
    }

    const kind = file.contentType as PlatformFileInput['kind'];

    // Handle mixed files early
    if (kind === 'mixed') {
      const dest = path.join(aiPaths.inputDir, file.relativePath);
      if (!(options.dryRun ?? false)) {
        await ensureDir(path.dirname(dest));
        await copyFile(file.path, dest);
      }
      const message = `Copied mixed file ${file.relativePath} to input/ for manual review`;
      warnings.push(message);
      issues.push({ level: 'warning', message, path: file.relativePath });
      skipped.push(file.relativePath);
      continue;
    }

    const platformInput: PlatformFileInput = {
      platform: file.platform,
      kind,
      sourcePath: file.path,
      relativePath: file.relativePath,
      content: contentResult.value,
    };

    const result = convertPlatformFile(platformInput, options);
    if (!result.ok) {
      const issueMessages = result.error.issues ?? [];
      issues.push(...issueMessages);
      const blocking = issueMessages.find((issue) => issue.level === 'error');
      const summary = blocking?.message ?? result.error.message;
      errors.push(`${file.relativePath}: ${summary}`);

      // Copy mixed/unknown files into input when conversion fails but is recoverable
      const shouldCopy =
        issueMessages.some((issue) => issue.level !== 'error') ||
        file.contentType === 'mixed' ||
        file.contentType === 'unknown';
      if (shouldCopy) {
        const dest = path.join(aiPaths.inputDir, file.relativePath);
        if (!(options.dryRun ?? false)) {
          await ensureDir(path.dirname(dest));
          await copyFile(file.path, dest);
        }
        warnings.push(`Stored ${file.relativePath} in input/ for manual review`);
        skipped.push(file.relativePath);
      }
      continue;
    }

    for (const conversion of result.value) {
      const dest = getDestinationPath(conversion, aiPaths, usedPaths);
      const normalizedRelative = toPosixPath(dest.relativePath);
      usedPaths.add(normalizedRelative);

      if (!(options.dryRun ?? false)) {
        await ensureDir(path.dirname(dest.absolutePath));
        const rendered = renderConversion(conversion);
        if (!rendered.ok) {
          const message = `Failed to render ${normalizedRelative}: ${rendered.error.message}`;
          errors.push(message);
          issues.push({ level: 'error', message, path: normalizedRelative });
          continue;
        }
        const writeResult = await writeFile(dest.absolutePath, rendered.value);
        if (!writeResult.ok) {
          const message = `Failed to write ${normalizedRelative}: ${writeResult.error.message}`;
          errors.push(message);
          issues.push({ level: 'error', message, path: normalizedRelative });
          continue;
        }
      }

      converted.push(normalizedRelative);
      if (conversion.warnings.length > 0) {
        warnings.push(...conversion.warnings.map((warning) => `${normalizedRelative}: ${warning}`));
      }
    }
  }

  const success = errors.length === 0;

  return {
    success,
    converted,
    skipped,
    warnings,
    errors,
    issues,
  };
}

function getDestinationPath(
  conversion: GenericConversion,
  aiPaths: ReturnType<typeof getAiPaths>,
  usedPaths: Set<string>
): { absolutePath: string; relativePath: string } {
  const baseName = toSafeFilename(conversion.frontmatter.name);
  const folder = getTargetFolder(conversion.kind, aiPaths);
  let candidate = `${baseName}.md`;
  let relativePath = toPosixPath(path.join(path.basename(folder), candidate));
  let counter = 1;

  while (usedPaths.has(relativePath)) {
    candidate = `${baseName}-${counter}.md`;
    relativePath = toPosixPath(path.join(path.basename(folder), candidate));
    counter += 1;
  }

  return {
    absolutePath: path.join(folder, candidate),
    relativePath,
  };
}

function getTargetFolder(
  kind: GenericConversion['kind'],
  aiPaths: ReturnType<typeof getAiPaths>
): string {
  switch (kind) {
    case 'rule':
      return aiPaths.rulesDir;
    case 'persona':
      return aiPaths.personasDir;
    case 'command':
      return aiPaths.commandsDir;
    case 'hook':
      return aiPaths.hooksDir;
    default:
      return aiPaths.inputDir;
  }
}

function renderConversion(conversion: GenericConversion) {
  const frontmatter = serializeYaml(conversion.frontmatter, { sortKeys: false });
  if (!frontmatter.ok) {
    return frontmatter;
  }

  const body = conversion.body?.trimStart() ?? '';
  return ok(`---\n${frontmatter.value.trimEnd()}\n---\n\n${body}`);
}
