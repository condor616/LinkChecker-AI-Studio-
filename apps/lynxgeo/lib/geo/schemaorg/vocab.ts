import rawIndex from './vocab-index.json';

export type VocabIndex = {
  version: string;
  sourceUrl: string;
  types: Record<string, { parents: string[] }>;
  properties: Record<string, { domains: string[]; ranges: string[] }>;
};

let cached: VocabIndex | null = null;
const ancestorCache = new Map<string, Set<string>>();

export function loadVocabIndex(): VocabIndex {
  if (cached) return cached;
  cached = rawIndex as VocabIndex;
  return cached;
}

/** Test helper: replace the cached index. */
export function setVocabIndexForTests(index: VocabIndex | null): void {
  cached = index;
  ancestorCache.clear();
}

export function typeAncestors(typeName: string, index: VocabIndex = loadVocabIndex()): Set<string> {
  const hit = ancestorCache.get(typeName);
  if (hit) return hit;

  const out = new Set<string>();
  const stack = [typeName];
  while (stack.length) {
    const current = stack.pop()!;
    if (out.has(current)) continue;
    out.add(current);
    const parents = index.types[current]?.parents || [];
    for (const parent of parents) stack.push(parent);
  }
  ancestorCache.set(typeName, out);
  return out;
}

export function isKnownType(name: string, index: VocabIndex = loadVocabIndex()): boolean {
  return Boolean(index.types[name]);
}

export function isKnownProperty(name: string, index: VocabIndex = loadVocabIndex()): boolean {
  return Boolean(index.properties[name]);
}

export function propertyAllowedOnType(
  property: string,
  typeName: string,
  index: VocabIndex = loadVocabIndex(),
): boolean {
  const prop = index.properties[property];
  if (!prop) return false;
  if (prop.domains.length === 0) return true;
  const ancestors = typeAncestors(typeName, index);
  return prop.domains.some((domain) => ancestors.has(domain));
}
