import { pgTable, text, integer, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('PENDING'), // ADMIN, PENDING, USER
  hasActiveScan: boolean('has_active_scan').notNull().default(false),
  maxJobs: integer('max_jobs').notNull().default(1),
  preferences: text('preferences'), // JSON string for user settings
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
});

export const scans = pgTable('scans', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(), // FK removed for multi-db
  name: text('name').notNull(),
  status: text('status').notNull().default('IDLE'), // IDLE, RUNNING, PAUSED, COMPLETED, FAILED
  /**
   * Scan configuration (JSON).
   * @property {string} userAgent - Selected predefined browser agent string
   * @property {string} customUserAgent - Custom browser agent string (overrides selection)
   * @property {number} randomDelay - Max random delay in ms before each request
   * @property {number} maxDepth - Max crawl depth
   * @property {number} rateLimit - Requests per minute
   * @property {string} startUrl - The URL to start the scan from
   */
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
  userId: text('user_id').notNull(), // FK removed for multi-db
  name: text('name').notNull(),
  config: text('config').notNull(), // JSON string
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
});
