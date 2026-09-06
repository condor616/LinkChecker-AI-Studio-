import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { systemSettings } from '@/lib/db/schema';
import {
  type SmtpConfig,
  SMTP_SETTINGS_KEY,
  isSmtpConfigured,
  mergeSmtpConfig,
  parseSavedSmtpConfig,
  smtpConfigFromEnv,
  toPublicSmtpConfig,
} from './config';

export type MailMessage = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

export type SendMailResult = {
  skipped: boolean;
  reason?: string;
  messageId?: string;
  json?: string;
};

export async function getSmtpConfig(): Promise<SmtpConfig> {
  const envConfig = smtpConfigFromEnv();
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, SMTP_SETTINGS_KEY))
      .limit(1);
    if (rows[0]) {
      return mergeSmtpConfig(envConfig, parseSavedSmtpConfig(rows[0].value));
    }
  } catch (error) {
    console.error('Failed to load SMTP settings from the database:', error);
  }
  return envConfig;
}

export async function saveSmtpConfig(update: Partial<SmtpConfig>): Promise<SmtpConfig> {
  const current = await getSmtpConfig();
  const next = mergeSmtpConfig(current, update);
  const value = JSON.stringify({
    host: next.host,
    port: next.port,
    encryption: next.encryption,
    user: next.user,
    pass: next.pass,
    from: next.from,
    adminEmail: next.adminEmail,
  });
  const existing = await db
    .select({ key: systemSettings.key })
    .from(systemSettings)
    .where(eq(systemSettings.key, SMTP_SETTINGS_KEY))
    .limit(1);

  if (existing[0]) {
    await db
      .update(systemSettings)
      .set({ value, updatedAt: new Date() })
      .where(eq(systemSettings.key, SMTP_SETTINGS_KEY));
  } else {
    await db.insert(systemSettings).values({
      key: SMTP_SETTINGS_KEY,
      value,
      updatedAt: new Date(),
    });
  }
  return next;
}

export function createTransporter(config: SmtpConfig) {
  if (config.jsonTransport || process.env.SMTP_JSON === 'true') {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  const options: SMTPTransport.Options = {
    host: config.host,
    port: config.port,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  };

  if (config.encryption === 'tls') {
    options.secure = true;
  } else if (config.encryption === 'starttls') {
    options.secure = false;
    options.requireTLS = true;
  } else {
    options.secure = false;
    options.ignoreTLS = true;
  }

  return nodemailer.createTransport(options);
}

export async function sendMail(
  message: MailMessage,
  configOverride?: Partial<SmtpConfig>,
): Promise<SendMailResult> {
  const config = mergeSmtpConfig(await getSmtpConfig(), configOverride || {});
  if (!isSmtpConfigured(config)) {
    return { skipped: true, reason: 'SMTP is not configured' };
  }

  const transporter = createTransporter(config);
  const info = await transporter.sendMail({
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  return {
    skipped: false,
    messageId: info.messageId,
    json: typeof info.message === 'string' ? info.message : undefined,
  };
}

export async function sendMailSafe(
  message: MailMessage,
  configOverride?: Partial<SmtpConfig>,
): Promise<SendMailResult> {
  try {
    return await sendMail(message, configOverride);
  } catch (error) {
    console.error('Email send failed:', error);
    return { skipped: false, reason: error instanceof Error ? error.message : 'Email send failed' };
  }
}

export { isSmtpConfigured, toPublicSmtpConfig };
