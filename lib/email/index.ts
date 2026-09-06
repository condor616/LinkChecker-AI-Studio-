export { getAppBaseUrl, isSmtpConfigured, smtpConfigFromEnv, toPublicSmtpConfig, type SmtpConfig } from './config';
export { createTransporter, getSmtpConfig, saveSmtpConfig, sendMail, sendMailSafe } from './mailer';
export {
  notifyAdminsOfPendingSignup,
  notifyUserAccountCreated,
  notifyUserApproved,
  sendPasswordResetEmail,
} from './notifications';
export * as emailTemplates from './templates';
