/** Interactive news-article date prompt metadata stored on audit.categoryScores. */

export type NewsListingPromptStatus = 'pending' | 'dismissed' | 'started' | 'checked';

export type NewsListingPrompt = {
  status: NewsListingPromptStatus;
  at?: string;
  listingUrl?: string;
  articleUrl?: string;
  followUpAuditId?: string;
};

export type CategoryScoresBlob = {
  crawlAccess?: number;
  extractability?: number;
  negotiation?: number;
  discovery?: number;
  citeability?: number;
  playbook?: unknown;
  needsNewsListing?: boolean;
  newsListingPrompt?: NewsListingPrompt;
  [key: string]: unknown;
};

export function parseCategoryScoresBlob(raw: string | null | undefined): CategoryScoresBlob {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as CategoryScoresBlob;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function needsNewsListingPrompt(blob: CategoryScoresBlob): boolean {
  if (!blob.needsNewsListing) return false;
  const status = blob.newsListingPrompt?.status;
  return !status || status === 'pending';
}

export function withNewsListingPending(blob: CategoryScoresBlob): CategoryScoresBlob {
  return {
    ...blob,
    needsNewsListing: true,
    newsListingPrompt: { status: 'pending' },
  };
}

export function withNewsListingDismissed(blob: CategoryScoresBlob): CategoryScoresBlob {
  return {
    ...blob,
    needsNewsListing: true,
    newsListingPrompt: { status: 'dismissed', at: new Date().toISOString() },
  };
}

/** @deprecated Prefer withNewsListingChecked — follow-up audits are no longer created. */
export function withNewsListingStarted(
  blob: CategoryScoresBlob,
  listingUrl: string,
  followUpAuditId: string,
): CategoryScoresBlob {
  return {
    ...blob,
    needsNewsListing: true,
    newsListingPrompt: {
      status: 'started',
      at: new Date().toISOString(),
      listingUrl,
      followUpAuditId,
    },
  };
}

/** In-place article date check completed on the same discovery audit. */
export function withNewsListingChecked(blob: CategoryScoresBlob, articleUrl: string): CategoryScoresBlob {
  return {
    ...blob,
    needsNewsListing: false,
    newsListingPrompt: {
      status: 'checked',
      at: new Date().toISOString(),
      articleUrl,
    },
  };
}
