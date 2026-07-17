import { z } from 'zod';

export const RegisterRequestSchema = z
  .object({
    email: z.string().email().optional(),
    password: z.string().min(8).max(128).optional(),
    checkOnly: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.checkOnly) {
      return;
    }

    if (!value.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email is required',
        path: ['email'],
      });
    }

    if (!value.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Password is required',
        path: ['password'],
      });
    }
  });

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const ScanConfigSchema = z
  .object({
    startUrl: z.string().url(),
    name: z.string().min(1).max(120).optional(),
    maxDepth: z.number().int().min(0).max(20).optional(),
    randomDelay: z.number().int().min(0).max(30000).optional(),
    rateLimit: z.number().int().min(1).max(10000).optional(),
    skipExternal: z.boolean().optional(),
    excludeSubdomains: z.boolean().optional(),
    doNotTraverseBackward: z.boolean().optional(),
    saveSkippedLinks: z.boolean().optional(),
    userAgent: z.string().max(512).optional(),
    customUserAgent: z.string().max(512).optional(),
    targetUrls: z.array(z.string().url()).max(10000).optional(),
    skipSelectors: z.array(z.string().max(300)).max(200).optional(),
    auth: z
      .object({
        username: z.string().max(256),
        password: z.string().max(256),
      })
      .optional(),
  })
  .passthrough();

export const AdminUserUpdateSchema = z
  .object({
    role: z.enum(['ADMIN', 'USER', 'PENDING', 'BLOCKED']).optional(),
    maxJobs: z.number().int().min(1).max(100).optional(),
    preferences: z.string().max(20000).optional(),
    hasActiveScan: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one valid field must be provided',
  });

export const ProfilePasswordUpdateSchema = z.object({
  password: z.string().min(8).max(128),
});

export const ScanAuthValidationSchema = z.object({
  startUrl: z.string().url(),
  auth: z.object({
    username: z.string().min(1).max(256),
    password: z.string().min(1).max(256),
  }),
});
