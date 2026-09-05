import { describe, expect, it } from 'vitest';
import { computeSiteHealthScore, healthScoreMessage } from '@/lib/utils/site-health-score';

describe('computeSiteHealthScore', () => {
  it('matches healthy / verified for the reported dashboard case (~84%)', () => {
    const result = computeSiteHealthScore({
      success: 2441,
      broken: 472,
      pending: 0,
      skipped: 10,
      total: 2923,
    });
    expect(result.score).toBe(84);
    expect(result.failureRate).toBe(16);
    expect(result.verified).toBe(2913);
    expect(result.message).toContain('Needs attention');
  });

  it('returns 100 when every verified link is healthy', () => {
    const result = computeSiteHealthScore({ success: 100, broken: 0, skipped: 5 });
    expect(result.score).toBe(100);
    expect(result.failureRate).toBe(0);
    expect(result.message).toContain('Perfect Health');
  });

  it('caps below 100 when any link is broken', () => {
    const result = computeSiteHealthScore({ success: 999, broken: 1 });
    expect(result.score).toBe(99);
    expect(result.failureRate).toBe(0); // rounds to 0% of 1000
  });

  it('returns null while only pending/processing results exist', () => {
    const result = computeSiteHealthScore({
      success: 0,
      broken: 0,
      pending: 50,
      processing: 10,
      total: 60,
    });
    expect(result.score).toBeNull();
    expect(result.message).toContain('Scan in progress');
  });

  it('returns null when everything was skipped', () => {
    const result = computeSiteHealthScore({
      success: 0,
      broken: 0,
      skipped: 20,
      total: 20,
    });
    expect(result.score).toBeNull();
    expect(result.message).toContain('No checkable links');
  });

  it('returns null for an empty scan', () => {
    const result = computeSiteHealthScore({ success: 0, broken: 0, total: 0 });
    expect(result.score).toBeNull();
    expect(result.message).toContain('No links discovered');
  });

  it('scores partial results while the scan is still running', () => {
    const result = computeSiteHealthScore({
      success: 80,
      broken: 20,
      pending: 100,
      total: 200,
    });
    expect(result.score).toBe(80);
    expect(result.failureRate).toBe(20);
    expect(result.message).toContain('checked so far');
  });

  it('treats non-finite counts as zero', () => {
    const result = computeSiteHealthScore({
      success: Number.NaN as unknown as number,
      broken: -5,
      pending: Infinity as unknown as number,
      total: 0,
    });
    expect(result.score).toBeNull();
    expect(result.verified).toBe(0);
  });

  it('uses critical copy for very low scores', () => {
    expect(healthScoreMessage(10)).toContain('Critical state');
    expect(healthScoreMessage(null)).toContain('Waiting');
  });
});
