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
  const canonicalCandidate = canonicalizeScanUrl(candidateUrl);
  const canonicalTarget = canonicalizeScanUrl(targetUrl);

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
