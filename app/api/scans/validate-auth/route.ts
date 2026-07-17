import { NextResponse } from 'next/server';
import { requireApprovedUser } from '@/lib/auth';
import { ScanAuthValidationSchema } from '@/lib/validation/schemas';

export async function POST(req: Request) {
  try {
    await requireApprovedUser();

    const { startUrl, auth } = ScanAuthValidationSchema.parse(await req.json());
    const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');

    const response = await fetch(startUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Authorization: `Basic ${encoded}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (response.status === 401) {
      return NextResponse.json(
        { valid: false, message: 'Invalid HTTP Basic credentials (401 Unauthorized).' },
        { status: 401 },
      );
    }

    if (response.status >= 200 && response.status < 400) {
      return NextResponse.json({
        valid: true,
        message: `Credentials validated successfully (HTTP ${response.status}).`,
      });
    }

    return NextResponse.json(
      {
        valid: false,
        message: `Target responded with HTTP ${response.status}. Credentials may be valid, but access to the start URL is not successful.`,
      },
      { status: 400 },
    );
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid request payload', details: error.issues }, { status: 400 });
    }

    if (error?.message === 'Unauthorized' || error?.message?.startsWith('Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    const reason = error?.cause?.message ? `${error.message} | cause: ${error.cause.message}` : error?.message;
    return NextResponse.json(
      { valid: false, message: `Credential check failed: ${reason || 'Unknown error'}` },
      { status: 500 },
    );
  }
}
