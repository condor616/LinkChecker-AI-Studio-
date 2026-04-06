import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanQueue } from '@/lib/bullmq';
import { POST } from '@/app/api/scans/route';
import { requireApprovedUser } from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
  requireApprovedUser: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDb: vi.fn().mockReturnValue({
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue({}),
  }),
  db: {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/lib/bullmq', () => ({
  scanQueue: {
    add: vi.fn().mockResolvedValue({ id: 'job-id' }),
  },
}));

describe('BullMQ Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enqueues a job when a scan is started', async () => {
    const mockUser = { id: 'test-user', email: 'test@example.com' };
    (requireApprovedUser as any).mockResolvedValue(mockUser);

    const req = new Request('http://localhost:3000/api/scans', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Scan',
        startUrl: 'https://example.com',
        maxDepth: 2,
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    // Verify scanQueue.add was called with correct data
    expect(scanQueue.add).toHaveBeenCalledWith(
      expect.stringContaining('scan-link-'),
      expect.objectContaining({
        userId: mockUser.id,
        url: 'https://example.com',
        depth: 0,
        config: expect.objectContaining({
          startUrl: 'https://example.com',
          maxDepth: 2,
        }),
      })
    );
  });
});
