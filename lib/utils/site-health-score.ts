/**
 * Site Health Score from verified link outcomes (SUCCESS + BROKEN).
 * Pending / skipped / processing links are excluded from the denominator
 * so an in-progress or heavily-skipped scan does not falsely collapse the score.
 */

export type SiteHealthInput = {
  success: number;
  broken: number;
  pending?: number;
  skipped?: number;
  processing?: number;
  /** Optional explicit total; defaults to sum of known buckets. */
  total?: number;
};

export type SiteHealthResult = {
  /** 0–100, or null when there are not enough verified results yet. */
  score: number | null;
  verified: number;
  /** Broken share of verified links (0–100), or 0 when none verified. */
  failureRate: number;
  message: string;
};

function clampCount(n: number | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function healthScoreMessage(score: number | null): string {
  if (score === null) return 'Waiting for verified link results.';
  if (score === 100) return 'Perfect Health! No broken links found.';
  if (score > 90) return 'Excellent. Minor issues to resolve.';
  if (score > 70) return 'Needs attention. Several broken links discovered.';
  if (score > 40) return 'Warning. Moderate impact on user experience.';
  return 'Critical state. Immediate action required. Your SEO and UX are at risk.';
}

export function computeSiteHealthScore(input: SiteHealthInput): SiteHealthResult {
  const success = clampCount(input.success);
  const broken = clampCount(input.broken);
  const pending = clampCount(input.pending);
  const skipped = clampCount(input.skipped);
  const processing = clampCount(input.processing);
  const total =
    input.total !== undefined
      ? clampCount(input.total)
      : success + broken + pending + skipped + processing;

  const verified = success + broken;
  const inFlight = pending + processing;

  if (total === 0) {
    return {
      score: null,
      verified: 0,
      failureRate: 0,
      message: 'No links discovered yet.',
    };
  }

  if (verified === 0) {
    if (inFlight > 0) {
      return {
        score: null,
        verified: 0,
        failureRate: 0,
        message: 'Scan in progress. Health score will appear as links are checked.',
      };
    }
    return {
      score: null,
      verified: 0,
      failureRate: 0,
      message: 'No checkable links. Discovered links were skipped or excluded.',
    };
  }

  // healthy / checkable === 100 − failure rate among verified links
  let score = Math.round((success / verified) * 100);
  if (broken > 0 && score === 100) score = 99;
  score = Math.max(0, Math.min(100, score));

  const failureRate = Math.round((broken / verified) * 100);
  let message = healthScoreMessage(score);
  if (inFlight > 0) {
    message = `${message} (based on ${verified.toLocaleString()} checked so far)`;
  }

  return { score, verified, failureRate, message };
}
