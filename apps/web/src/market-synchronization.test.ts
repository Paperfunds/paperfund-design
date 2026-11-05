import { test, expect } from 'vitest';
import { marketSynchronization } from './market-synchronization.js';
import { applySwapDelta, type SwapFeed } from './market-trades.js';
test('separates freshness and refuses unsupported creator balances and invented holder totals', () => {
  const h = { status: 'available', checkedAt: 1000, rows: [{ wallet: 'creator', raw: '123', percent: 1 }] };
  const s = marketSynchronization(undefined, h, { address: 'creator' }, 2000);
  expect(s.holders.status).toBe('sample'); expect(s.charts.status).toBe('delayed'); expect(s.developer.sampledRaw).toBeNull();
  expect(marketSynchronization(undefined, h, { address: 'creator', verifiedAt: 900 }, 2000).developer.sampledRaw).toBe('123');
  expect(marketSynchronization(undefined, h, { address: 'creator', verifiedAt: 900 }, 130000).developer.sampledRaw).toBeNull();
});
test('obsolete SSE snapshots cannot erase newer data', () => {
  const mint = 'So11111111111111111111111111111111111111112';
  const feed = { mint, pool: mint, trades: [], emittedAt: 200, delivery: 'helius-confirmed', status: 'available', gaps: [], checkedAt: 200, lastError: null, source: 'test' } as SwapFeed;
  expect(applySwapDelta(feed, { ...feed, full: true, emittedAt: 100 }, mint, mint)).toBe(feed);
});
