import { describe, it, expect } from 'vitest';
import {
  FAILED_CLOUDFLARE_CHALLENGE,
  formatChallengeError,
  isCloudflareChallenge,
} from '../../packages/crawler-core/src/challenge';

describe('isCloudflareChallenge', () => {
  it('detects cf-mitigated challenge header', () => {
    expect(
      isCloudflareChallenge(403, { 'cf-mitigated': 'challenge', 'cf-ray': 'abc' }, ''),
    ).toBe(true);
  });

  it('does not flag a healthy Cloudflare-hosted 200 page', () => {
    expect(
      isCloudflareChallenge(
        200,
        { server: 'cloudflare', 'cf-ray': 'abc-ZRH' },
        '<html><title>Beamery Pages</title><script src="https://cdnjs.cloudflare.com/ajax/libs/x.js"></script><body>Beamery Pages</body></html>',
      ),
    ).toBe(false);
  });

  it('still flags a Just a moment interstitial on 200', () => {
    expect(
      isCloudflareChallenge(
        200,
        { server: 'cloudflare', 'cf-ray': 'abc' },
        '<html><title>Just a moment...</title><div id="challenge-platform"></div></html>',
      ),
    ).toBe(true);
  });

  it('detects Checking your browser body', () => {
    expect(
      isCloudflareChallenge(503, { 'cf-ray': 'x' }, 'Checking your browser before accessing'),
    ).toBe(true);
  });

  it('does not flag a normal 200 page', () => {
    expect(
      isCloudflareChallenge(200, { 'content-type': 'text/html' }, '<html><body>Hello world</body></html>'),
    ).toBe(false);
  });

  it('does not flag a plain 403 without CF markers', () => {
    expect(
      isCloudflareChallenge(403, {}, 'Forbidden'),
    ).toBe(false);
  });

  it('exports the exact user-facing error string', () => {
    expect(FAILED_CLOUDFLARE_CHALLENGE).toBe('Failed Cloudflare Challenge');
  });

  it('formats HTTP diagnostics for the UI', () => {
    const msg = formatChallengeError({
      statusCode: 403,
      headers: { server: 'cloudflare', 'cf-ray': 'abc-ZRH', 'cf-mitigated': 'challenge' },
      bodyPreview: '<html><title>Just a moment...</title><body>Checking your browser</body></html>',
    });
    expect(msg).toContain('Failed Cloudflare Challenge');
    expect(msg).toContain('HTTP 403');
    expect(msg).toContain('Server: cloudflare');
    expect(msg).toContain('cf-ray: abc-ZRH');
    expect(msg).toContain('WAF: Cloudflare');
    expect(msg).toContain('Title: Just a moment...');
    expect(msg).toContain('Body:');
  });

  it('labels Akamai responses clearly', () => {
    const msg = formatChallengeError({
      statusCode: 403,
      headers: { server: 'AkamaiGHost' },
      bodyPreview: '<HTML><TITLE>Access Denied</TITLE><H1>Access Denied</H1>edgesuite.net</HTML>',
    });
    expect(msg).toContain('WAF: Akamai');
  });
});
