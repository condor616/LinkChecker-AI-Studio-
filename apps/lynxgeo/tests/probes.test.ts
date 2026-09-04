import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEARCH_BOTS, TRAINING_BOTS, hasTdmRepSignal, llmsTxtStructureIssues } from '../lib/geo/probes';

test('AI search and training bot lists include 2026 crawlers', () => {
  for (const bot of ['Bingbot', 'Meta-ExternalAgent', 'Amazonbot', 'YouBot']) {
    assert.ok(AI_SEARCH_BOTS.includes(bot), `missing AI search bot ${bot}`);
  }
  for (const bot of ['Applebot-Extended', 'Diffbot']) {
    assert.ok(TRAINING_BOTS.includes(bot), `missing training bot ${bot}`);
  }
  assert.ok(AI_SEARCH_BOTS.includes('GPTBot'));
  assert.ok(TRAINING_BOTS.includes('Google-Extended'));
});

test('bot finding ids follow bot-* and train-* patterns for every listed crawler', () => {
  for (const bot of AI_SEARCH_BOTS) {
    assert.match(`bot-${bot}`, /^bot-/);
  }
  for (const bot of TRAINING_BOTS) {
    assert.match(`train-${bot}`, /^train-/);
  }
});

test('llms.txt structure accepts H1 plus a linked ## section', () => {
  const body = `# Site

> Summary

## Docs

- [Overview](https://example.com/docs)
`;
  assert.deepEqual(llmsTxtStructureIssues(body), []);
});

test('llms.txt structure reports missing H1', () => {
  const body = `## Docs

- [Overview](https://example.com/docs)
`;
  assert.deepEqual(llmsTxtStructureIssues(body), ['missing H1 (# title)']);
});

test('llms.txt structure reports missing linked ## section', () => {
  const body = `# Site

## Docs

No links here.
`;
  assert.deepEqual(llmsTxtStructureIssues(body), ['missing ## section with a markdown link']);
});

test('llms.txt structure reports both gaps when empty', () => {
  assert.deepEqual(llmsTxtStructureIssues(''), [
    'missing H1 (# title)',
    'missing ## section with a markdown link',
  ]);
});

test('TDMRep signal: well-known, header-only, or neither', () => {
  assert.equal(hasTdmRepSignal(true, undefined), true);
  assert.equal(hasTdmRepSignal(false, '1'), true);
  assert.equal(hasTdmRepSignal(false, ' 0 '), true);
  assert.equal(hasTdmRepSignal(false, ''), false);
  assert.equal(hasTdmRepSignal(false, undefined), false);
  assert.equal(hasTdmRepSignal(false, null), false);
});
