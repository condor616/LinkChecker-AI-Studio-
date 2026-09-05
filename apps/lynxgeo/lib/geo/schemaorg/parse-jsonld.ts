const JSON_LD_KEYWORDS = new Set([
  '@context',
  '@type',
  '@id',
  '@graph',
  '@value',
  '@language',
  '@vocab',
  '@base',
  '@container',
  '@list',
  '@set',
  '@reverse',
  '@index',
  '@none',
  '@prefix',
  '@propagate',
  '@protected',
  '@direction',
  '@import',
  '@included',
  '@json',
  '@nest',
  '@version',
]);

export type ParsedJsonLdBlock =
  | { ok: true; nodes: JsonLdNode[]; raw: unknown }
  | { ok: false; error: string; rawText: string };

export type JsonLdNode = {
  types: string[];
  /** Local schema.org property names present on this node. */
  properties: Record<string, unknown>;
  path: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Resolve a term to a schema.org local name, or null if not schema.org. */
export function schemaLocalName(term: unknown, schemaContextActive: boolean): string | null {
  if (typeof term !== 'string' || !term) return null;
  if (term.startsWith('https://schema.org/')) return term.slice('https://schema.org/'.length);
  if (term.startsWith('http://schema.org/')) return term.slice('http://schema.org/'.length);
  if (term.startsWith('schema:')) return term.slice('schema:'.length);
  // Compact terms are schema.org only when @context points at schema.org.
  if (schemaContextActive && !term.includes(':') && !term.startsWith('@')) return term;
  return null;
}

function contextIsSchemaOrg(context: unknown): boolean {
  if (typeof context === 'string') {
    return (
      context === 'https://schema.org' ||
      context === 'http://schema.org' ||
      context === 'https://schema.org/' ||
      context === 'http://schema.org/'
    );
  }
  if (Array.isArray(context)) return context.some(contextIsSchemaOrg);
  if (isPlainObject(context)) {
    if (contextIsSchemaOrg(context['@vocab'])) return true;
    // Common pattern: { "@vocab": "https://schema.org/" } or nested schema mapping.
    for (const value of Object.values(context)) {
      if (typeof value === 'string' && contextIsSchemaOrg(value)) return true;
    }
  }
  return false;
}

function collectTypes(value: unknown, schemaContextActive: boolean): string[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  const out: string[] = [];
  for (const item of raw) {
    const name = schemaLocalName(item, schemaContextActive);
    if (name) out.push(name);
  }
  return out;
}

function walk(
  value: unknown,
  path: string,
  schemaContextActive: boolean,
  out: JsonLdNode[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${path}[${i}]`, schemaContextActive, out));
    return;
  }
  if (!isPlainObject(value)) return;

  const nextContext = value['@context'] != null ? contextIsSchemaOrg(value['@context']) : schemaContextActive;
  const active = schemaContextActive || nextContext;

  if (value['@graph'] != null) {
    walk(value['@graph'], `${path}/@graph`, active, out);
  }

  const types = collectTypes(value['@type'], active);
  const properties: Record<string, unknown> = {};
  for (const [key, propValue] of Object.entries(value)) {
    if (JSON_LD_KEYWORDS.has(key)) continue;
    const local = schemaLocalName(key, active);
    if (!local) continue;
    properties[local] = propValue;
  }

  if (types.length > 0 || Object.keys(properties).length > 0) {
    out.push({ types, properties, path });
  }

  for (const [key, propValue] of Object.entries(properties)) {
    walk(propValue, `${path}/${key}`, active, out);
  }
}

export function parseJsonLdDocument(rawText: string, pathPrefix = '$'): ParsedJsonLdBlock {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON';
    return { ok: false, error: message, rawText };
  }

  const nodes: JsonLdNode[] = [];
  const rootContext = isPlainObject(parsed) ? contextIsSchemaOrg(parsed['@context']) : false;
  walk(parsed, pathPrefix, rootContext, nodes);
  return { ok: true, nodes, raw: parsed };
}

/** Extract and parse every application/ld+json script from an HTML string. */
export function parseJsonLdBlocksFromHtml(html: string): ParsedJsonLdBlock[] {
  const blocks: ParsedJsonLdBlock[] = [];
  const re = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = re.exec(html)) !== null) {
    const rawText = (match[1] || '').trim();
    if (!rawText) continue;
    blocks.push(parseJsonLdDocument(rawText, `$[${index}]`));
    index += 1;
  }
  return blocks;
}
