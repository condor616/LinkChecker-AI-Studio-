import type { ParsedJsonLdBlock } from './schemaorg/parse-jsonld';

/** Schema.org types that imply editorial / article date expectations. */
export const ARTICLE_JSONLD_TYPES = new Set([
  'Article',
  'NewsArticle',
  'BlogPosting',
  'TechArticle',
]);

export function isOgArticle(ogType: string | undefined | null): boolean {
  return (ogType || '').trim().toLowerCase() === 'article';
}

export function jsonLdHasArticleType(blocks: ParsedJsonLdBlock[]): boolean {
  for (const block of blocks) {
    if (!block.ok) continue;
    for (const node of block.nodes) {
      if (node.types.some((t) => ARTICLE_JSONLD_TYPES.has(t))) return true;
    }
  }
  return false;
}

/**
 * True when the page explicitly declares itself as editorial content via
 * Open Graph og:type=article or Article-family Schema.org JSON-LD.
 * No URL-path heuristics — if neither signal is present, return false.
 */
export function isArticleLike(opts: {
  ogType?: string | null;
  jsonLdBlocks?: ParsedJsonLdBlock[];
}): boolean {
  if (isOgArticle(opts.ogType)) return true;
  if (opts.jsonLdBlocks && jsonLdHasArticleType(opts.jsonLdBlocks)) return true;
  return false;
}

/** Collect JSON-LD datePublished / dateModified values for citeability signals. */
export function jsonLdDateSignals(blocks: ParsedJsonLdBlock[]): string[] {
  const signals: string[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    if (!block.ok) continue;
    for (const node of block.nodes) {
      for (const key of ['datePublished', 'dateModified'] as const) {
        const raw = node.properties[key];
        const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
        for (const value of values) {
          if (typeof value !== 'string' || !value.trim()) continue;
          const label = `JSON-LD ${key}="${value.trim()}"`;
          if (seen.has(label)) continue;
          seen.add(label);
          signals.push(label);
        }
      }
    }
  }
  return signals;
}
