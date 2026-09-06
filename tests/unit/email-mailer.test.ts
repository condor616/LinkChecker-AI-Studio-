import { describe, it, expect } from 'vitest';
import { createTransporter, sendMail } from '@/lib/email/mailer';
import { isSmtpConfigured, mergeSmtpConfig, smtpConfigFromEnv, parseSmtpEncryption } from '@/lib/email/config';
import { accountApprovedEmail, passwordResetEmail, testEmail } from '@/lib/email/templates';

describe('SMTP config helpers', () => {
  it('treats empty host/from as unconfigured', () => {
    expect(isSmtpConfigured({
      host: '',
      port: 26,
      encryption: 'none',
      user: '',
      pass: '',
      from: '',
      adminEmail: '',
    })).toBe(false);
  });

  it('parses PMG-style encryption aliases', () => {
    expect(parseSmtpEncryption('none')).toBe('none');
    expect(parseSmtpEncryption('STARTTLS')).toBe('starttls');
    expect(parseSmtpEncryption('ssl')).toBe('tls');
  });

  it('keeps an existing password when overlay pass is empty', () => {
    const merged = mergeSmtpConfig(
      { ...smtpConfigFromEnv(), host: 'pmg.local', from: 'a@b.com', pass: 'secret' },
      { pass: '' },
    );
    expect(merged.pass).toBe('secret');
  });
});

describe('email templates', () => {
  it('includes the reset URL', () => {
    const mail = passwordResetEmail({ resetUrl: 'http://localhost:3000/reset-password?token=abc' });
    expect(mail.text).toContain('token=abc');
    expect(mail.html).toContain('token=abc');
  });

  it('does not include a password in account-ready copy', () => {
    const mail = accountApprovedEmail({ loginUrl: 'http://localhost:3000/login' });
    expect(mail.text.toLowerCase()).not.toContain('password:');
  });
});

describe('nodemailer json transport', () => {
  it('sends through jsonTransport without a real SMTP server', async () => {
    const result = await sendMail(
      { to: 'user@example.com', ...testEmail({ to: 'user@example.com' }) },
      {
        host: 'pmg.example.com',
        port: 26,
        encryption: 'none',
        from: 'noreply@example.com',
        jsonTransport: true,
      },
    );
    expect(result.skipped).toBe(false);
    expect(result.json).toBeTruthy();
    expect(result.json).toContain('user@example.com');
  });

  it('builds a non-TLS transporter for PMG internal relay', () => {
    const transporter = createTransporter({
      host: '10.0.0.5',
      port: 26,
      encryption: 'none',
      user: '',
      pass: '',
      from: 'noreply@example.com',
      adminEmail: '',
    });
    expect(transporter).toBeTruthy();
  });
});
