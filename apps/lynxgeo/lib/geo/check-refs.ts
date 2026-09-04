import { CRITERION_CATALOG } from './score';

export type CheckRefKind = 'rfc' | 'spec' | 'convention' | 'docs';

export type CheckRef = {
  /** Human label of the official document. */
  title: string;
  href: string;
  publisher: string;
  kind: CheckRefKind;
};

const RFC_9309: CheckRef = {
  title: 'RFC 9309 — Robots Exclusion Protocol',
  href: 'https://www.rfc-editor.org/rfc/rfc9309.html',
  publisher: 'IETF',
  kind: 'rfc',
};

const GOOGLE_ROBOTS: CheckRef = {
  title: 'Google Search — robots.txt and robots meta rules',
  href: 'https://developers.google.com/search/docs/crawling-indexing/robots/intro',
  publisher: 'Google',
  kind: 'docs',
};

const GOOGLE_CRAWLERS: CheckRef = {
  title: 'Google Search — common crawlers (Googlebot, Google-Extended)',
  href: 'https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers',
  publisher: 'Google',
  kind: 'docs',
};

const SITEMAP_PROTOCOL: CheckRef = {
  title: 'Sitemaps XML protocol',
  href: 'https://www.sitemaps.org/protocol.html',
  publisher: 'sitemaps.org',
  kind: 'spec',
};

const RFC_9110: CheckRef = {
  title: 'RFC 9110 — HTTP Semantics',
  href: 'https://www.rfc-editor.org/rfc/rfc9110.html',
  publisher: 'IETF',
  kind: 'rfc',
};

const RFC_7763: CheckRef = {
  title: 'RFC 7763 — The text/markdown Media Type',
  href: 'https://www.rfc-editor.org/rfc/rfc7763.html',
  publisher: 'IETF',
  kind: 'rfc',
};

const JSON_LD: CheckRef = {
  title: 'JSON-LD 1.1 — embedding in HTML documents',
  href: 'https://www.w3.org/TR/json-ld11/#embedding-json-ld-in-html-documents',
  publisher: 'W3C',
  kind: 'spec',
};

const HTML_TITLE: CheckRef = {
  title: 'HTML Living Standard — the title element',
  href: 'https://html.spec.whatwg.org/multipage/semantics.html#the-title-element',
  publisher: 'WHATWG',
  kind: 'spec',
};

const HTML_TIME: CheckRef = {
  title: 'HTML Living Standard — the time element',
  href: 'https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-time-element',
  publisher: 'WHATWG',
  kind: 'spec',
};

const HTML_H1: CheckRef = {
  title: 'HTML Living Standard — the h1–h6 elements',
  href: 'https://html.spec.whatwg.org/multipage/sections.html#the-h1,-h2,-h3,-h4,-h5,-and-h6-elements',
  publisher: 'WHATWG',
  kind: 'spec',
};

const HTML_LANG: CheckRef = {
  title: 'HTML Living Standard — the lang attribute',
  href: 'https://html.spec.whatwg.org/multipage/dom.html#the-lang-and-xml:lang-attributes',
  publisher: 'WHATWG',
  kind: 'spec',
};

const HTML_HREFLANG: CheckRef = {
  title: 'HTML Living Standard — rel=alternate (hreflang)',
  href: 'https://html.spec.whatwg.org/multipage/links.html#rel-alternate',
  publisher: 'WHATWG',
  kind: 'spec',
};

const HTML_CANONICAL: CheckRef = {
  title: 'HTML Living Standard — rel=canonical',
  href: 'https://html.spec.whatwg.org/multipage/links.html#link-type-canonical',
  publisher: 'WHATWG',
  kind: 'spec',
};

const HTML_NOSCRIPT: CheckRef = {
  title: 'HTML Living Standard — the noscript element',
  href: 'https://html.spec.whatwg.org/multipage/scripting.html#the-noscript-element',
  publisher: 'WHATWG',
  kind: 'spec',
};

const HTML_DOCUMENT: CheckRef = {
  title: 'HTML Living Standard — writing HTML documents',
  href: 'https://html.spec.whatwg.org/multipage/syntax.html#writing',
  publisher: 'WHATWG',
  kind: 'spec',
};

const LLMS_TXT: CheckRef = {
  title: 'llms.txt convention',
  href: 'https://llmstxt.org/',
  publisher: 'llmstxt.org',
  kind: 'convention',
};

const MCP_SPEC: CheckRef = {
  title: 'Model Context Protocol specification (2025-03-26)',
  href: 'https://modelcontextprotocol.io/specification/2025-03-26',
  publisher: 'Model Context Protocol',
  kind: 'spec',
};

/** Criterion key (see CRITERION_CATALOG) → official document behind the check. */
export const CHECK_REFS: Record<string, CheckRef> = {
  robots: RFC_9309,
  'bot-GPTBot': RFC_9309,
  'bot-OAI-SearchBot': RFC_9309,
  'bot-ChatGPT-User': RFC_9309,
  'bot-ClaudeBot': RFC_9309,
  'bot-PerplexityBot': RFC_9309,
  'bot-Googlebot': GOOGLE_CRAWLERS,
  'train-Google-Extended': GOOGLE_CRAWLERS,
  'train-CCBot': RFC_9309,
  'train-Bytespider': RFC_9309,
  sitemap: SITEMAP_PROTOCOL,
  noindex: GOOGLE_ROBOTS,
  wall: HTML_NOSCRIPT,
  http: RFC_9110,
  ssrf: RFC_9110,
  excluded: RFC_9309,
  h1: HTML_H1,
  canonical: HTML_CANONICAL,
  lang: HTML_LANG,
  hreflang: HTML_HREFLANG,
  jsonld: JSON_LD,
  'accept-markdown': RFC_7763,
  'vary-accept': RFC_9110,
  'md-alt': RFC_7763,
  'llms-txt': LLMS_TXT,
  'llms-full': LLMS_TXT,
  'mcp-json': MCP_SPEC,
  'https-origin': RFC_9110,
  title: HTML_TITLE,
  date: HTML_TIME,
  https: RFC_9110,
  size: HTML_DOCUMENT,
};

/** Raw finding ids that do not equal their criterion key. */
const ID_ALIASES: Record<string, string> = {
  'robots-missing': 'robots',
  'robots-present': 'robots',
};

const KEYS_BY_LENGTH = Object.keys(CHECK_REFS).sort((a, b) => b.length - a.length);

export function checkRefForKey(key: string): CheckRef | undefined {
  return CHECK_REFS[ID_ALIASES[key] || key];
}

/**
 * Resolve a raw finding id (`date-https://site/page`, `robots-present`, `bot-GPTBot`)
 * to the official document for its criterion.
 */
export function checkRefForFindingId(id: string): CheckRef | undefined {
  const direct = checkRefForKey(id);
  if (direct) return direct;

  const base = id.split('|')[0] || id;
  const aliased = checkRefForKey(base);
  if (aliased) return aliased;

  for (const key of KEYS_BY_LENGTH) {
    if (base.startsWith(`${key}-`)) return CHECK_REFS[key];
  }
  for (const [alias, key] of Object.entries(ID_ALIASES)) {
    if (base.startsWith(`${alias}-`)) return CHECK_REFS[key];
  }
  return undefined;
}

/** Criterion keys that have no mapped document. Empty in a healthy build. */
export function unmappedCriterionKeys(): string[] {
  return CRITERION_CATALOG.filter((c) => !checkRefForKey(c.key)).map((c) => c.key);
}
