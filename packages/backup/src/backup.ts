import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import 'server-only';
import archiver from 'archiver';
import { Pool } from 'pg';
import { getLynxGeoDbName, getLynxScanDbName } from '@lynx/db';
import { getDbCommand, parseDatabaseUrl } from './db-command';
import { buildManifest, getBackupScope, parseManifest, type BackupManifestV1, type BackupProductId, type BackupScope } from './manifest';
import { getBackupDir, sanitizeBackupFilename } from './paths';
import { extractZip, listZipEntryNames, readZipEntryText } from './zip';

const execAsync = promisify(exec);

const SCAN_SQL = 'lynxscan.sql';
const GEO_SQL = 'lynxgeo.sql';
const LEGACY_SQL = 'database.sql';
const MANIFEST_FILE = 'manifest.json';

export interface BackupResult {
  path: string;
  filename: string;
  size: number;
  scope: BackupScope;
}

export interface BackupListEntry {
  filename: string;
  size: number;
  createdAt: Date;
  scope: BackupScope;
}

export interface BackupOptions {
  cwd?: string;
  databaseUrl?: string;
  runCommand?: (command: string, password: string) => Promise<void>;
}

function getConnectionInfo(options: BackupOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const rawInfo = parseDatabaseUrl(options.databaseUrl ?? process.env.DATABASE_URL ?? '');
  return { cwd, rawInfo, runCommand: options.runCommand };
}

async function executeShellCommand(
  command: string,
  password: string,
  runCommand?: BackupOptions['runCommand'],
): Promise<void> {
  if (runCommand) {
    await runCommand(command, password);
    return;
  }
  await execAsync(command, {
    env: { ...process.env, PGPASSWORD: password },
  });
}

async function databaseExists(dbName: string, rawInfo: ReturnType<typeof parseDatabaseUrl>): Promise<boolean> {
  const adminPool = new Pool({
    connectionString: `postgres://${rawInfo.user}:${rawInfo.pass}@${rawInfo.host}:${rawInfo.port}/postgres`,
  });
  try {
    const res = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    return (res.rowCount ?? 0) > 0;
  } finally {
    await adminPool.end();
  }
}

async function ensureDatabaseExists(dbName: string, rawInfo: ReturnType<typeof parseDatabaseUrl>): Promise<void> {
  const exists = await databaseExists(dbName, rawInfo);
  if (exists) return;

  const adminPool = new Pool({
    connectionString: `postgres://${rawInfo.user}:${rawInfo.pass}@${rawInfo.host}:${rawInfo.port}/postgres`,
  });
  try {
    await adminPool.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await adminPool.end();
  }
}

async function dumpDatabase(
  dbName: string,
  sqlPath: string,
  rawInfo: ReturnType<typeof parseDatabaseUrl>,
  cwd: string,
  runCommand?: BackupOptions['runCommand'],
): Promise<void> {
  const info = { ...rawInfo, db: dbName };
  const baseCommand = getDbCommand('pg_dump', '', info, cwd);
  const command = `${baseCommand} > "${sqlPath}"`;
  await executeShellCommand(command, info.pass, runCommand);
  const sqlStats = await fs.stat(sqlPath);
  if (sqlStats.size === 0) {
    throw new Error(`Backup dump for ${dbName} produced an empty file`);
  }
}

async function restoreDatabaseFromSql(
  dbName: string,
  sqlPath: string,
  rawInfo: ReturnType<typeof parseDatabaseUrl>,
  cwd: string,
  runCommand?: BackupOptions['runCommand'],
): Promise<void> {
  await ensureDatabaseExists(dbName, rawInfo);
  const info = { ...rawInfo, db: dbName };
  const dropCommand = getDbCommand('psql', '-c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"', info, cwd);
  await executeShellCommand(dropCommand, info.pass, runCommand);
  const restoreCommand = `${getDbCommand('psql', '', info, cwd)} < "${sqlPath}"`;
  await executeShellCommand(restoreCommand, info.pass, runCommand);
}

async function readBackupScopeFromZip(zipFilePath: string): Promise<BackupScope> {
  try {
    const entryNames = await listZipEntryNames(zipFilePath);
    const hasLegacy = entryNames.includes(LEGACY_SQL);
    if (entryNames.includes(MANIFEST_FILE)) {
      const manifestText = await readZipEntryText(zipFilePath, MANIFEST_FILE);
      return getBackupScope(manifestText ? parseManifest(manifestText) : null, hasLegacy);
    }
    if (hasLegacy) return 'legacy-scan-only';
    return entryNames.includes(GEO_SQL) ? 'scan-geo' : 'scan-only';
  } catch {
    return 'scan-only';
  }
}

async function zipFiles(
  zipPath: string,
  files: Array<{ path: string; name: string }>,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(archive.pointer()));
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);

    for (const file of files) {
      archive.file(file.path, { name: file.name });
    }

    archive.finalize();
  });
}

