import { describe, it, expect, beforeEach } from 'vitest';
import {
  isPrivateIpAddress,
  assertSafeOutboundUrl,
  clearHostSafetyCache,
} from '@lynx/crawler-core';

describe('SSRF protection', () => {
  beforeEach(() => {
    clearHostSafetyCache();
  });

  it('flags common private and reserved IPv4 ranges', () => {
    expect(isPrivateIpAddress('127.0.0.1')).toBe(true);
    expect(isPrivateIpAddress('10.0.0.5')).toBe(true);
    expect(isPrivateIpAddress('192.168.1.1')).toBe(true);
    expect(isPrivateIpAddress('172.16.0.1')).toBe(true);
    expect(isPrivateIpAddress('169.254.169.254')).toBe(true);
    expect(isPrivateIpAddress('0.0.0.0')).toBe(true);
    expect(isPrivateIpAddress('8.8.8.8')).toBe(false);
  });

  it('blocks localhost and metadata hostnames', async () => {
    await expect(assertSafeOutboundUrl('http://localhost/admin')).resolves.toMatchObject({ ok: false });
    await expect(assertSafeOutboundUrl('http://127.0.0.1/')).resolves.toMatchObject({ ok: false });
    await expect(assertSafeOutboundUrl('http://169.254.169.254/latest/meta-data/')).resolves.toMatchObject({
      ok: false,
    });
    await expect(assertSafeOutboundUrl('http://metadata.google.internal/')).resolves.toMatchObject({
      ok: false,
    });
  });

  it('rejects non-http schemes', async () => {
    await expect(assertSafeOutboundUrl('file:///etc/passwd')).resolves.toMatchObject({ ok: false });
    await expect(assertSafeOutboundUrl('ftp://example.com/file')).resolves.toMatchObject({ ok: false });
  });

  it('allows a private host only when it matches the scan startUrl host scope', async () => {
    const blocked = await assertSafeOutboundUrl('http://10.0.0.8/page');
    expect(blocked.ok).toBe(false);

    const allowed = await assertSafeOutboundUrl('http://10.0.0.8/page', {
      startUrl: 'http://10.0.0.8/',
    });
    expect(allowed.ok).toBe(true);
  });
});
