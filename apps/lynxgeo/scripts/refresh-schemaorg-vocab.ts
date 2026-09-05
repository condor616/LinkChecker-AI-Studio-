/**
 * Developer-only: download a pinned schema.org vocabulary dump and write a
 * compact runtime index. Never run during audits.
 *
 * Usage (from apps/lynxgeo):
 *   npx tsx scripts/refresh-schemaorg-vocab.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VocabIndex } from '../lib/geo/schemaorg/vocab';

const SCHEMAORG_VERSION = '30.0';
const SOURCE_URL = `https://raw.githubusercontent.com/schemaorg/schemaorg/main/data/releases/${SCHEMAORG_VERSION}/schemaorg-current-https.jsonld`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '../lib/geo/schemaorg/vocab-index.json');

type GraphNode = {
  '@id'?: string;
  '@type'?: string | string[];
  'rdfs:subClassOf'?: IdRef | IdRef[];
  'schema:domainIncludes'?: IdRef | IdRef[];
  'schema:rangeIncludes'?: IdRef | IdRef[];
};

type IdRef = { '@id': string };

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function localName(id: string): string | null {
  if (id.startsWith('schema:')) return id.slice('schema:'.length);
  if (id.startsWith('https://schema.org/')) return id.slice('https://schema.org/'.length);
  if (id.startsWith('http://schema.org/')) return id.slice('http://schema.org/'.length);
  return null;
}

function hasType(node: GraphNode, type: string): boolean {
  const types = asArray(node['@type']);
  return types.includes(type);
}

function buildIndex(graph: GraphNode[]): VocabIndex {
  const types: VocabIndex['types'] = {};
  const properties: VocabIndex['properties'] = {};

  for (const node of graph) {
    const id = node['@id'];
    if (!id) continue;
    const name = localName(id);
    if (!name) continue;

    if (hasType(node, 'rdfs:Class')) {
      const parents = asArray(node['rdfs:subClassOf'])
        .map((ref) => localName(ref['@id']))
        .filter((n): n is string => Boolean(n));
      types[name] = { parents };
    }

    if (hasType(node, 'rdf:Property')) {
      const domains = asArray(node['schema:domainIncludes'])
        .map((ref) => localName(ref['@id']))
        .filter((n): n is string => Boolean(n));
      const ranges = asArray(node['schema:rangeIncludes'])
        .map((ref) => localName(ref['@id']))
        .filter((n): n is string => Boolean(n));
      properties[name] = { domains, ranges };
    }
  }

  return {
    version: SCHEMAORG_VERSION,
    sourceUrl: SOURCE_URL,
    types,
    properties,
  };
}

async function main() {
  console.log(`Fetching schema.org ${SCHEMAORG_VERSION} from ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Failed to download vocabulary: HTTP ${res.status}`);
  }
  const dump = (await res.json()) as { '@graph'?: GraphNode[] };
  const graph = dump['@graph'];
  if (!Array.isArray(graph)) {
    throw new Error('Unexpected dump shape: missing @graph array');
  }

  const index = buildIndex(graph);
  const typeCount = Object.keys(index.types).length;
  const propCount = Object.keys(index.properties).length;
  writeFileSync(OUT_PATH, `${JSON.stringify(index)}\n`, 'utf8');
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`types=${typeCount} properties=${propCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
