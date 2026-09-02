import { z } from 'zod';

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

/** Aligns with LynxScan ScanConfigSchema + crawler-core CrawlConfig extras; unknown keys pass through. */
export const AuditStartSchema = z
  .object({
    startUrl: z.string().url(),
    name: z.string().min(1).max(120).optional(),
    maxDepth: z.number().int().min(0).max(20).optional(),
    maxPages: z.coerce.number().int().min(0).max(1_000_000).optional(),
    randomDelay: z.number().int().min(0).max(30000).optional(),
    rateLimit: z.number().int().min(1).max(10000).optional(),
    skipExternal: z.boolean().optional(),
    excludeSubdomains: z.boolean().optional(),
    doNotTraverseBackward: z.boolean().optional(),
    saveSkippedLinks: z.boolean().optional(),
    userAgent: z.string().max(512).optional(),
    customUserAgent: z.string().max(512).optional(),
    skipSelectors: z.array(z.string().max(300)).max(200).optional(),
    regexRules: z.array(z.string().max(4000)).max(200).optional(),
    wildcardExclusions: z.array(z.string().max(500)).max(200).optional(),
    excludeRegex: z.string().max(4000).optional(),
    auth: z
      .object({
        username: z.string().max(256),
        password: z.string().max(256),
      })
      .optional(),
    isTargeted: z.boolean().optional(),
    targetUrls: z.array(z.string().url()).max(10000).optional(),
  })
  .passthrough()
  .transform((data) => ({
    ...data,
    skipExternal: true as const,
    doNotTraverseBackward: true as const,
    maxPages: data.maxPages && data.maxPages > 0 ? data.maxPages : 0,
    isTargeted: Boolean(data.isTargeted && data.targetUrls?.length),
    targetUrls: data.isTargeted && data.targetUrls?.length ? data.targetUrls : undefined,
  }));

export const AuditTemplateSaveSchema = z.object({
  name: z.string().min(1).max(120),
  config: z.union([z.string().min(2), z.record(z.string(), z.unknown())]),
});

export const AuditControlSchema = z.object({
  status: z.enum(['PAUSED', 'RUNNING', 'CANCELLED']),
});
