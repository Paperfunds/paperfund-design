import { test, expect, vi } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMarketTrades } from './market-trades.js';
test('a slow HTTP snapshot cannot overwrite a newer SSE update even with server clock skew', async () => {
  const mint = 'So11111111111111111111111111111111111111112';
  let release: (r: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => { release = resolve; });
  class Source extends EventTarget {
    static latest: Source;
    onmessage: ((event: { data: string }) => void) | null = null;
    readyState = 1;
    close() {}
    constructor() { super(); Source.latest = this; }
  }
  vi.stubGlobal('fetch', vi.fn(() => pending));
  vi.stubGlobal('EventSource', Source);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  try {
    const { result } = renderHook(() => useMarketTrades(mint, mint), { wrapper });
    const row = { id: 'verified-event-shaped-fixture', mint, pool: mint, time: Date.now()-1000, slot: 1, sourceOrder: 0, signature: '1'.repeat(64), wallet: mint, side: 'BUY', priceUsd: 1, quantity: 1, volumeUsd: 1 };
    const feed = { mint, pool: mint, checkedAt: Date.now(), emittedAt: Date.now()-60000, delivery: 'helius-confirmed', streamState: 'live', status: 'available', gaps: [], trades: [row] };
    await act(async () => { Source.latest.onmessage?.({data:JSON.stringify({...feed,full:true})}); });
    await act(async () => { release(Response.json({...feed,trades:[],delivery:'rest-delayed'})); await new Promise(r=>setTimeout(r,30)); });
    expect(result.current.data?.trades.map(t=>t.id)).toEqual([row.id]);
    expect(result.current.data?.delivery).toBe('helius-confirmed');
  } finally { cleanup(); client.clear(); vi.unstubAllGlobals(); }
});
