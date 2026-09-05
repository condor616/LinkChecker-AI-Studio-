import type { JsonLdNode, ParsedJsonLdBlock } from './parse-jsonld';
import {
  isKnownProperty,
  isKnownType,
  loadVocabIndex,
  propertyAllowedOnType,
  type VocabIndex,
} from './vocab';

export type SchemaIssueSeverity = 'fail' | 'warn';

export type SchemaIssue = {
  code: 'parse_error' | 'unknown_type' | 'unknown_property' | 'domain_mismatch' | 'range_mismatch';
  severity: SchemaIssueSeverity;
  path: string;
  message: string;
};

const DATA_TYPES = new Set([
  'Text',
  'URL',
  'Date',
  'DateTime',
  'Time',
  'Number',
  'Integer',
  'Float',
  'Boolean',
  'CssSelectorType',
  'XPathType',
  'PronounceableText',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeTypedNode(value: unknown): boolean {
  return isPlainObject(value) && value['@type'] != null;
}

function isUrlString(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('//');
}

function isIsoDateLike(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

function valueMatchesRange(value: unknown, ranges: string[]): boolean {
  if (ranges.length === 0) return true;

  const dataRanges = ranges.filter((r) => DATA_TYPES.has(r));
  const classRanges = ranges.filter((r) => !DATA_TYPES.has(r));

  if (Array.isArray(value)) {
    return value.every((item) => valueMatchesRange(item, ranges));
  }

  if (looksLikeTypedNode(value)) {
    // Nested typed objects are validated recursively. Accept when a Class range
    // exists; reject when only data types (Text/URL/…) are allowed.
    return classRanges.length > 0;
  }

  if (value == null) return true;

  if (typeof value === 'boolean') {
    return dataRanges.includes('Boolean') || dataRanges.includes('Text');
  }

  if (typeof value === 'number') {
    return (
      dataRanges.includes('Number') ||
      dataRanges.includes('Integer') ||
      dataRanges.includes('Float') ||
      dataRanges.includes('Text')
    );
  }

  if (typeof value === 'string') {
    if (dataRanges.length === 0 && classRanges.length > 0) {
      // Scalar where only Class expected — allow Text/URL-style strings as common pattern.
      return true;
    }
    if (dataRanges.includes('URL') && isUrlString(value)) return true;
    if ((dataRanges.includes('Date') || dataRanges.includes('DateTime') || dataRanges.includes('Time')) && isIsoDateLike(value)) {
      return true;
    }
    if (dataRanges.includes('Text') || dataRanges.includes('URL') || dataRanges.includes('CssSelectorType') || dataRanges.includes('XPathType')) {
      return true;
    }
    if (dataRanges.includes('Number') || dataRanges.includes('Integer') || dataRanges.includes('Float')) {
      return !Number.isNaN(Number(value));
    }
    if (dataRanges.includes('Boolean')) {
      return value === 'true' || value === 'false';
    }
    // String with only class ranges: schema.org often allows Text where URL/Thing expected.
    return classRanges.length > 0;
  }

  if (isPlainObject(value)) {
    // Untyped object — soft accept if class range exists.
    return classRanges.length > 0 || dataRanges.includes('Text');
  }

  return true;
}

function validateNode(node: JsonLdNode, index: VocabIndex, issues: SchemaIssue[]): void {
  for (const typeName of node.types) {
    if (!isKnownType(typeName, index)) {
      issues.push({
        code: 'unknown_type',
        severity: 'fail',
        path: `${node.path}/@type`,
        message: `Unknown schema.org type "${typeName}".`,
      });
    }
  }

  const knownTypes = node.types.filter((t) => isKnownType(t, index));

  for (const [prop, value] of Object.entries(node.properties)) {
    if (!isKnownProperty(prop, index)) {
      issues.push({
        code: 'unknown_property',
        severity: 'fail',
        path: `${node.path}/${prop}`,
        message: `Unknown schema.org property "${prop}".`,
      });
      continue;
    }

    if (knownTypes.length > 0) {
      const allowed = knownTypes.some((t) => propertyAllowedOnType(prop, t, index));
      if (!allowed) {
        issues.push({
          code: 'domain_mismatch',
          severity: 'fail',
          path: `${node.path}/${prop}`,
          message: `Property "${prop}" is not valid on type(s) ${knownTypes.join(', ')}.`,
        });
      }
    }

    const ranges = index.properties[prop]?.ranges || [];
    if (!valueMatchesRange(value, ranges)) {
      issues.push({
        code: 'range_mismatch',
        severity: 'warn',
        path: `${node.path}/${prop}`,
        message: `Property "${prop}" value does not match expected range (${ranges.join(' | ') || 'unspecified'}).`,
      });
    }
  }
}

export function validateParsedBlocks(
  blocks: ParsedJsonLdBlock[],
  index: VocabIndex = loadVocabIndex(),
): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  for (const [i, block] of blocks.entries()) {
    if (!block.ok) {
      issues.push({
        code: 'parse_error',
        severity: 'fail',
        path: `$[${i}]`,
        message: `Malformed JSON-LD: ${block.error}`,
      });
      continue;
    }
    for (const node of block.nodes) {
      validateNode(node, index, issues);
    }
  }
  return issues;
}

export function worstSeverity(issues: SchemaIssue[]): SchemaIssueSeverity | 'pass' {
  if (issues.some((i) => i.severity === 'fail')) return 'fail';
  if (issues.some((i) => i.severity === 'warn')) return 'warn';
  return 'pass';
}

export function summarizeIssues(issues: SchemaIssue[], limit = 5): string {
  if (issues.length === 0) return 'All JSON-LD blocks match the pinned schema.org vocabulary.';
  const shown = issues.slice(0, limit).map((i) => i.message);
  const more = issues.length > limit ? ` (+${issues.length - limit} more)` : '';
  return `${shown.join(' ')}${more}`;
}
