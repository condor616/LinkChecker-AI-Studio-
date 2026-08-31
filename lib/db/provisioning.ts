import { Pool } from 'pg';
import { parseDatabaseUrl } from '../utils/db-command';
import { getDb, getGeoDb, closePool, closeGeoPool, getUserDbName, getGeoUserDbName } from './index';

const pgUser = process.env.POSTGRES_USER || 'lynx_scan';
const pgPassword = process.env.POSTGRES_PASSWORD || 'localpass';
const pgDb = process.env.POSTGRES_DB || 'lynx_scan';
const baseConnectionString = process.env.DATABASE_URL || `postgres://${pgUser}:${pgPassword}@localhost:5432/${pgDb}`;
const info = parseDatabaseUrl(baseConnectionString);

// Simple in-memory cache to avoid redundant provisioning checks in the same process lifetime.
const provisionedUsers = new Set<string>();

/**
 * Provisions a new database for a specific user.
 * 1. Creates the database if it doesn't exist.
 * 2. Initializes the schema (scans, links, templates).
 */
export async function provisionUserDb(userId: string) {
  if (provisionedUsers.has(userId)) {
    return;
  }

  const dbName = getUserDbName(userId);
  
  console.log(`Provisioning database: ${dbName}`);

  // 1. Create the database
  const adminPool = new Pool({
    connectionString: `postgres://${info.user}:${info.pass}@${info.host}:${info.port}/postgres`, // Connect to 'postgres' system db
  });

  try {
    const res = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (res.rowCount === 0) {
      console.log(`Database ${dbName} does not exist. Creating...`);
      await adminPool.query(`CREATE DATABASE ${dbName}`);
      console.log(`Database ${dbName} created successfully.`);
    } else {
      console.log(`Database ${dbName} already exists.`);
    }
  } catch (error) {
    console.error(`Failed to create database ${dbName}:`, error);
    throw error;
  } finally {
    await adminPool.end();
  }

  // 2. Initialize schema
  const db = getDb(userId);
  
  try {
    console.log(`Initializing schema for ${dbName}...`);
    
    // Create 'scans' table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS "scans" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL,
        "name" text NOT NULL,
        "status" text DEFAULT 'IDLE' NOT NULL,
        "config" text NOT NULL,
        "created_at" timestamp NOT NULL,
        "updated_at" timestamp NOT NULL
      );
    `);

    // Create 'links' table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS "links" (
        "id" text PRIMARY KEY NOT NULL,
        "scan_id" text NOT NULL,
        "url" text NOT NULL,
        "parent_url" text,
        "status" text NOT NULL,
        "status_code" integer,
        "error" text,
        "type" text,
        "snippet" text,
        "depth" integer DEFAULT 0 NOT NULL,
        "checked_at" timestamp,
        "is_rechecked" boolean DEFAULT false NOT NULL,
        CONSTRAINT "links_scan_id_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE
      );
    `);

    // Create 'templates' table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS "templates" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL,
        "name" text NOT NULL,
        "config" text NOT NULL,
        "created_at" timestamp NOT NULL
      );
    `);

    console.log(`Schema initialized for ${dbName}.`);
    provisionedUsers.add(userId);
  } catch (error) {
    console.error(`Failed to initialize schema for ${dbName}:`, error);
    throw error;
  }
}

const provisionedGeoUsers = new Set<string>();

const GEO_AUDIT_TEMPLATES_SQL = `
    CREATE TABLE IF NOT EXISTS "audit_templates" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "name" text NOT NULL,
      "config" text NOT NULL,
      "created_at" timestamp NOT NULL
    );
  `;

export async function provisionGeoDb(userId: string) {
  if (provisionedGeoUsers.has(userId)) {
    await getGeoDb(userId).execute(GEO_AUDIT_TEMPLATES_SQL);
    return;
  }

  const dbName = getGeoUserDbName(userId);
  console.log(`Provisioning GEO database: ${dbName}`);

  const adminPool = new Pool({
    connectionString: `postgres://${info.user}:${info.pass}@${info.host}:${info.port}/postgres`,
  });

  try {
    const res = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (res.rowCount === 0) {
      await adminPool.query(`CREATE DATABASE ${dbName}`);
    }
  } finally {
    await adminPool.end();
  }

  const userGeoDb = getGeoDb(userId);

  await userGeoDb.execute(`
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
      "created_at" timestamp NOT NULL,
      "updated_at" timestamp NOT NULL
    );
  `);
  await userGeoDb.execute(`
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
  await userGeoDb.execute(`
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
  await userGeoDb.execute(GEO_AUDIT_TEMPLATES_SQL);
  provisionedGeoUsers.add(userId);
}

/**
 * Deletes a user's database.
 */
export async function deleteUserDb(userId: string) {
  const dbName = getUserDbName(userId);
  
  console.log(`Deleting database: ${dbName}`);

  // 1. Close active connections to this DB
  await closePool(userId);
  await closeGeoPool(userId);

  const adminPool = new Pool({
    connectionString: `postgres://${info.user}:${info.pass}@${info.host}:${info.port}/postgres`,
  });

  try {
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await adminPool.query(`DROP DATABASE IF EXISTS ${getGeoUserDbName(userId)} WITH (FORCE)`);
    console.log(`Database ${dbName} dropped.`);
    provisionedUsers.delete(userId);
    provisionedGeoUsers.delete(userId);
  } catch (error) {
    console.error(`Failed to drop database ${dbName}:`, error);
    throw error;
  } finally {
    await adminPool.end();
  }
}
