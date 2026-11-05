import { describe, it, expect } from 'vitest';
import {
  decodeSwapFeed,
  swapCandles,
  observedTraders,
  intervalSeconds,
  type SwapFeed,
  type MarketSwap,
} from './market-trades.js';
import { tradeMarkers } from './trade-markers.js';
import { tokenAmountToRaw, selectedSellQuantity } from './trade-input.js';
const mint = 'So11111111111111111111111111111111111111112';
const trade = (
  time: number,
  priceUsd: number,
  id: string,
  side: 'BUY' | 'SELL' = 'BUY',
): MarketSwap => ({
  id,
  mint,
  pool: mint,
  time,
  slot: 1,
  sourceOrder: 0,
  signature: '1'.repeat(88),
  wallet: mint,
  side,
  priceUsd,
  quantity: 2,
  volumeUsd: priceUsd * 2,
});
describe('genuine trade aggregation and ticket input', () => {
  it('uses trade timestamps for exact 1s OHLCV without filling absent seconds and omits a truncated oldest bucket', () => {
    const feed: SwapFeed = {
      mint,
      pool: mint,
      checkedAt: 5000,
      status: 'available',
      lastError: null,
      source: 'test fixture',
      trades: [
        trade(1000, 1, 'a'),
        trade(2000, 2, 'b'),
        trade(2200, 4, 'c'),
        trade(2900, 3, 'd'),
        trade(5000, 6, 'e'),
      ],
      gaps: [],
    };
    expect(swapCandles(feed, '1s')).toEqual([
      { time: 2, open: 2, high: 4, low: 2, close: 3, volume: 18 },
      { time: 5, open: 6, high: 6, low: 6, close: 6, volume: 12 },
    ]);
    expect(
      swapCandles({ ...feed, gaps: [{ from: 1900, to: 3000 }] }, '1s').some((c) => c.time === 2),
    ).toBe(false);
  });
  it('never describes observed trading cashflow as external P&L or a wallet balance', () => {
    const rows = observedTraders([trade(1000, 2, 'a'), trade(2000, 3, 'b', 'SELL')], 0);
    expect(rows[0]).toMatchObject({ buysUsd: 4, sellsUsd: 6, netTokens: 0, count: 2 });
    expect(rows[0]).not.toHaveProperty('realizedPnl');
  });
  it('parses editable token amounts and 10%/ALL using exact integer units', () => {
    expect(tokenAmountToRaw('1.000001', 6)).toBe(1000001n);
    expect(tokenAmountToRaw('1.0000001', 6)).toBeNull();
    expect(tokenAmountToRaw('1e3', 6)).toBeNull();
    expect(selectedSellQuantity('101', 0, 10, '')).toBe('10');
    expect(selectedSellQuantity('101', 0, 100, '')).toBe('101');
    expect(selectedSellQuantity('101', 2, 100, '0.25')).toBe('25');
    expect(() => selectedSellQuantity('101', 0, 100, '102')).toThrow();
  });
  it('deduplicates and orders reconnect observations before calculating open/close, binding mint and pool', () => {
    const feed = decodeSwapFeed(
      {
        mint,
        pool: mint,
        trades: [
          trade(3000, 3, 'c'),
          trade(1000, 1, 'a'),
          trade(2200, 4, 'd'),
          trade(2000, 2, 'b'),
          trade(2000, 2, 'b'),
        ],
        gaps: [],
      },
      mint,
      mint,
    );
    expect(feed.trades.map((t) => t.id)).toEqual(['a', 'b', 'd', 'c']);
    expect(swapCandles(feed, '1s')[0]).toMatchObject({ open: 2, close: 4 });
    expect(() => decodeSwapFeed({ ...feed, pool: 'other' }, mint, mint)).toThrow('identity');
  });
  it.each(Object.entries(intervalSeconds))(
    'places actual execution annotations only in existing %s buckets',
    (interval, seconds) => {
      const time = Math.floor(1805000 / 1000 / seconds) * seconds;
      const bars = [{ time, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
      const executions = [{ id: 'isolated-fixture', mint, side: 'BUY' as const, at: 1805000 }];
      expect(
        tradeMarkers(executions, mint, bars, interval as keyof typeof intervalSeconds),
      ).toHaveLength(1);
      expect(tradeMarkers(executions, mint, [], interval as keyof typeof intervalSeconds)).toEqual(
        [],
      );
    },
  );
});
