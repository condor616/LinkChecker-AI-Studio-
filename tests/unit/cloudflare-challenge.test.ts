import { describe, it, expect } from 'vitest';
import {
  FAILED_CLOUDFLARE_CHALLENGE,
  formatChallengeError,
  isChromiumNetErrorPage,
  isCloudflareChallenge,
  parseChromiumNetErrorStatus,
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

describe('parseChromiumNetErrorStatus', () => {
  const chrome404 = `<!DOCTYPE html>
<html><head><title>www.lilly.com</title>
<style>${'x'.repeat(5000)}</style>
</head>
<body>
  <div class="icon icon-generic"></div>
  <div class="neterror">
    <div class="error-code">HTTP ERROR 404</div>
    <p>This www.lilly.com page can’t be found</p>
  </div>
  <script>function getMainFrameErrorIconCssClass(){}</script>
</body></html>`;

  it('extracts HTTP ERROR status from Chromium net-error pages past the first 4KB', () => {
    expect(parseChromiumNetErrorStatus(chrome404)).toBe(404);
    expect(isChromiumNetErrorPage(chrome404)).toBe(true);
  });

  it('does not treat a marketing page that mentions HTTP ERROR as a net-error', () => {
    const html = '<html><body><p>We documented HTTP ERROR 404 handling in our guide.</p></body></html>';
    expect(parseChromiumNetErrorStatus(html)).toBeNull();
    expect(isChromiumNetErrorPage(html)).toBe(false);
  });

  it('does not flag a real sitemap XML body', () => {
    const xml =
      '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://example.com/a.xml</loc></sitemap></sitemapindex>';
    expect(parseChromiumNetErrorStatus(xml)).toBeNull();
  });

  it('returns null for empty or unrelated HTML', () => {
    expect(parseChromiumNetErrorStatus('')).toBeNull();
    expect(parseChromiumNetErrorStatus('<html><body>ok</body></html>')).toBeNull();
  });
});
