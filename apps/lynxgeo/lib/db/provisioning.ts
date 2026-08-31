import { Pool } from 'pg';
import { connectionStringFor, getGeoDb } from './index';
import { getLynxGeoDbName, getLynxScanDbName } from '@lynx/db';
import { AUDIT_FRONTIER_ALTER_SQL } from '../geo/frontier';
import { AUDIT_PROGRESS_ALTER_SQL } from '../geo/progress';

const provisioned = new Set<string>();

const AUDIT_TEMPLATES_SQL = `
    CREATE TABLE IF NOT EXISTS "audit_templates" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "name" text NOT NULL,
      "config" text NOT NULL,
      "created_at" timestamp NOT NULL
    );
  `;

async function ensureAuditTemplatesTable(userId: string) {
  const geoDb = getGeoDb(userId);
  await geoDb.execute(AUDIT_TEMPLATES_SQL);
}

async function ensureAuditProgressColumn(userId: string) {
  const geoDb = getGeoDb(userId);
  await geoDb.execute(AUDIT_PROGRESS_ALTER_SQL);
}

async function ensureAuditFrontierColumn(userId: string) {
  const geoDb = getGeoDb(userId);
  await geoDb.execute(AUDIT_FRONTIER_ALTER_SQL);
}

export async function provisionGeoDb(userId: string) {
  if (provisioned.has(userId)) {
    await ensureAuditTemplatesTable(userId);
    await ensureAuditProgressColumn(userId);
    await ensureAuditFrontierColumn(userId);
    return;
  }
  const dbName = getLynxGeoDbName(userId);
  const admin = new Pool({ connectionString: connectionStringFor('postgres') });
  try {
    const res = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (res.rowCount === 0) await admin.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await admin.end();
  }

  const geoDb = getGeoDb(userId);
  await geoDb.execute(`
    CREATE TABLE IF NOT EXISTS "audits" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "name" text NOT NULL,
      "status" text DEFAULT 'IDLE' NOT NULL,
      "config" text NOT NULL,
      "score" integer,
      "score_model_version" text,
      "category_scores" text,
      "start_url" text,
      "progress" text,
      "frontier" text,
      "created_at" timestamp NOT NULL,
      "updated_at" timestamp NOT NULL
    );
  `);
  await geoDb.execute(`
    CREATE TABLE IF NOT EXISTS "audit_pages" (
      "id" text PRIMARY KEY NOT NULL,
      "audit_id" text NOT NULL,
      "url" text NOT NULL,
      "parent_url" text,
      "status" text NOT NULL,
      "status_code" integer,
      "depth" integer DEFAULT 0 NOT NULL,
      "content_type" text,
      "headers" text,
      "findings" text,
      "checked_at" timestamp,
      CONSTRAINT "audit_pages_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "audits"("id") ON DELETE CASCADE
    );
  `);
  await geoDb.execute(`
    CREATE TABLE IF NOT EXISTS "audit_snapshots" (
      "id" text PRIMARY KEY NOT NULL,
      "audit_id" text NOT NULL,
      "score" integer,
      "score_model_version" text NOT NULL,
      "payload" text NOT NULL,
      "created_at" timestamp NOT NULL,
      CONSTRAINT "audit_snapshots_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "audits"("id") ON DELETE CASCADE
    );
  `);
  await ensureAuditTemplatesTable(userId);
  await ensureAuditProgressColumn(userId);
  await ensureAuditFrontierColumn(userId);
  provisioned.add(userId);
}

export async function deleteGeoDb(userId: string) {
  const dbName = getLynxGeoDbName(userId);
  const admin = new Pool({ connectionString: connectionStringFor('postgres') });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${getLynxScanDbName(userId)} WITH (FORCE)`);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    provisioned.delete(userId);
  } finally {
    await admin.end();
  }
}
