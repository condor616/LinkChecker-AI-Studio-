/** Path extensions GEO must not crawl or score as HTML pages. */
const GEO_DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'docm',
  'xls',
  'xlsx',
  'xlsm',
  'ppt',
  'pptx',
  'pptm',
  'odt',
  'ods',
  'odp',
  'rtf',
  'xml',
  'txt',
  'json',
]);

/** True when the URL pathname ends with a document extension (case-insensitive). */
export function isGeoDocumentUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, '');
    const dot = pathname.lastIndexOf('.');
    if (dot < 0) return false;
    return GEO_DOCUMENT_EXTENSIONS.has(pathname.slice(dot + 1).toLowerCase());
  } catch {
    return false;
  }
}

/** True when Content-Type indicates a document rather than HTML. */
export function isGeoDocumentContentType(contentType: string | null | undefined): boolean {
  const type = (contentType || '').toLowerCase();
  if (!type) return false;
  if (type.includes('html')) return false;
  return (
    type.includes('application/pdf') ||
    type.includes('application/msword') ||
    type.includes('application/vnd.ms-excel') ||
    type.includes('application/vnd.ms-powerpoint') ||
    type.includes('application/vnd.openxmlformats-officedocument') ||
    type.includes('application/vnd.oasis.opendocument') ||
    type.includes('application/rtf') ||
    type.includes('text/rtf') ||
    type.includes('xml') ||
    type === 'text/plain' ||
    type.includes('application/json')
  );
}

/** True when this URL must never receive HTML page checks (title, H1, canonical, etc.). */
export function isGeoNonHtmlTarget(url: string): boolean {
  return isGeoDocumentUrl(url) || isGeoNonPageFile(url);
}

/** True when a fetched resource should be scored with HTML page checks (title, H1, etc.). */
export function isGeoHtmlPage(
  resource: { url: string; contentType?: string | null; bodyText?: string | null },
  html: string | null,
): boolean {
  if (isGeoNonHtmlTarget(resource.url)) return false;
  if (isGeoDocumentContentType(resource.contentType)) return false;
  const type = (resource.contentType || '').toLowerCase();
  const looksLikeHtmlType = type.includes('html') || type.includes('xhtml');
  const body = (html || resource.bodyText || '').trimStart();
  if (/^<(urlset|sitemapindex)\b/i.test(body)) return false;
  if (body.startsWith('<?xml') && !looksLikeHtmlType && !/<html[\s>]|<!DOCTYPE html/i.test(body)) return false;
  if (html) return true;
  if (looksLikeHtmlType) return true;
  if (body.startsWith('<!DOCTYPE html') || /^<html[\s>]/i.test(body)) return true;
  return false;
}

/** True when the URL is a known non-page discovery/config file (robots.txt, sitemap*, etc) that should never be crawled as a page. */
export function isGeoNonPageFile(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    // Never crawl these as pages - they are site discovery/configuration files
    return (
      pathname === '/robots.txt' ||
      pathname === '/.well-known/mcp.json' ||
      pathname === '/.well-known/tdmrep.json' ||
      /^.*\/sitemap[^/]*\.xml/.test(pathname) || // sitemap.xml, sitemap-index.xml, sitemap_1.xml, etc
      pathname === '/llms.txt' ||
      pathname === '/llms-full.txt'
    );
  } catch {
    return false;
  }
}
