import type { JsonLdNode, ParsedJsonLdBlock } from './parse-jsonld';

export type GoogleRichProfile = {
  type: string;
  required: string[];
  docTitle: string;
  docHref: string;
};

/** Small curated Google Rich Results required-property profiles (not schema.org validity). */
export const GOOGLE_RICH_PROFILES: GoogleRichProfile[] = [
  {
    type: 'JobPosting',
    required: ['title', 'description', 'datePosted', 'hiringOrganization'],
    docTitle: 'Google Search — Job posting structured data',
    docHref: 'https://developers.google.com/search/docs/appearance/structured-data/job-posting',
  },
  {
    type: 'Event',
    required: ['name', 'startDate', 'location'],
    docTitle: 'Google Search — Event structured data',
    docHref: 'https://developers.google.com/search/docs/appearance/structured-data/event',
  },
  {
    type: 'FAQPage',
    required: ['mainEntity'],
    docTitle: 'Google Search — FAQ structured data',
    docHref: 'https://developers.google.com/search/docs/appearance/structured-data/faqpage',
  },
  {
    type: 'HowTo',
    required: ['name', 'step'],
    docTitle: 'Google Search — How-to structured data',
    docHref: 'https://developers.google.com/search/docs/appearance/structured-data/how-to',
  },
  {
    type: 'Article',
    required: ['headline', 'image', 'datePublished', 'author'],
    docTitle: 'Google Search — Article structured data',
    docHref: 'https://developers.google.com/search/docs/appearance/structured-data/article',
  },
  {
    type: 'NewsArticle',
    required: ['headline', 'image', 'datePublished', 'author'],
    docTitle: 'Google Search — Article structured data',
    docHref: 'https://developers.google.com/search/docs/appearance/structured-data/article',
  },
  {
    type: 'Organization',
    required: ['name'],
    docTitle: 'Google Search — Organization structured data',
    docHref: 'https://developers.google.com/search/docs/appearance/structured-data/organization',
  },
  {
    type: 'Product',
    required: ['name', 'image'],
    docTitle: 'Google Search — Product structured data',
    docHref: 'https://developers.google.com/search/docs/appearance/structured-data/product',
  },
];

export type GoogleRichGap = {
  type: string;
  missing: string[];
  path: string;
  docTitle: string;
  docHref: string;
};

function nodesFromBlocks(blocks: ParsedJsonLdBlock[]): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  for (const block of blocks) {
    if (block.ok) nodes.push(...block.nodes);
  }
  return nodes;
}

export function findGoogleRichGaps(blocks: ParsedJsonLdBlock[]): GoogleRichGap[] {
  const gaps: GoogleRichGap[] = [];
  const nodes = nodesFromBlocks(blocks);
  const byType = new Map(GOOGLE_RICH_PROFILES.map((p) => [p.type, p]));

  for (const node of nodes) {
    for (const typeName of node.types) {
      const profile = byType.get(typeName);
      if (!profile) continue;
      const missing = profile.required.filter((prop) => {
        const value = node.properties[prop];
        if (value == null) return true;
        if (typeof value === 'string' && !value.trim()) return true;
        if (Array.isArray(value) && value.length === 0) return true;
        return false;
      });
      if (missing.length > 0) {
        gaps.push({
          type: typeName,
          missing,
          path: node.path,
          docTitle: profile.docTitle,
          docHref: profile.docHref,
        });
      }
    }
  }

  return gaps;
}

export function summarizeGoogleRichGaps(gaps: GoogleRichGap[], limit = 3): string {
  const shown = gaps.slice(0, limit).map((g) => `${g.type} missing ${g.missing.join(', ')} (Google Rich Results)`);
  const more = gaps.length > limit ? ` (+${gaps.length - limit} more)` : '';
  return `${shown.join('; ')}${more}`;
}
