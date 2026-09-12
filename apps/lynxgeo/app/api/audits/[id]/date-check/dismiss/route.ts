import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { geoAuthHttpStatus, requireGeoUser } from '@/lib/auth';
import { getGeoDb } from '@/lib/db';
import { audits } from '@/lib/db/schema';
import {
  needsNewsListingPrompt,
  parseCategoryScoresBlob,
  withNewsListingDismissed,
} from '@/lib/geo/news-listing-prompt';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireGeoUser();
    const { id } = await params;
    const geoDb = getGeoDb(session.id);
    const [source] = await geoDb
      .select()
      .from(audits)
      .where(and(eq(audits.id, id), eq(audits.userId, session.id)))
      .limit(1);
    if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (source.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Only completed audits can dismiss the date prompt' }, { status: 409 });
    }

    const scores = parseCategoryScoresBlob(source.categoryScores);
    if (!needsNewsListingPrompt(scores) && !scores.needsNewsListing) {
      return NextResponse.json({ error: 'No news listing prompt to dismiss' }, { status: 409 });
    }

    const next = withNewsListingDismissed(scores);
    const [audit] = await geoDb
      .update(audits)
      .set({
        categoryScores: JSON.stringify(next),
        updatedAt: new Date(),
      })
      .where(eq(audits.id, id))
      .returning();

    return NextResponse.json({ audit, newsListingPrompt: next.newsListingPrompt });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to dismiss date prompt';
    return NextResponse.json({ error: message }, { status: geoAuthHttpStatus(error) });
  }
}
