import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { getDbCommand, parseDatabaseUrl } from '../utils/db-command';

const execAsync = promisify(exec);

/**
 * Gets the database name for a specific user.
 */
function getDbName(userId: string) {
  const suffix = process.env.NODE_ENV === 'test' ? '_test' : '';
  return `lynx_scan_${userId.toLowerCase().replace(/[^a-z0-9]/g, '_')}${suffix}`;
}

export async function createBackup(userId: string, username: string, customFilename?: string) {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // 2026-04-03
  const timestamp = Date.now();
  const backupDir = path.join(process.cwd(), 'data/backups');
  const dbName = getDbName(userId);
  
  // Ensure the backup directory exists
  await fs.mkdir(backupDir, { recursive: true });
  
  // Sanitize the custom filename
  const sanitizedName = customFilename ? 
    customFilename.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/\.zip$/, '') : 
    'snapshot';

  // Format: username-timestamp-date-name.zip
  const finalFilename = `${username}-${timestamp}-${date}-${sanitizedName}.zip`;
    
  const zipPath = path.join(backupDir, finalFilename);
  const sqlPath = path.join(backupDir, `db-${timestamp}.sql`);

  console.log(`Starting backup for user ${userId} (${dbName}): ${finalFilename}`);

  try {
    const rawInfo = parseDatabaseUrl(process.env.DATABASE_URL || '');
    // Override the database name
    const info = { ...rawInfo, db: dbName };
    
    // 1. Run pg_dump
    const baseCommand = getDbCommand('pg_dump', '', info);
    // Use redirection for the SQL file
    const command = `${baseCommand} > "${sqlPath}"`;
    
    console.log(`Executing: ${command}`);
    await execAsync(command, {
      env: { ...process.env, PGPASSWORD: info.pass }
    });
    
    // Verify SQL file exists and has content
    const sqlStats = await fs.stat(sqlPath);
    console.log(`SQL file created: ${sqlStats.size} bytes`);

    // 2. Create Zip
    return new Promise<{ path: string; filename: string; size: number }>((resolve, reject) => {
      console.log('Starting zip creation...');
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', async () => {
        const finalSize = archive.pointer();
        try {
          if (await fs.stat(sqlPath).catch(() => false)) {
            await fs.unlink(sqlPath);
          }
          resolve({
            path: zipPath,
            filename: finalFilename,
            size: finalSize
          });
        } catch (e) {
          reject(e);
        }
      });

      output.on('error', reject);
      archive.on('error', reject);
      archive.pipe(output);

      // Add SQL dump (Note: We no longer add .env to user backups)
      archive.file(sqlPath, { name: 'database.sql' });

      archive.finalize();
    });
  } catch (error) {
    console.error('Backup failed:', error);
    if (await fs.stat(sqlPath).catch(() => false)) {
      await fs.unlink(sqlPath).catch(() => {});
    }
    throw error;
  }
}

export async function restoreBackup(userId: string, zipFilePath: string) {
  const tempDir = path.join(process.cwd(), 'data/backups/tmp-restore');
  const dbName = getDbName(userId);
  await fs.mkdir(tempDir, { recursive: true });

  console.log(`Starting restore for user ${userId} (${dbName}) from ${zipFilePath}`);

  try {
    // 1. Unzip
    await execAsync(`unzip -o "${zipFilePath}" -d "${tempDir}"`);

    const sqlPath = path.join(tempDir, 'database.sql');
    const rawInfo = parseDatabaseUrl(process.env.DATABASE_URL || '');
    const info = { ...rawInfo, db: dbName };

    // 2. Reset DB (Drop and recreate public schema in user's DB)
    console.log(`Resetting database schema for ${dbName}...`);
    const dropCommand = getDbCommand('psql', '-c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"', info);
    await execAsync(dropCommand, {
      env: { ...process.env, PGPASSWORD: info.pass }
    });

    // 3. Restore SQL dump
    console.log('Restoring SQL dump...');
    const restoreCommand = `${getDbCommand('psql', '', info)} < "${sqlPath}"`;
    await execAsync(restoreCommand, {
      env: { ...process.env, PGPASSWORD: info.pass }
    });

    console.log('Restore complete!');
  } finally {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
