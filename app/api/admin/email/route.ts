import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { SmtpSettingsUpdateSchema } from '@/lib/validation/schemas';
import { getSmtpConfig, saveSmtpConfig, toPublicSmtpConfig } from '@/lib/email';

export async function GET() {
  try {
    await requireAdmin();
    const config = await getSmtpConfig();
    return NextResponse.json({ smtp: toPublicSmtpConfig(config) });
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : error?.message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin();
    const body = SmtpSettingsUpdateSchema.parse(await req.json());
    const saved = await saveSmtpConfig({
      host: body.host,
      port: body.port,
      encryption: body.encryption,
      user: body.user,
      pass: body.pass,
      from: body.from,
      adminEmail: body.adminEmail,
    });
    return NextResponse.json({ smtp: toPublicSmtpConfig(saved) });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid SMTP settings', details: error.issues }, { status: 400 });
    }
    const status = error?.message === 'Unauthorized' ? 401 : error?.message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
