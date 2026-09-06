function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrap(title: string, body: string): { subject: string; text: string; html: string } {
  return {
    subject: title,
    text: body,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <h1 style="font-size:18px">${escapeHtml(title)}</h1>
  <p style="white-space:pre-wrap">${escapeHtml(body)}</p>
</div>`,
  };
}

export function pendingSignupAdminEmail(opts: { email: string; reviewUrl: string }) {
  return wrap(
    'New LynxScan user awaiting approval',
    `A new user registered and is waiting for approval.\n\nEmail: ${opts.email}\nReview: ${opts.reviewUrl}`,
  );
}

export function accountApprovedEmail(opts: { loginUrl: string }) {
  return wrap(
    'Your LynxScan account has been approved',
    `Your account is now active. You can sign in here:\n${opts.loginUrl}`,
  );
}

export function accountCreatedEmail(opts: { loginUrl: string }) {
  return wrap(
    'Your LynxScan account is ready',
    `An administrator created an account for you. Sign in here:\n${opts.loginUrl}\n\nIf you were not given a password, use Forgot password on the login page.`,
  );
}

export function passwordResetEmail(opts: { resetUrl: string }) {
  return wrap(
    'Reset your LynxScan password',
    `Use this link to choose a new password (expires in 1 hour):\n${opts.resetUrl}\n\nIf you did not request this, you can ignore this email.`,
  );
}

export function testEmail(opts: { to: string }) {
  return wrap(
    'LynxScan SMTP test',
    `This is a test message from LynxScan, sent to ${opts.to} through your configured SMTP server.`,
  );
}
