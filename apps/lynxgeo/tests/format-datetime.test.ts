import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAppDateTime, formatAppDateTimeCompact } from '../lib/format-datetime';

test('formatAppDateTime uses Month D, YYYY - HH:MM:SS TZ', () => {
  const formatted = formatAppDateTime('2026-09-12T08:12:08.000Z');
  assert.match(formatted, /^September \d{1,2}, 2026 - \d{2}:\d{2}:\d{2} .+/);
  assert.doesNotMatch(formatted, /\d{1,2}\/\d{1,2}\/\d{4}/);
});

test('formatAppDateTime handles empty and invalid values', () => {
  assert.equal(formatAppDateTime(null), '—');
  assert.equal(formatAppDateTime(undefined), '—');
  assert.equal(formatAppDateTime(''), '—');
  assert.equal(formatAppDateTime('not-a-date'), '—');
});

test('formatAppDateTimeCompact shortens chip timestamps', () => {
  const formatted = formatAppDateTimeCompact('2026-09-12T08:12:08.000Z');
  assert.match(formatted, /^[A-Z][a-z]{2} \d{1,2}, \d{2}:\d{2}/);
  assert.doesNotMatch(formatted, /September/);
});
