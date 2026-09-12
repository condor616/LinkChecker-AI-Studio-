import type { CrawlConfig, FetchedResource } from './types';
import { getFetchUrl } from './url';
import { assertSafeOutboundUrl } from './ssrf';
import { getTraversalSkipReason } from './exclude';
import { formatChallengeError, isCloudflareChallenge } from './challenge';

function looksLikeAuthPath(url: string): boolean {
  const lower = url.toLowerCase();
  return /(\/|^)(login|log-in|signin|sign-in|auth|oauth|sso)(\/|\?|#|$)/.test(lower);
}

export function isAuthGatedResponse(response: Response, requestUrl: string, bodyPreview: string): boolean {
  if (response.status !== 401 && response.status !== 403) {
    return false;
  }

  const authHeader = (response.headers.get('www-authenticate') || '').toLowerCase();
  if (authHeader) {
    return true;
  }

  const location = (response.headers.get('location') || '').toLowerCase();
  if (location && /(login|signin|sign-in|auth|oauth|sso)/.test(location)) {
    return true;
  }

  const finalUrl = (response.url || requestUrl || '').toLowerCase();
  if (finalUrl && looksLikeAuthPath(finalUrl)) {
    return true;
  }

  const body = bodyPreview.toLowerCase();
  // Require login-oriented copy. Do NOT match bare "access denied" / "forbidden" —
  // Akamai and other WAFs use those phrases for bot blocks, which are broken links,
  // not auth walls.
  return /(authentication required|please log in|please login|log in to continue|sign in to continue|single sign-on|\bsso\b|invalid credentials|bad credentials)/.test(
    body,
  );
}

function mergeCookieHeader(
  existing: string | undefined,
  setCookieHeaders: string[],
): string | undefined {
  const jar = new Map<string, string>();
  if (existing) {
    for (const part of existing.split(';')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      jar.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
    }
  }
  for (const raw of setCookieHeaders) {
    const first = raw.split(';')[0]?.trim();
    if (!first) continue;
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    jar.set(first.slice(0, eq), first.slice(eq + 1));
  }
  if (jar.size === 0) return existing;
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function getSetCookieHeaders(response: Response): string[] {
  const headersAny = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headersAny.getSetCookie === 'function') {
    return headersAny.getSetCookie();
  }
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

export async function fetchWithRedirects(
  inputUrl: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  maxRedirects = 5,
  options?: { startUrl?: string },
): Promise<Response> {
  let currentUrl = inputUrl;
  const hopHeaders = { ...headers };

  for (let i = 0; i <= maxRedirects; i++) {
    const response = await fetch(currentUrl, {
      signal,
      headers: hopHeaders,
      redirect: 'manual',
    });

    const setCookies = getSetCookieHeaders(response);
    if (setCookies.length > 0) {
      const merged = mergeCookieHeader(hopHeaders.Cookie || hopHeaders.cookie, setCookies);
      if (merged) {
        hopHeaders.Cookie = merged;
      }
    }

    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get('location');
    if (!location) {
      return response;
    }

    const nextUrl = new URL(location, currentUrl).toString();
    const safety = await assertSafeOutboundUrl(nextUrl, { startUrl: options?.startUrl });
    if (!safety.ok) {
      throw new Error(`Redirect blocked by SSRF protection: ${safety.reason}`);
    }
    currentUrl = nextUrl;
  }

  throw new Error(`Too many redirects for ${inputUrl}`);
}

export function buildBrowserHeaders(config: CrawlConfig): Record<string, string> {
  const userAgent =
    config.customUserAgent ||
    config.userAgent ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'sec-fetch-dest': 'document',
  };
  if (config.auth && config.auth.username && config.auth.password) {
    const auth = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64');
    headers.Authorization = `Basic ${auth}`;
  }
  return headers;
}

async function peekBodyPreview(response: Response): Promise<{ bodyText: string | null; preview: string }> {
  const contentType = (response.headers.get('content-type') || '').split(';')[0];
  const isTextual =
    contentType.includes('text') ||
    contentType.includes('json') ||
    contentType.includes('xml') ||
    contentType.includes('html') ||
    contentType.includes('markdown') ||
    !contentType;

  if (!isTextual) {
    return { bodyText: null, preview: '' };
  }

  try {
    const bodyText = await response.text();
    return { bodyText, preview: bodyText.slice(0, 4000) };
  } catch {
    return { bodyText: null, preview: '' };
  }
}

function headersToMap(response: Response): Record<string, string> {
  const headerMap: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headerMap[key.toLowerCase()] = value;
  });
  return headerMap;
}

