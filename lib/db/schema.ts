import { pgTable, text, integer, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('PENDING'), // ADMIN, PENDING, USER
  maxJobs: integer('max_jobs').notNull().default(1),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
});

export const scans = pgTable('scans', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  status: text('status').notNull().default('IDLE'), // IDLE, RUNNING, PAUSED, COMPLETED, FAILED
  config: text('config').notNull(), // JSON string
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
});

export const links = pgTable('links', {
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
  checkedAt: timestamp('checked_at', { mode: 'date' }),
  isRechecked: boolean('is_rechecked').notNull().default(false),
});

export const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  config: text('config').notNull(), // JSON string
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
});
