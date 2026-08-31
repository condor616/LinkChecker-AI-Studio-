import type { CrawlConfig, FetchedResource } from './types';
import { getFetchUrl, isSameOrSubdomain, normalizeHostname } from './url';
import { isSafeHostname } from './ssrf';
import { getTraversalSkipReason } from './exclude';

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
  return /(unauthorized|forbidden|access denied|authentication required|please log in|please login|log in to continue|sign in to continue|single sign-on|\bsso\b|invalid credentials|bad credentials)/.test(body);
}

export async function fetchWithRedirects(
  inputUrl: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  maxRedirects = 5,
): Promise<Response> {
  let currentUrl = inputUrl;

  for (let i = 0; i <= maxRedirects; i++) {
    const response = await fetch(currentUrl, {
      signal,
      headers,
      redirect: 'manual',
    });

    if (response.status < 300 || response.status >= 400) {
      return response;
    }

    const location = response.headers.get('location');
    if (!location) {
      return response;
    }

    currentUrl = new URL(location, currentUrl).toString();
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
    skipReason: null,
    error: null,
  };

  const currentTarget = new URL(url);
  const scanRootHost = normalizeHostname(new URL(config.startUrl).hostname);
  const targetHost = normalizeHostname(currentTarget.hostname);
  const isWithinStartHostScope = isSameOrSubdomain(targetHost, scanRootHost);
  const isSafeTarget = await isSafeHostname(currentTarget.hostname);
  if (!isSafeTarget && !isWithinStartHostScope) {
    return { ...empty, blockedBySsrf: true, error: 'Blocked by SSRF protection policy' };
  }

  if (config.randomDelay && config.randomDelay > 0) {
    const delay = Math.floor(Math.random() * config.randomDelay);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const headers = { ...buildBrowserHeaders(config), ...extraHeaders };

  try {
    let response = await fetchWithRedirects(fetchUrl, headers, controller.signal);

    if (!response.ok && (response.status === 403 || response.status === 400 || response.status === 429)) {
      const fallbackHeaders: Record<string, string> = {
        'User-Agent': 'curl/8.17.0',
        Accept: '*/*',
        'sec-fetch-mode': 'navigate',
      };
      if (headers.Authorization) fallbackHeaders.Authorization = headers.Authorization;
      const retryResponse = await fetchWithRedirects(fetchUrl, fallbackHeaders, controller.signal);
      if (retryResponse.ok || (retryResponse.status !== 403 && retryResponse.status !== 400)) {
        response = retryResponse;
      }
    }

    const contentType = (response.headers.get('content-type') || '').split(';')[0];
    const headerMap: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headerMap[key.toLowerCase()] = value;
    });

    let bodyText: string | null = null;
    const isTextual =
      contentType.includes('text') ||
      contentType.includes('json') ||
      contentType.includes('xml') ||
      contentType.includes('html') ||
      contentType.includes('markdown');
    if (isTextual) {
      try {
        bodyText = await response.text();
      } catch {
        bodyText = null;
      }
    }

    const skipReason = getTraversalSkipReason(url, config, response.ok ? 'SUCCESS' : 'BROKEN');
    const authGated = !response.ok && isAuthGatedResponse(response, url, bodyText?.slice(0, 1000) || '');

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
      skipReason,
      error: response.ok ? skipReason : `[Status] ${response.statusText || 'Error'}`,
    };
  } catch (error: any) {
    const errorMsg = error.name === 'AbortError' ? 'Timeout (15s limit)' : error.message;
    return { ...empty, error: errorMsg };
  } finally {
    clearTimeout(timeoutId);
  }
}
