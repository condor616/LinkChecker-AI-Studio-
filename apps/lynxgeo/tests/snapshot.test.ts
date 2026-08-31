import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCORE_MODEL_VERSION } from '../lib/geo/score';
import { diffSnapshots, freezeSnapshot } from '../lib/geo/snapshot';

test('freezeSnapshot stores the current score model version', () => {
  const snap = freezeSnapshot({
    score: 81,
    categories: { crawlAccess: 80, extractability: 80, negotiation: 80, discovery: 80, citeability: 90 },
    findings: [],
    playbook: [],
    pages: [],
  });
  assert.equal(snap.scoreModelVersion, SCORE_MODEL_VERSION);
  assert.equal(snap.score, 81);
});

test('diffSnapshots flags rubric changes and issue movement', () => {
  const from = freezeSnapshot({
    score: 70,
    categories: { crawlAccess: 70, extractability: 70, negotiation: 70, discovery: 70, citeability: 70 },
    findings: [
      { id: 'old', category: 'crawlAccess', title: 'robots', detail: '', severity: 'fail', standard: 'established', suggestion: '' },
    ],
    playbook: [],
    pages: [],
  });
  const to = { ...from, score: 90, scoreModelVersion: 'geo-2.0', findings: [
    { id: 'new', category: 'discovery', title: 'llms', detail: '', severity: 'warn', standard: 'convention', suggestion: '' },
  ] };
  const diff = diffSnapshots(from, to);
  assert.equal(diff.rubricChanged, true);
  assert.equal(diff.scoreDelta, 20);
  assert.equal(diff.resolved[0].id, 'old');
  assert.equal(diff.newIssues[0].id, 'new');
});

test('geo-1.0 vs geo-1.0.1 is a rubric change', () => {
  const from = freezeSnapshot({
    score: 70,
    categories: { crawlAccess: 70, extractability: 70, negotiation: 70, discovery: 70, citeability: 70 },
    findings: [],
    playbook: [],
    pages: [],
  });
  const to = { ...from, scoreModelVersion: 'geo-1.0' };
  const diff = diffSnapshots(to, from);
  assert.equal(from.scoreModelVersion, SCORE_MODEL_VERSION);
  assert.notEqual(SCORE_MODEL_VERSION, 'geo-1.0');
  assert.equal(diff.rubricChanged, true);
});
