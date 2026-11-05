// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  applySwapDelta,
  useMarketTrades,
  type SwapFeed,
  type MarketSwap,
} from './market-trades.js';
const mint = 'So11111111111111111111111111111111111111112',
  pool = mint;
const row = (id: string, time = Date.now() - 1000): MarketSwap => ({
  id,
  mint,
  pool,
  time,
  slot: 1,
  sourceOrder: 0,
  signature: '1'.repeat(88),
  wallet: mint,
  side: 'BUY',
  priceUsd: 1,
  quantity: 1,
  volumeUsd: 1,
});
const feed = (trades: MarketSwap[] = []): SwapFeed => ({
  mint,
  pool,
  trades,
  gaps: [],
  checkedAt: Date.now(),
  status: 'available',
  lastError: null,
  source: 'Explicit offline fixture',
  delivery: 'helius-confirmed',
  streamState: 'live',
  emittedAt: Date.now(),
});
class Source extends EventTarget {
  static all: Source[] = [];
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;
  close = vi.fn(() => {
    this.readyState = 2;
  });
  constructor() {
    super();
    Source.all.push(this);
  }
  emit(body: unknown) {
    this.onmessage?.({ data: JSON.stringify(body) });
  }
}
beforeEach(() => {
  Source.all = [];
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', Source);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ ...feed(), delivery: 'rest-delayed', streamState: 'not-configured' }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
async function flushQueries() {
  await act(async () => {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1);
  });
}
it('validates identity before merging deltas, preserves good rows against invalid ID collisions and orders duplicates', () => {
  const old = feed([row('a', 1000), row('b', 3000)]);
  const next = applySwapDelta(
    old,
    { ...feed([row('c', 2000), row('a', 1000)]), full: false },
    mint,
    pool,
  );
  expect(next.trades.map((t) => t.id)).toEqual(['a', 'c', 'b']);
  const poison = applySwapDelta(
    next,
    { ...feed([{ ...row('a'), mint: 'wrong-mint' }]), full: false },
    mint,
    pool,
  );
  expect(poison.trades.map((t) => t.id)).toEqual(['a', 'c', 'b']);
  expect(() => applySwapDelta(old, { ...feed(), pool: 'wrong-pool' }, mint, pool)).toThrow(
    'identity',
  );
  expect(() => applySwapDelta(old, null, mint, pool)).toThrow();
  expect(
    applySwapDelta(
      old,
      { ...feed([row('rest')]), delivery: 'rest-delayed', full: true },
      mint,
      pool,
    ).trades.map((t) => t.id),
  ).toEqual(['rest']);
});
it('shares one EventSource per query client/mint/pool and closes it after the last consumer', async () => {
  const { wrapper } = setup();
  const first = renderHook(() => useMarketTrades(mint, pool), { wrapper }),
    second = renderHook(() => useMarketTrades(mint, pool), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });
  expect(Source.all).toHaveLength(1);
  act(() => Source.all[0]!.emit({ ...feed([row('genuine-shaped-fixture')]), full: true }));
  await flushQueries();
  expect(first.result.current.data?.trades).toHaveLength(1);
  first.unmount();
  expect(Source.all[0]!.close).not.toHaveBeenCalled();
  second.unmount();
  expect(Source.all[0]!.close).toHaveBeenCalledOnce();
});
it('marks retained observations stale after missing heartbeats and restores live state on a valid message', async () => {
  const { wrapper } = setup(),
    { result } = renderHook(() => useMarketTrades(mint, pool), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });
  act(() => Source.all[0]!.emit({ ...feed([row('retained')]), full: true }));
  vi.mocked(fetch).mockRejectedValue(Error('Explicit offline provider failure'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(18001);
  });
  expect(result.current.data?.streamState).toBe('reconnecting');
  expect(result.current.data?.trades[0]?.id).toBe('retained');
  expect(result.current.data?.lastError).toContain('heartbeat is stale');
  expect(Source.all).toHaveLength(2);
  act(() => Source.all.at(-1)!.emit({ ...feed([row('fresh')]), full: true }));
  await flushQueries();
  expect(result.current.data?.streamState).toBe('live');
  expect(result.current.data?.lastError).toBeNull();
});
it('offline/server-unavailable signals cannot silently become live through HTTP-only responses', async () => {
  const { wrapper, client } = setup(),
    { result } = renderHook(() => useMarketTrades(mint, pool), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });
  act(() => Source.all[0]!.emit({ ...feed([row('retained')]), full: true }));
  vi.mocked(fetch).mockImplementation(async () => Response.json(feed([row('HTTP-only')])));
  await act(async () => {
    window.dispatchEvent(new Event('offline'));
    await Promise.resolve();
  });
  await act(async () => {
    await client.refetchQueries({ queryKey: ['terminal-swaps', mint, pool] });
  });
  await flushQueries();
  expect(result.current.data?.streamState).toBe('reconnecting');
  act(() => window.dispatchEvent(new Event('online')));
  act(() => Source.all.at(-1)!.emit({ ...feed([row('back-online')]), full: true }));
  await flushQueries();
  expect(result.current.data?.streamState).toBe('live');
  await act(async () => {
    Source.all.at(-1)!.dispatchEvent(new Event('unavailable'));
    await Promise.resolve();
  });
  await flushQueries();
  expect(result.current.data?.streamState).toBe('reconnecting');
});
it('replaces a permanently closed EventSource with bounded retries and ignores late messages from it', async () => {
  const { wrapper } = setup(),
    { result, unmount } = renderHook(() => useMarketTrades(mint, pool), { wrapper });
  await flushQueries();
  const old = Source.all[0]!;
  act(() => old.emit({ ...feed([row('valid')]), full: true }));
  await flushQueries();
  act(() => {
    old.readyState = 2;
    old.onerror?.();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2001);
  });
  expect(Source.all).toHaveLength(2);
  act(() => old.emit({ ...feed([row('late-obsolete-stream')]), full: true }));
  await flushQueries();
  expect(result.current.data?.trades.some((t) => t.id === 'late-obsolete-stream')).toBe(false);
  const current = Source.all.at(-1)!;
  act(() => current.emit({ ...feed([row('recovered')]), full: true }));
  await flushQueries();
  expect(result.current.data?.streamState).toBe('live');
  unmount();
  expect(current.close).toHaveBeenCalledOnce();
});
