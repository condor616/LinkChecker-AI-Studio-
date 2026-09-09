import { describe, it, expect } from 'vitest';
import { isAuthGatedResponse } from '../../packages/crawler-core/src/fetch';

function fakeResponse(status: number, headers: Record<string, string> = {}, url = 'https://example.com/') {
  return {
    status,
    url,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null,
    },
  } as unknown as Response;
}

describe('isAuthGatedResponse', () => {
  it('treats WWW-Authenticate as auth-gated', () => {
    expect(
      isAuthGatedResponse(
        fakeResponse(401, { 'www-authenticate': 'Basic realm="x"' }),
        'https://example.com/secret',
        'Unauthorized',
      ),
    ).toBe(true);
  });

  it('treats login copy as auth-gated', () => {
    expect(
      isAuthGatedResponse(
        fakeResponse(403),
        'https://example.com/docs',
        '<html>Please log in to continue</html>',
      ),
    ).toBe(true);
  });

  it('does not treat Akamai Access Denied bot blocks as auth-gated', () => {
    const body = `<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD><BODY>
      <H1>Access Denied</H1>
      You don't have permission to access "http://www.jnj.com/" on this server.
      Reference #18.49b62417
      https://errors.edgesuite.net/18.49b62417
    </BODY></HTML>`;
    expect(isAuthGatedResponse(fakeResponse(403, { server: 'AkamaiGHost' }), 'https://www.jnj.com/', body)).toBe(
      false,
    );
  });

  it('does not treat a bare Forbidden body as auth-gated', () => {
    expect(isAuthGatedResponse(fakeResponse(403), 'https://example.com/page', 'Forbidden')).toBe(false);
  });
});
