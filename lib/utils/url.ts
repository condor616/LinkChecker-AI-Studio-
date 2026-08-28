export function canonicalizeScanUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());

    const protocol = url.protocol.toLowerCase();
    const hostname = url.hostname.toLowerCase();
    const isDefaultPort =
      (protocol === 'http:' && url.port === '80') ||
      (protocol === 'https:' && url.port === '443');
    const port = url.port && !isDefaultPort ? `:${url.port}` : '';

    let pathname = url.pathname || '/';
    pathname = pathname.replace(/\/+$/, '');
    if (!pathname) pathname = '/';

    return `${protocol}//${hostname}${port}${pathname}${url.search}${url.hash}`;
  } catch {
    return rawUrl.trim();
  }
}

export function getUrlWithoutHash(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());
    url.hash = '';
    return canonicalizeScanUrl(url.toString());
  } catch {
    return rawUrl.trim();
  }
}

/** Strip the fragment for HTTP fetch, keeping path/query/trailing slash intact. */
export function getFetchUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());
    url.hash = '';
    return url.href;
  } catch {
    return rawUrl.trim();
  }
}

function stripWwwHost(canonicalUrl: string): string {
  return canonicalUrl.replace(/^(https?:\/\/)www\./i, '$1');
}

export function isWithinStartPathScope(startUrl: string, currentUrl: string): boolean {
  try {
    const start = new URL(startUrl);
    const current = new URL(currentUrl);

    const startHost = start.hostname.toLowerCase().replace(/^www\./, '');
    const currentHost = current.hostname.toLowerCase().replace(/^www\./, '');

    if (startHost !== currentHost) {
      return false;
    }

    const normalizePath = (pathname: string): string => {
      const cleaned = (pathname || '/').replace(/\/+$/, '');
      return cleaned || '/';
    };

    const startPath = normalizePath(start.pathname);
    const currentPath = normalizePath(current.pathname);

    if (startPath === '/') {
      return true;
    }

    return currentPath === startPath || currentPath.startsWith(`${startPath}/`);
  } catch {
    return false;
  }
}

export function isTargetUrlMatch(candidateUrl: string, targetUrl: string): boolean {
  const canonicalCandidate = stripWwwHost(canonicalizeScanUrl(candidateUrl));
  const canonicalTarget = stripWwwHost(canonicalizeScanUrl(targetUrl));

  if (canonicalCandidate === canonicalTarget) {
    return true;
  }

  if (canonicalTarget.includes('?') || canonicalTarget.includes('#')) {
    return false;
  }

  return (
    canonicalCandidate.startsWith(`${canonicalTarget}#`) ||
    canonicalCandidate.startsWith(`${canonicalTarget}?`)
  );
}
