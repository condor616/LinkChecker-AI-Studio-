import { execSync } from 'child_process';
import path from 'path';

export interface DbConnectionInfo {
  user: string;
  pass: string;
  host: string;
  port: string;
  db: string;
}

/**
 * Parses a PostgreSQL connection string into its components.
 * Format: postgres://user:pass@host:port/db
 */
export function parseDatabaseUrl(url: string): DbConnectionInfo {
  if (!url || !url.trim()) {
    return {
      user: process.env.POSTGRES_USER || 'lynx_scan',
      pass: process.env.POSTGRES_PASSWORD || 'localpass',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || '5432',
      db: process.env.POSTGRES_DB || 'lynx_scan',
    };
  }

  try {
    const normalizedUrl = url.replace(/^postgresql:\/\//, 'postgres://');
    const regex = /postgres:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/;
    const match = normalizedUrl.match(regex);

    if (match) {
      return {
        user: match[1],
        pass: match[2],
        host: match[3],
        port: match[4],
        db: match[5],
      };
    }

    // Fallback for simpler URLs (no password or port)
    const urlObj = new URL(normalizedUrl);
    return {
      user: urlObj.username || 'postgres',
      pass: urlObj.password || '',
      host: urlObj.hostname || 'localhost',
      port: urlObj.port || '5432',
      db: urlObj.pathname.split('/')[1] || 'postgres',
    };
  } catch (error) {
    console.warn('Failed to parse DATABASE_URL. Falling back to POSTGRES_* variables.');
    // Return defaults as last resort
    return {
      user: process.env.POSTGRES_USER || 'lynx_scan',
      pass: process.env.POSTGRES_PASSWORD || 'localpass',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || '5432',
      db: process.env.POSTGRES_DB || 'lynx_scan',
    };
  }
}

/**
 * Constructs a command for pg_dump or psql with the correct environment/prefix.
 */
export function getDbCommand(
  type: 'pg_dump' | 'psql',
  args: string = '',
  info: DbConnectionInfo
): string {
  const prefix = process.env.DB_COMMAND_PREFIX;

  // If a custom prefix is manually set in .env, use it.
  if (prefix) {
    return `${prefix} ${type} -h ${info.host} -p ${info.port} -U ${info.user} ${args} ${info.db}`;
  }

  // Check if the binary exists on the host
  const hasLocalBinary = checkBinary(type);
  if (hasLocalBinary) {
    return `${type} -h ${info.host} -p ${info.port} -U ${info.user} ${args} ${info.db}`;
  }

  // Fallback to Docker Compose if on localhost
  if (info.host === 'localhost' || info.host === '127.0.0.1') {
    // Try docker-compose exec (standard for this repo layout)
    const composeFile = path.join(process.cwd(), 'docker/services/docker-compose.yml');
    
    // We use 'docker compose' as preferred, fallback to 'docker-compose'
    const composeCmd = checkBinary('docker-compose') ? 'docker-compose' : 'docker compose';
    
    // Using exec -T for non-interactive execution
    // Note: We don't pass host/port/user inside docker exec because it connects internally to 'db'
    // but the service name might vary. We assume service 'db' exists as per docker-compose.yml
    return `${composeCmd} -f "${composeFile}" exec -T db ${type} -U ${info.user} ${args} ${info.db}`;
  }

  // Final fallback: just the binary name and hope for the best
  return `${type} -h ${info.host} -p ${info.port} -U ${info.user} ${args} ${info.db}`;
}

function checkBinary(name: string): boolean {
  try {
    execSync(`which ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
