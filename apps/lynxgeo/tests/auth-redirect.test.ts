import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeCallbackUrl } from '../lib/auth-redirect';

test('safeCallbackUrl accepts relative in-app paths', () => {
  assert.equal(safeCallbackUrl('/audits/new'), '/audits/new');
  assert.equal(safeCallbackUrl('/audits/history?foo=1'), '/audits/history?foo=1');
});

test('safeCallbackUrl rejects open redirects', () => {
  assert.equal(safeCallbackUrl('https://evil.example/'), null);
  assert.equal(safeCallbackUrl('//evil.example'), null);
  assert.equal(safeCallbackUrl('\\evil.example'), null);
  assert.equal(safeCallbackUrl('not-a-path'), null);
  assert.equal(safeCallbackUrl(null), null);
});
