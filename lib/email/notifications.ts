import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getAppBaseUrl } from './config';
import { getSmtpConfig, sendMailSafe } from './mailer';
import {
  accountApprovedEmail,
  accountCreatedEmail,
  passwordResetEmail,
  pendingSignupAdminEmail,
} from './templates';

function uniqueEmails(emails: Array<string | null | undefined>): string[] {
  return [...new Set(emails.map((email) => email?.trim()).filter((email): email is string => Boolean(email)))];
}

async function adminRecipients(): Promise<string[]> {
  const config = await getSmtpConfig();
  const admins = await db.select({ email: users.email }).from(users).where(eq(users.role, 'ADMIN'));
  return uniqueEmails([...admins.map((row) => row.email), config.adminEmail]);
}

export async function notifyAdminsOfPendingSignup(email: string) {
  const recipients = await adminRecipients();
  if (recipients.length === 0) return;
  const content = pendingSignupAdminEmail({
    email,
    reviewUrl: `${getAppBaseUrl()}/admin/users`,
  });
  await sendMailSafe({ to: recipients, ...content });
}

export async function notifyUserApproved(email: string) {
  const content = accountApprovedEmail({ loginUrl: `${getAppBaseUrl()}/login` });
  await sendMailSafe({ to: email, ...content });
}

export async function notifyUserAccountCreated(email: string) {
  const content = accountCreatedEmail({ loginUrl: `${getAppBaseUrl()}/login` });
  await sendMailSafe({ to: email, ...content });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const content = passwordResetEmail({
    resetUrl: `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`,
  });
  await sendMailSafe({ to: email, ...content });
}
