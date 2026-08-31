import { pgTable, text, integer, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('PENDING'), // ADMIN, PENDING, USER, BLOCKED
  hasActiveScan: boolean('has_active_scan').notNull().default(false),
  maxJobs: integer('max_jobs').notNull().default(1),
  preferences: text('preferences'),
  productAccess: text('product_access'), // JSON { lynxscan: boolean, lynxgeo: boolean }
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
});

export const scans = pgTable('scans', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('IDLE'),
  config: text('config').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
});

export const links = pgTable('links', {
  id: text('id').primaryKey(),
  scanId: text('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  parentUrl: text('parent_url'),
  status: text('status').notNull(),
  statusCode: integer('status_code'),
  error: text('error'),
  type: text('type'),
  snippet: text('snippet'),
  depth: integer('depth').notNull().default(0),
  checkedAt: timestamp('checked_at', { mode: 'date' }),
  isRechecked: boolean('is_rechecked').notNull().default(false),
});

export const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  config: text('config').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
});
