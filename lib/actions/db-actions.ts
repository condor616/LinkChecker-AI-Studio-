import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { getDbCommand, parseDatabaseUrl } from '../utils/db-command';

const execAsync = promisify(exec);

export async function createBackup(username: string, customFilename?: string) {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // 2026-04-03
  const timestamp = Date.now();
  const backupDir = path.join(process.cwd(), 'data/backups');
  
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
  const envPath = path.join(process.cwd(), '.env');

  console.log(`Starting backup: ${finalFilename}`);
  console.log(`SQL path: ${sqlPath}`);
  console.log(`ZIP path: ${zipPath}`);

  try {
    const info = parseDatabaseUrl(process.env.DATABASE_URL || '');
    
    // 1. Run pg_dump
    const baseCommand = getDbCommand('pg_dump', '', info);
    // Use redirection for the SQL file
    const command = `${baseCommand} > "${sqlPath}"`;
    
    console.log(`Executing: ${command}`);
    const { stdout, stderr } = await execAsync(command, {
      env: { ...process.env, PGPASSWORD: info.pass }
    });
    
    if (stderr) console.warn('pg_dump stderr:', stderr);

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
        console.log(`Zip creation complete. Size: ${finalSize} bytes`);
        try {
          if (await fs.stat(sqlPath).catch(() => false)) {
            await fs.unlink(sqlPath);
            console.log('Temporary SQL file cleaned up.');
          }
          resolve({
            path: zipPath,
            filename: finalFilename,
            size: finalSize
          });
        } catch (e) {
          console.error('Error in zip close handler:', e);
          reject(e);
        }
      });

      output.on('error', (err) => {
        console.error('Output stream error:', err);
        reject(err);
      });

      archive.on('error', (err: Error) => {
        console.error('Archive error:', err);
        reject(err);
      });

      archive.pipe(output);

      // Add SQL dump
      archive.file(sqlPath, { name: 'database.sql' });
      // Add .env
      if (process.env.NODE_ENV !== 'test') { // Skip .env in some test environments if needed
        archive.file(envPath, { name: '.env' });
      }

      console.log('Finalizing archive...');
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

export async function restoreBackup(zipFilePath: string) {
  const tempDir = path.join(process.cwd(), 'data/backups/tmp-restore');
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // 1. Unzip
    await execAsync(`unzip -o "${zipFilePath}" -d "${tempDir}"`);

    const sqlPath = path.join(tempDir, 'database.sql');
    const envBackupPath = path.join(tempDir, '.env');

    const info = parseDatabaseUrl(process.env.DATABASE_URL || '');

    // 2. Smart .env update
    if (await fs.stat(envBackupPath).catch(() => false)) {
      const backupEnvContent = await fs.readFile(envBackupPath, 'utf8');
      await updateEnv(backupEnvContent);
    }

    // 3. Reset DB (Drop and recreate public schema)
    console.log('Resetting database...');
    const dropCommand = getDbCommand('psql', '-c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"', info);
    await execAsync(dropCommand, {
      env: { ...process.env, PGPASSWORD: info.pass }
    });

    // 4. Restore SQL dump
    console.log('Restoring SQL dump...');
    // We use stdin redirection to ensure compatibility with Docker exec/run
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

async function updateEnv(newEnvContent: string) {
  const currentEnvPath = path.join(process.cwd(), '.env');
  let currentEnv = await fs.readFile(currentEnvPath, 'utf8');
  
  const keysToUpdate = ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'REDIS_URL', 'APP_URL'];
  
  const lines = newEnvContent.split('\n');
  for (const line of lines) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      
      if (keysToUpdate.includes(key)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (currentEnv.match(regex)) {
          currentEnv = currentEnv.replace(regex, `${key}=${value}`);
        } else {
          currentEnv += `\n${key}=${value}`;
        }
      }
    }
  }
  await fs.writeFile(currentEnvPath, currentEnv);
}
