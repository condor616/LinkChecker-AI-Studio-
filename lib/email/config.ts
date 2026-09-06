export type SmtpEncryption = 'none' | 'starttls' | 'tls';

export type SmtpConfig = {
  host: string;
  port: number;
  encryption: SmtpEncryption;
  user: string;
  pass: string;
  from: string;
  adminEmail: string;
  jsonTransport?: boolean;
};

export const SMTP_SETTINGS_KEY = 'smtp';

const ENCRYPTION_VALUES: SmtpEncryption[] = ['none', 'starttls', 'tls'];

export function parseSmtpEncryption(value: string | undefined): SmtpEncryption {
  const normalized = (value || 'none').trim().toLowerCase();
  if (ENCRYPTION_VALUES.includes(normalized as SmtpEncryption)) {
    return normalized as SmtpEncryption;
  }
  if (normalized === 'ssl' || normalized === 'true' || normalized === '1') {
    return 'tls';
  }
  return 'none';
}

export function smtpConfigFromEnv(): SmtpConfig {
  const port = Number.parseInt(process.env.SMTP_PORT || '26', 10);
  return {
    host: (process.env.SMTP_HOST || '').trim(),
    port: Number.isFinite(port) && port > 0 ? port : 26,
    encryption: parseSmtpEncryption(process.env.SMTP_SECURE),
    user: (process.env.SMTP_USER || '').trim(),
    pass: process.env.SMTP_PASS || '',
    from: (process.env.SMTP_FROM || '').trim(),
    adminEmail: (process.env.MAIL_ADMIN || '').trim(),
  };
}

export function parseSavedSmtpConfig(raw: string | null | undefined): Partial<SmtpConfig> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<SmtpConfig>;
    return {
      host: typeof parsed.host === 'string' ? parsed.host : undefined,
      port: typeof parsed.port === 'number' ? parsed.port : undefined,
      encryption: parsed.encryption ? parseSmtpEncryption(parsed.encryption) : undefined,
      user: typeof parsed.user === 'string' ? parsed.user : undefined,
      pass: typeof parsed.pass === 'string' ? parsed.pass : undefined,
      from: typeof parsed.from === 'string' ? parsed.from : undefined,
      adminEmail: typeof parsed.adminEmail === 'string' ? parsed.adminEmail : undefined,
    };
  } catch {
    return {};
  }
}

export function mergeSmtpConfig(base: SmtpConfig, overlay: Partial<SmtpConfig>): SmtpConfig {
  return {
    host: overlay.host ?? base.host,
    port: overlay.port ?? base.port,
    encryption: overlay.encryption ?? base.encryption,
    user: overlay.user ?? base.user,
    pass: overlay.pass !== undefined && overlay.pass !== '' ? overlay.pass : base.pass,
    from: overlay.from ?? base.from,
    adminEmail: overlay.adminEmail ?? base.adminEmail,
    jsonTransport: overlay.jsonTransport ?? base.jsonTransport,
  };
}

export function isSmtpConfigured(config: SmtpConfig): boolean {
  if (config.jsonTransport) return true;
  return Boolean(config.host && config.from);
}

export function getAppBaseUrl(): string {
  const raw = process.env.APP_URL || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_LYNXSCAN_URL || 'http://localhost:3000';
  return raw.replace(/\/$/, '');
}

export function toPublicSmtpConfig(config: SmtpConfig) {
  return {
    host: config.host,
    port: config.port,
    encryption: config.encryption,
    user: config.user,
    from: config.from,
    adminEmail: config.adminEmail,
    passwordSet: Boolean(config.pass),
    configured: isSmtpConfigured(config),
  };
}
