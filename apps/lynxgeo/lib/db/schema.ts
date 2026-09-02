import { pgTable, text, integer, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('PENDING'),
  hasActiveScan: boolean('has_active_scan').notNull().default(false),
  maxJobs: integer('max_jobs').notNull().default(1),
  preferences: text('preferences'),
  productAccess: text('product_access'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
});

export const audits = pgTable('audits', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('IDLE'),
  config: text('config').notNull(),
  score: integer('score'),
  scoreModelVersion: text('score_model_version'),
  categoryScores: text('category_scores'),
  startUrl: text('start_url'),
  seriesId: text('series_id'),
  baselineAuditId: text('baseline_audit_id'),
  progress: text('progress'),
  frontier: text('frontier'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull(),
});

export const auditSnapshots = pgTable('audit_snapshots', {
  id: text('id').primaryKey(),
  auditId: text('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  score: integer('score'),
  scoreModelVersion: text('score_model_version').notNull(),
  payload: text('payload').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
});

export const auditTemplates = pgTable('audit_templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  config: text('config').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull(),
});

export const auditPages = pgTable('audit_pages', {
  id: text('id').primaryKey(),
  auditId: text('audit_id').notNull().references(() => audits.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  parentUrl: text('parent_url'),
  status: text('status').notNull(),
  statusCode: integer('status_code'),
  depth: integer('depth').notNull().default(0),
  contentType: text('content_type'),
  headers: text('headers'),
  findings: text('findings'),
  checkedAt: timestamp('checked_at', { mode: 'date' }),
});
