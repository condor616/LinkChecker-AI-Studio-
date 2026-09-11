import rawIndex from './vocab-index.json';

export type VocabIndex = {
  version: string;
  sourceUrl: string;
  types: Record<string, { parents: string[] }>;
  properties: Record<string, { domains: string[]; ranges: string[] }>;
};

let cached: VocabIndex | null = null;
const ancestorCache = new Map<string, Set<string>>();
let propertyByLower: Map<string, string> | null = null;

export function loadVocabIndex(): VocabIndex {
  if (cached) return cached;
  cached = rawIndex as VocabIndex;
  return cached;
}

function propertyLowerMap(index: VocabIndex): Map<string, string> {
  if (propertyByLower) return propertyByLower;
  propertyByLower = new Map();
  for (const key of Object.keys(index.properties)) {
    propertyByLower.set(key.toLowerCase(), key);
  }
  return propertyByLower;
}

/** Test helper: replace the cached index. */
export function setVocabIndexForTests(index: VocabIndex | null): void {
  cached = index;
  ancestorCache.clear();
  propertyByLower = null;
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

/** Schema.org Actions use `{property}-input` / `{property}-output` annotations. */
const ACTION_ANNOTATION_RE = /^(.+)-(input|output)$/;

export function actionAnnotationBase(
  name: string,
  index: VocabIndex = loadVocabIndex(),
): string | null {
  const match = name.match(ACTION_ANNOTATION_RE);
  if (!match) return null;
  const base = match[1];
  return index.properties[base] ? base : null;
}

/** Canonical schema.org property name, including common CMS casing like URL → url. */
export function canonicalPropertyName(
  name: string,
  index: VocabIndex = loadVocabIndex(),
): string | null {
  if (index.properties[name]) return name;
  if (actionAnnotationBase(name, index)) return name;
  return propertyLowerMap(index).get(name.toLowerCase()) ?? null;
}

export function isKnownProperty(name: string, index: VocabIndex = loadVocabIndex()): boolean {
  return canonicalPropertyName(name, index) != null;
}

export function propertyAllowedOnType(
  property: string,
  typeName: string,
  index: VocabIndex = loadVocabIndex(),
): boolean {
  const lookup = actionAnnotationBase(property, index) ?? canonicalPropertyName(property, index) ?? property;
  const prop = index.properties[lookup];
  if (!prop) return false;
  if (prop.domains.length === 0) return true;
  const ancestors = typeAncestors(typeName, index);
  return prop.domains.some((domain) => ancestors.has(domain));
}

/** Expected ranges for a property, including Action -input/-output annotations. */
export function propertyRanges(
  property: string,
  index: VocabIndex = loadVocabIndex(),
): string[] {
  if (actionAnnotationBase(property, index)) {
    return ['PropertyValueSpecification', 'Text'];
  }
  const canonical = canonicalPropertyName(property, index);
  return (canonical && index.properties[canonical]?.ranges) || [];
}
