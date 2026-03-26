import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('PENDING'), // ADMIN, PENDING, USER
  maxJobs: integer('max_jobs').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const scans = sqliteTable('scans', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  status: text('status').notNull().default('IDLE'), // IDLE, RUNNING, PAUSED, COMPLETED, FAILED
  config: text('config').notNull(), // JSON string
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const links = sqliteTable('links', {
  id: text('id').primaryKey(),
  scanId: text('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  parentUrl: text('parent_url'),
  status: text('status').notNull(), // PENDING, SUCCESS, BROKEN, SKIPPED
  statusCode: integer('status_code'),
  error: text('error'),
  type: text('type'), // HTML, IMAGE, PDF, etc.
  snippet: text('snippet'), // HTML snippet where the link was found
  depth: integer('depth').notNull().default(0),
  checkedAt: integer('checked_at', { mode: 'timestamp' }),
});

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  config: text('config').notNull(), // JSON string
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
