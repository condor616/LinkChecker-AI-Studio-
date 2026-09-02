import { execSync } from 'child_process';
import path from 'path';

export interface DbConnectionInfo {
  user: string;
  pass: string;
  host: string;
  port: string;
  db: string;
}

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

    const urlObj = new URL(normalizedUrl);
    return {
      user: urlObj.username || 'postgres',
      pass: urlObj.password || '',
      host: urlObj.hostname || 'localhost',
      port: urlObj.port || '5432',
      db: urlObj.pathname.split('/')[1] || 'postgres',
    };
  } catch {
    return {
      user: process.env.POSTGRES_USER || 'lynx_scan',
      pass: process.env.POSTGRES_PASSWORD || 'localpass',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || '5432',
      db: process.env.POSTGRES_DB || 'lynx_scan',
    };
  }
}

export function getDbCommand(
  type: 'pg_dump' | 'psql',
  args: string = '',
  info: DbConnectionInfo,
  cwd: string = process.cwd(),
): string {
  const prefix = process.env.DB_COMMAND_PREFIX;

  if (prefix) {
    return `${prefix} ${type} -h ${info.host} -p ${info.port} -U ${info.user} ${args} ${info.db}`;
  }

  const hasLocalBinary = checkBinary(type);
  if (hasLocalBinary) {
    return `${type} -h ${info.host} -p ${info.port} -U ${info.user} ${args} ${info.db}`;
  }

  if (info.host === 'localhost' || info.host === '127.0.0.1') {
    const root =
      cwd.endsWith(`${path.sep}apps${path.sep}lynxgeo`) ? path.join(cwd, '..', '..') : cwd;
    const composeFile = path.join(root, 'docker/services/docker-compose.yml');
    const composeCmd = checkBinary('docker-compose') ? 'docker-compose' : 'docker compose';
    return `${composeCmd} -f "${composeFile}" exec -T db ${type} -U ${info.user} ${args} ${info.db}`;
  }

  return `${type} -h ${info.host} -p ${info.port} -U ${info.user} ${args} ${info.db}`;
}

function checkBinary(name: string): boolean {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return true;
  }
  try {
    execSync(`which ${name}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
