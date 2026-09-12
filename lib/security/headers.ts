import { NextResponse } from 'next/server';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-DNS-Prefetch-Control': 'off',
};

export function applySecurityHeaders(response: NextResponse, requestUrl?: string): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // HSTS only on HTTPS (production / reverse-proxy terminations).
  try {
    if (requestUrl && new URL(requestUrl).protocol === 'https:') {
      response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  } catch {
    // ignore invalid URL
  }

  if (!response.headers.has('Content-Security-Policy')) {
    const isHttps = (() => {
      try {
        return !!requestUrl && new URL(requestUrl).protocol === 'https:';
      } catch {
        return false;
      }
    })();
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "connect-src 'self'",
        ...(isHttps ? ['upgrade-insecure-requests'] : []),
      ].join('; '),
    );
  }

  return response;
}

export function nextWithSecurityHeaders(requestUrl?: string): NextResponse {
  return applySecurityHeaders(NextResponse.next(), requestUrl);
}