export async function createBackup(
  userId: string,
  username: string,
  customFilename?: string,
  options: BackupOptions = {},
): Promise<BackupResult> {
  const { cwd, rawInfo, runCommand } = getConnectionInfo(options);
  const backupDir = getBackupDir(cwd);
  const scanDbName = getLynxScanDbName(userId);
  const geoDbName = getLynxGeoDbName(userId);
  const timestamp = Date.now();
  const date = new Date().toISOString().split('T')[0];
  const sanitizedName = customFilename ? sanitizeBackupFilename(customFilename) : 'snapshot';
  const finalFilename = `${username}-${timestamp}-${date}-${sanitizedName}.zip`;
  const zipPath = path.join(backupDir, finalFilename);
  const tempSqlDir = path.join(backupDir, `tmp-create-${timestamp}`);

  await fs.mkdir(backupDir, { recursive: true });
  await fs.mkdir(tempSqlDir, { recursive: true });

  const scanSqlPath = path.join(tempSqlDir, SCAN_SQL);
  const geoSqlPath = path.join(tempSqlDir, GEO_SQL);
  const manifestPath = path.join(tempSqlDir, MANIFEST_FILE);

  const products: BackupManifestV1['products'] = {};

  try {
    console.log(`Starting unified backup for user ${userId}: ${finalFilename}`);

    await dumpDatabase(scanDbName, scanSqlPath, rawInfo, cwd, runCommand);
    products.lynxscan = { file: SCAN_SQL, dbName: scanDbName };

    const geoExists = await databaseExists(geoDbName, rawInfo);
    if (geoExists) {
      await dumpDatabase(geoDbName, geoSqlPath, rawInfo, cwd, runCommand);
      products.lynxgeo = { file: GEO_SQL, dbName: geoDbName };
    }

    const manifest = buildManifest(userId, products);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const filesToZip = [
      { path: manifestPath, name: MANIFEST_FILE },
      { path: scanSqlPath, name: SCAN_SQL },
    ];
    if (products.lynxgeo) {
      filesToZip.push({ path: geoSqlPath, name: GEO_SQL });
    }

    const size = await zipFiles(zipPath, filesToZip);
    const scope = getBackupScope(manifest, false);

    return { path: zipPath, filename: finalFilename, size, scope };
  } finally {
    await fs.rm(tempSqlDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function readExtractedManifest(tempDir: string): Promise<BackupManifestV1 | null> {
  const manifestPath = path.join(tempDir, MANIFEST_FILE);
  if (await fs.stat(manifestPath).catch(() => false)) {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    return parseManifest(raw);
  }
  return null;
}

async function restoreProduct(
  product: BackupProductId,
  entry: { file: string; dbName: string },
  tempDir: string,
  targetUserId: string,
  rawInfo: ReturnType<typeof parseDatabaseUrl>,
  cwd: string,
  runCommand?: BackupOptions['runCommand'],
): Promise<void> {
  const sqlPath = path.join(tempDir, entry.file);
  if (!(await fs.stat(sqlPath).catch(() => false))) {
    console.log(`Skipping ${product} restore: ${entry.file} not found in archive`);
    return;
  }

  const targetDbName = product === 'lynxscan' ? getLynxScanDbName(targetUserId) : getLynxGeoDbName(targetUserId);
  console.log(`Restoring ${product} (${targetDbName}) from ${entry.file}`);
  await restoreDatabaseFromSql(targetDbName, sqlPath, rawInfo, cwd, runCommand);
}

export async function restoreBackup(
  userId: string,
  zipFilePath: string,
  options: BackupOptions = {},
): Promise<{ scope: BackupScope; restored: BackupProductId[] }> {
  const { cwd, rawInfo, runCommand } = getConnectionInfo(options);
  const backupDir = getBackupDir(cwd);
  const tempDir = path.join(backupDir, 'tmp-restore');

  console.log(`Starting restore for user ${userId} from ${zipFilePath}`);

  try {
    await extractZip(zipFilePath, tempDir);

    const manifest = await readExtractedManifest(tempDir);
    const hasLegacy = Boolean(await fs.stat(path.join(tempDir, LEGACY_SQL)).catch(() => false));
    const scope = getBackupScope(manifest, hasLegacy);
    const restored: BackupProductId[] = [];

    if (manifest) {
      if (manifest.products.lynxscan) {
        await restoreProduct('lynxscan', manifest.products.lynxscan, tempDir, userId, rawInfo, cwd, runCommand);
        restored.push('lynxscan');
      }
      if (manifest.products.lynxgeo) {
        await restoreProduct('lynxgeo', manifest.products.lynxgeo, tempDir, userId, rawInfo, cwd, runCommand);
        restored.push('lynxgeo');
      }
    } else if (hasLegacy) {
      const scanDbName = getLynxScanDbName(userId);
      await restoreDatabaseFromSql(scanDbName, path.join(tempDir, LEGACY_SQL), rawInfo, cwd, runCommand);
      restored.push('lynxscan');
    } else {
      throw new Error('Backup archive is missing manifest.json and database.sql');
    }

    console.log('Restore complete!');
    return { scope, restored };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function readBackupScope(zipFilePath: string): Promise<BackupScope> {
  return readBackupScopeFromZip(zipFilePath);
}

export async function listBackups(username: string, options: BackupOptions = {}): Promise<BackupListEntry[]> {
  const backupDir = getBackupDir(options.cwd);
  await fs.mkdir(backupDir, { recursive: true });

  const files = await fs.readdir(backupDir);
  const entries = await Promise.all(
    files
      .filter((f) => f.endsWith('.zip') && f.startsWith(`${username}-`))
      .map(async (filename) => {
        const filePath = path.join(backupDir, filename);
        const stats = await fs.stat(filePath);
        const scope = await readBackupScopeFromZip(filePath);
        return {
          filename,
          size: stats.size,
          createdAt: stats.birthtime,
          scope,
        };
      }),
  );

  return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
