import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import 'server-only';
import yauzl from 'yauzl';

function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) reject(err ?? new Error('Failed to open zip'));
      else resolve(zipfile);
    });
  });
}

/** Reject absolute paths, drive letters, and any `..` traversal in zip entry names. */
export function resolveSafeZipPath(tempDir: string, entryName: string): string {
  const trimmed = entryName.replace(/\\/g, '/');
  if (!trimmed || trimmed.startsWith('/') || /^[a-zA-Z]:/.test(trimmed)) {
    throw new Error(`Unsafe zip entry path: ${entryName}`);
  }

  const segments = trimmed.split('/');
  if (segments.some((segment) => segment === '..')) {
    throw new Error(`Zip slip blocked: ${entryName}`);
  }

  const destPath = path.join(tempDir, ...segments);
  const resolvedTemp = path.resolve(tempDir);
  const resolvedDest = path.resolve(destPath);
  const prefix = resolvedTemp.endsWith(path.sep) ? resolvedTemp : resolvedTemp + path.sep;
  if (resolvedDest !== resolvedTemp && !resolvedDest.startsWith(prefix)) {
    throw new Error(`Zip slip blocked: ${entryName}`);
  }
  return destPath;
}

export async function listZipEntryNames(zipFilePath: string): Promise<string[]> {
  const zipfile = await openZip(zipFilePath);
  const names: string[] = [];

  return new Promise((resolve, reject) => {
    zipfile.on('entry', (entry) => {
      names.push(entry.fileName);
      zipfile.readEntry();
    });
    zipfile.on('end', () => resolve(names));
    zipfile.on('error', reject);
    zipfile.readEntry();
  });
}

export async function readZipEntryText(zipFilePath: string, entryName: string): Promise<string | null> {
  const zipfile = await openZip(zipFilePath);

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    zipfile.on('entry', (entry) => {
      if (entry.fileName !== entryName) {
        zipfile.readEntry();
        return;
      }

      zipfile.openReadStream(entry, (err, stream) => {
        if (err || !stream) {
          reject(err ?? new Error(`Failed to read ${entryName}`));
          return;
        }

        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('end', () => finish(Buffer.concat(chunks).toString('utf-8')));
        stream.on('error', reject);
      });
    });

    zipfile.on('end', () => finish(null));
    zipfile.on('error', reject);
    zipfile.readEntry();
  });
}

export async function extractZip(zipFilePath: string, tempDir: string): Promise<void> {
  await fs.mkdir(tempDir, { recursive: true });
  const zipfile = await openZip(zipFilePath);

  await new Promise<void>((resolve, reject) => {
    zipfile.on('entry', (entry) => {
      let destPath: string;
      try {
        destPath = resolveSafeZipPath(tempDir, entry.fileName);
      } catch (err) {
        reject(err);
        return;
      }

      if (entry.fileName.endsWith('/')) {
        fs.mkdir(destPath, { recursive: true })
          .then(() => zipfile.readEntry())
          .catch(reject);
        return;
      }

      zipfile.openReadStream(entry, (err, stream) => {
        if (err || !stream) {
          reject(err ?? new Error(`Failed to extract ${entry.fileName}`));
          return;
        }

        fs.mkdir(path.dirname(destPath), { recursive: true })
          .then(() => {
            const output = createWriteStream(destPath);
            stream.pipe(output);
            output.on('finish', () => zipfile.readEntry());
            output.on('error', reject);
            stream.on('error', reject);
          })
          .catch(reject);
      });
    });

    zipfile.on('end', () => resolve());
    zipfile.on('error', reject);
    zipfile.readEntry();
  });
}
