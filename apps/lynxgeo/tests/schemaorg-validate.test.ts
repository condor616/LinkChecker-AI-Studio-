import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findGoogleRichGaps } from '../lib/geo/schemaorg/google-rich';
import { parseJsonLdBlocksFromHtml, parseJsonLdDocument } from '../lib/geo/schemaorg/parse-jsonld';
import { validateParsedBlocks, worstSeverity } from '../lib/geo/schemaorg/validate';
import { loadVocabIndex } from '../lib/geo/schemaorg/vocab';

test('pinned vocab index loads schema.org 30.0', () => {
  const index = loadVocabIndex();
  assert.equal(index.version, '30.0');
  assert.ok(index.types.JobPosting);
  assert.ok(index.properties.datePosted);
});

test('unknown type fails', () => {
  const block = parseJsonLdDocument(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'JobPostting',
      name: 'x',
    }),
  );
  const issues = validateParsedBlocks([block]);
  assert.equal(worstSeverity(issues), 'fail');
  assert.ok(issues.some((i) => i.code === 'unknown_type'));
});

test('unknown property fails', () => {
  const block = parseJsonLdDocument(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      postedDate: '2026-01-01',
    }),
  );
  const issues = validateParsedBlocks([block]);
  assert.ok(issues.some((i) => i.code === 'unknown_property' && i.message.includes('postedDate')));
});

test('domain mismatch fails for isbn on JobPosting', () => {
  const block = parseJsonLdDocument(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'Engineer',
      isbn: '123',
    }),
  );
  const issues = validateParsedBlocks([block]);
  assert.ok(issues.some((i) => i.code === 'domain_mismatch' && i.message.includes('isbn')));
});

test('valid JobPosting with datePosted passes vocab checks', () => {
  const block = parseJsonLdDocument(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'Engineer',
      description: 'Build things',
      datePosted: '2026-01-01',
      hiringOrganization: { '@type': 'Organization', name: 'Acme' },
    }),
  );
  const issues = validateParsedBlocks([block]);
  assert.equal(worstSeverity(issues), 'pass');
});

test('http schema.org context is accepted', () => {
  const block = parseJsonLdDocument(
    JSON.stringify({
      '@context': 'http://schema.org',
      '@type': 'Organization',
      name: 'Acme',
    }),
  );
  const issues = validateParsedBlocks([block]);
  assert.equal(worstSeverity(issues), 'pass');
});

test('@graph and nested nodes are walked', () => {
  const block = parseJsonLdDocument(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          name: 'Home',
          publisher: { '@type': 'Organization', name: 'Acme', isbn: 'nope' },
        },
      ],
    }),
  );
  assert.ok(block.ok);
  if (!block.ok) return;
  assert.ok(block.nodes.length >= 2);
  const issues = validateParsedBlocks([block]);
  assert.ok(issues.some((i) => i.code === 'domain_mismatch' && i.message.includes('isbn')));
});

test('@type array validates each type', () => {
  const block = parseJsonLdDocument(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': ['Organization', 'NotARealType'],
      name: 'Acme',
    }),
  );
  const issues = validateParsedBlocks([block]);
  assert.ok(issues.some((i) => i.code === 'unknown_type' && i.message.includes('NotARealType')));
});

test('malformed JSON fails parse', () => {
  const blocks = parseJsonLdBlocksFromHtml(
    '<script type="application/ld+json">{not-json</script>',
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].ok, false);
  const issues = validateParsedBlocks(blocks);
  assert.ok(issues.some((i) => i.code === 'parse_error'));
});

test('non-schema.org terms are ignored', () => {
  const block = parseJsonLdDocument(
    JSON.stringify({
      '@context': {
        '@vocab': 'https://schema.org/',
        dc: 'http://purl.org/dc/terms/',
      },
      '@type': 'Organization',
      name: 'Acme',
      'dc:creator': 'Someone',
    }),
  );
  const issues = validateParsedBlocks([block]);
  assert.equal(
    issues.filter((i) => i.message.includes('dc:creator')).length,
    0,
  );
  assert.equal(worstSeverity(issues), 'pass');
});

test('range mismatch warns when object given for Text-only property', () => {
  const block = parseJsonLdDocument(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Thing',
      name: { '@type': 'Organization', name: 'Nested' },
    }),
  );
  const issues = validateParsedBlocks([block]);
  assert.ok(issues.some((i) => i.code === 'range_mismatch' && i.severity === 'warn'));
});

test('Google rich gaps for incomplete JobPosting', () => {
  const block = parseJsonLdDocument(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'Engineer',
    }),
  );
  const gaps = findGoogleRichGaps([block]);
  assert.ok(gaps.some((g) => g.type === 'JobPosting' && g.missing.includes('description')));
  assert.ok(gaps.some((g) => g.type === 'JobPosting' && g.missing.includes('datePosted')));
});
