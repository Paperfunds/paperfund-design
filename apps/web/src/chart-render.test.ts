import { describe, expect, it } from 'vitest';
import { candlePatch, recentWindow, retainedWindow, sma20 } from './chart-render.js';
import { swapCandles, type SwapFeed } from './market-trades.js';
const bar = (time: number, close = time) => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 10,
});
describe('readable chart rendering without synthetic market data', () => {
  it('opens a bounded recent view with readable spacing on desktop/mobile instead of fitting6000bars', () => {
    for (const width of [320, 390, 1200, 2400]) {
      const r = recentWindow(6000, width);
      expect(r.to - r.from).toBeLessThanOrEqual(135);
      expect(r.to - r.from).toBeGreaterThanOrEqual(40);
      expect(r.to).toBe(6004);
    }
    expect(recentWindow(1, 1000).to - recentWindow(1, 1000).from).toBe(25);
  });
  it('incrementally patches changed last OHLCV and appended bars, while backfills/corrections reset', () => {
    const old = [bar(1), bar(2), bar(3)];
    expect(candlePatch(old, old)).toEqual({ reset: false, from: 3 });
    expect(
      candlePatch(old, [...old.slice(0, 2), { ...bar(3), high: 10, volume: 20 }, bar(4)]),
    ).toEqual({ reset: false, from: 2 });
    expect(candlePatch(old, [bar(1, 10), bar(2), bar(3)])).toEqual({ reset: true, from: 0 });
    expect(candlePatch(old, [bar(2), bar(3), bar(4)])).toEqual({ reset: true, from: 0 });
    expect(candlePatch(old, [])).toEqual({ reset: true, from: 0 });
  });
  it('follows new bars only at the right edge; manual navigation survives backfill and ring eviction', () => {
    const old = Array.from({ length: 100 }, (_, i) => bar(i + 1));
    expect(retainedWindow({ from: 60, to: 104 }, old, [...old, bar(101)])).toEqual({
      from: 61,
      to: 105,
    });
    expect(retainedWindow({ from: 20.5, to: 45.5 }, old, [...old, bar(101)])).toEqual({
      from: 20.5,
      to: 45.5,
    });
    expect(retainedWindow({ from: 20.5, to: 45.5 }, old, old.slice(10))).toEqual({
      from: 10.5,
      to: 35.5,
    });
    expect(retainedWindow({ from: 20.5, to: 45.5 }, old, [bar(0), ...old])).toEqual({
      from: 21.5,
      to: 46.5,
    });
  });
  it('keeps real single-price seconds flat, volume summed, gaps empty and higher intervals accurate', () => {
    const feed = {
      gaps: [],
      trades: [
        { time: 1000, priceUsd: 1, volumeUsd: 2 },
        { time: 2000, priceUsd: 2, volumeUsd: 3 },
        { time: 2500, priceUsd: 4, volumeUsd: 5 },
        { time: 8000, priceUsd: 3, volumeUsd: 7 },
        { time: 12000, priceUsd: 2, volumeUsd: 11 },
      ],
    } as unknown as SwapFeed;
    expect(swapCandles(feed, '1s')).toEqual([
      { time: 2, open: 2, high: 4, low: 2, close: 4, volume: 8 },
      { time: 8, open: 3, high: 3, low: 3, close: 3, volume: 7 },
      { time: 12, open: 2, high: 2, low: 2, close: 2, volume: 11 },
    ]);
    expect(swapCandles(feed, '5s')).toEqual(
      [bar(5, 3), bar(10, 2)].map((b, i) => ({ ...b, volume: i ? 11 : 7 })),
    );
    expect(sma20(Array.from({ length: 21 }, (_, i) => bar(i, i + 1)))).toEqual([
      { time: 19, value: 10.5 },
      { time: 20, value: 11.5 },
    ]);
  });
});
