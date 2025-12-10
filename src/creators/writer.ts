import { GenerateError } from './types.js';

import { fileExists, writeFile } from '@/utils/fs.js';
import { err, ok, type Result } from '@/utils/result.js';

export interface WriteOptions {
  overwrite?: boolean;
  dryRun?: boolean;
}

export interface WriteResult {
  warnings: string[];
}

export async function writeGeneratedFile(
  filePath: string,
  content: string,
  options: WriteOptions = {}
): Promise<Result<WriteResult, GenerateError>> {
  const warnings: string[] = [];
  const exists = await fileExists(filePath);

  if (exists && !options.overwrite) {
    return err(
      new GenerateError('File already exists', [
        {
          level: 'warning',
          field: 'path',
          message: `File exists at ${filePath}`,
          suggestion: 'Re-run with overwrite: true to replace it.',
        },
      ])
    );
  }

  if (exists && options.overwrite) {
    warnings.push(`Overwriting existing file at ${filePath}`);
  }

  if (!options.dryRun) {
    const writeResult = await writeFile(filePath, content);
    if (!writeResult.ok) {
      return err(new GenerateError(writeResult.error.message));
    }
  }

  return ok({ warnings });
}
