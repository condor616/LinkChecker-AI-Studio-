import { NextResponse } from 'next/server';
import { requireApprovedUser } from '@/lib/auth';
import { isFlareSolverrConfigured } from '@/lib/crawler/flaresolverr';

export async function GET() {
  try {
    await requireApprovedUser();
    return NextResponse.json({
      flareSolverr: isFlareSolverrConfigured(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Unauthorized' }, { status: 401 });
  }
}
