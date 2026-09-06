import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { TestEmailSchema } from '@/lib/validation/schemas';
import { sendMail } from '@/lib/email';
import { testEmail } from '@/lib/email/templates';

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = TestEmailSchema.parse(await req.json());
    const content = testEmail({ to: body.to });
    const result = await sendMail(
      { to: body.to, ...content },
      body.config
        ? {
            host: body.config.host,
            port: body.config.port,
            encryption: body.config.encryption,
            user: body.config.user,
            pass: body.config.pass,
            from: body.config.from,
            adminEmail: body.config.adminEmail,
          }
        : undefined,
    );
    if (result.skipped) {
      return NextResponse.json({ error: result.reason || 'SMTP is not configured' }, { status: 400 });
    }
    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid request payload', details: error.issues }, { status: 400 });
    }
    const status = error?.message === 'Unauthorized' ? 401 : error?.message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to send test email' }, { status });
  }
}