export async function fetchResource(url: string, config: CrawlConfig, extraHeaders?: Record<string, string>): Promise<FetchedResource> {
  const fetchUrl = getFetchUrl(url);
  const empty: FetchedResource = {
    url,
    fetchUrl,
    ok: false,
    statusCode: null,
    contentType: '',
    headers: {},
    bodyText: null,
    blockedBySsrf: false,
    authGated: false,
    challenged: false,
    skipReason: null,
    error: null,
  };

  const outbound = await assertSafeOutboundUrl(url, { startUrl: config.startUrl });
  if (!outbound.ok) {
    return { ...empty, blockedBySsrf: true, error: outbound.reason };
  }

  if (config.randomDelay && config.randomDelay > 0) {
    const delay = Math.floor(Math.random() * config.randomDelay);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const headers = { ...buildBrowserHeaders(config), ...extraHeaders };

  try {
    let response = await fetchWithRedirects(fetchUrl, headers, controller.signal, 5, {
      startUrl: config.startUrl,
    });
    let headerMap = headersToMap(response);
    let { bodyText, preview } = await peekBodyPreview(response);

    // Detect challenges before auth-gated heuristics and before the smart retry.
    if (isCloudflareChallenge(response.status, headerMap, preview)) {
      const skipReason = getTraversalSkipReason(url, config, 'BROKEN');
      return {
        url,
        fetchUrl,
        ok: false,
        statusCode: response.status,
        contentType: (response.headers.get('content-type') || '').split(';')[0],
        headers: headerMap,
        bodyText,
        blockedBySsrf: false,
        authGated: false,
        challenged: true,
        skipReason,
        error: formatChallengeError({
          statusCode: response.status,
          headers: headerMap,
          bodyPreview: preview || bodyText,
        }),
      };
    }

    // Smart retry: keep the scan User-Agent; only strip browser-like extras.
    if (!response.ok && (response.status === 403 || response.status === 400 || response.status === 429)) {
      const userAgent = headers['User-Agent'] || headers['user-agent'] || buildBrowserHeaders(config)['User-Agent'];
      const fallbackHeaders: Record<string, string> = {
        'User-Agent': userAgent,
        Accept: '*/*',
      };
      if (headers.Authorization) fallbackHeaders.Authorization = headers.Authorization;
      if (headers.Cookie) fallbackHeaders.Cookie = headers.Cookie;

      const retryResponse = await fetchWithRedirects(fetchUrl, fallbackHeaders, controller.signal, 5, {
        startUrl: config.startUrl,
      });
      const retryHeaders = headersToMap(retryResponse);
      const retryPeek = await peekBodyPreview(retryResponse);

      if (isCloudflareChallenge(retryResponse.status, retryHeaders, retryPeek.preview)) {
        const skipReason = getTraversalSkipReason(url, config, 'BROKEN');
        return {
          url,
          fetchUrl,
          ok: false,
          statusCode: retryResponse.status,
          contentType: (retryResponse.headers.get('content-type') || '').split(';')[0],
          headers: retryHeaders,
          bodyText: retryPeek.bodyText,
          blockedBySsrf: false,
          authGated: false,
          challenged: true,
          skipReason,
          error: formatChallengeError({
            statusCode: retryResponse.status,
            headers: retryHeaders,
            bodyPreview: retryPeek.preview || retryPeek.bodyText,
            note: 'After smart-retry with minimal headers',
          }),
        };
      }

      if (retryResponse.ok || (retryResponse.status !== 403 && retryResponse.status !== 400)) {
        response = retryResponse;
        headerMap = retryHeaders;
        bodyText = retryPeek.bodyText;
        preview = retryPeek.preview;
      }
    }

    const contentType = (response.headers.get('content-type') || '').split(';')[0];
    const skipReason = getTraversalSkipReason(url, config, response.ok ? 'SUCCESS' : 'BROKEN');
    const authGated =
      !response.ok &&
      !isCloudflareChallenge(response.status, headerMap, preview) &&
      isAuthGatedResponse(response, url, preview.slice(0, 1000) || '');

    return {
      url,
      fetchUrl,
      ok: response.ok,
      statusCode: response.status,
      contentType,
      headers: headerMap,
      bodyText,
      blockedBySsrf: false,
      authGated,
      challenged: false,
      skipReason,
      error: response.ok
        ? skipReason
        : authGated
          ? `Auth-gated resource (${response.status}) - not treated as broken`
          : bodyText
            ? `[Response] ${bodyText.slice(0, 500)}`
            : `[Status] ${response.statusText || 'Error'}`,
    };
  } catch (error: any) {
    const errorMsg = error.name === 'AbortError' ? 'Timeout (15s limit)' : error.message;
    return { ...empty, error: errorMsg };
  } finally {
    clearTimeout(timeoutId);
  }
}
