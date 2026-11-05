import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeChartPools,
  decodePriceCandles,
  loadPriceCandles,
  type ChartPool,
} from './market-ohlcv.js';
const mint = '9bSWYcNtgnm7zcViDEnfXEKVCcBh7oGLsHSmz7BFpump';
const sol = 'So11111111111111111111111111111111111111112';
const address = '3ochMNdfNK9DHCgRn9AX7AKHsz4nSZPQrpXfudzJpx5G';
const pool: ChartPool = {
  address,
  base: mint,
  quote: sol,
  name: 'AfterLife / SOL',
  dex: 'pump-fun',
  liquidity: 2000,
};
const resource = (base = mint, quote = sol) => ({
  id: 'solana_' + address,
  attributes: { address, name: pool.name, reserve_in_usd: '2000' },
  relationships: {
    base_token: { data: { id: 'solana_' + base } },
    quote_token: { data: { id: 'solana_' + quote } },
    dex: { data: { id: 'pump-fun' } },
  },
});
const body = (rows: unknown[]) => ({
  meta: { base: { address: mint }, quote: { address: sol } },
  data: { attributes: { ohlcv_list: rows } },
});
afterEach(() => vi.unstubAllGlobals());
describe('documented read-only OHLCV identity and integrity', () => {
  it('explains network/CORS failures and blocks repeated provider attempts during cooldown', async () => {
    vi.resetModules();
    const fresh = await import('./market-ohlcv.js');
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetcher);
    await expect(fresh.loadPriceCandles(mint, pool, '1m')).rejects.toThrow(
      'Try again in one minute',
    );
    await expect(fresh.loadPriceCandles(mint, pool, '1m')).rejects.toThrow('request limit');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('accepts exact base or quote membership and rejects unrelated pools/network identities', () => {
    expect(decodeChartPools({ data: [resource()] }, mint)).toEqual([pool]);
    expect(decodeChartPools({ data: [resource(sol, mint)] }, mint)[0]?.quote).toBe(mint);
    expect(decodeChartPools({ data: [resource(sol, sol)] }, mint)).toEqual([]);
    expect(decodeChartPools({ data: [{ ...resource(), id: 'eth_' + address }] }, mint)).toEqual([]);
  });
  it('fails closed if returned token metadata does not match the chosen pool', () => {
    expect(() =>
      decodePriceCandles(
        { ...body([]), meta: { base: { address: sol }, quote: { address: mint } } },
        mint,
        pool,
      ),
    ).toThrow('identity mismatch');
  });
  it('keeps genuine gaps, orders/deduplicates timestamps, rejects malformed candles and volume', () => {
    const rows = [
      [180, 1, 3, 1, 2, 40],
      [60, 1, 2, 1, 2, 10],
      [60, 1, 2, 1, 2, 10],
      [240, 1, 0.5, 1, 2, 10],
      [300, 1, 2, 1, 2, -1],
      [360, 0, 2, 0, 2, 10],
      [420, '1', 2, 1, 2, 10],
    ];
    expect(decodePriceCandles(body(rows), mint, pool).map((c) => c.time)).toEqual([60, 180]);
  });
  it('requests USD and the actual token address, no synthetic empty intervals; supports earlier history', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => body([[60, 1, 2, 1, 2, 10]]) });
    vi.stubGlobal('fetch', fetcher);
    await loadPriceCandles(mint, pool, '5m', 600);
    const url = new URL(fetcher.mock.calls[0]![0]);
    expect(url.origin).toBe('https://api.geckoterminal.com');
    expect(url.pathname).toContain('/solana/pools/' + address + '/ohlcv/minute');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      aggregate: '5',
      token: mint,
      currency: 'usd',
      include_empty_intervals: 'false',
      before_timestamp: '600',
    });
    expect(fetcher.mock.calls[0]![1].credentials).toBe('omit');
  });
  it('does not contact a provider for an unrelated token or invalid mint', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(loadPriceCandles(address, pool, '1m')).rejects.toThrow('identity');
    await expect(loadPriceCandles('invalid', pool, '1m')).rejects.toThrow('identity');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('honors provider 429 with a fail-closed cooldown rather than automatic retries', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetcher);
    await expect(loadPriceCandles(mint, pool, '1m')).rejects.toThrow('rate limit');
    await expect(loadPriceCandles(mint, pool, '1m')).rejects.toThrow('request limit');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
