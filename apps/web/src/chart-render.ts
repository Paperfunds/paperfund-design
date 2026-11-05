import type { PriceCandle } from './market-ohlcv.js';

export interface LogicalWindow {
  from: number;
  to: number;
}
// Logical bars are actual traded buckets, not fabricated seconds. Leave modest space on the right.
export function recentWindow(count: number, width: number): LogicalWindow {
  const capacity = Math.max(35, Math.min(130, Math.floor((width - 70) / 8)));
  const visible = Math.min(capacity, Math.max(20, count));
  return { from: count - visible - 1, to: count + 4 };
}
const same = (a: PriceCandle, b: PriceCandle) =>
  a.time === b.time &&
  a.open === b.open &&
  a.high === b.high &&
  a.low === b.low &&
  a.close === b.close &&
  a.volume === b.volume;
export function candlePatch(previous: PriceCandle[], next: PriceCandle[]) {
  if (!previous.length || next.length < previous.length) return { reset: true, from: 0 };
  // A correction/backfill/ring eviction needs setData. A changing tail uses update, never redraws history.
  for (let i = 0; i < previous.length - 1; i++) {
    if (!next[i] || !same(previous[i]!, next[i]!)) return { reset: true, from: 0 };
  }
  const last = previous.length - 1;
  if (previous[last]!.time !== next[last]?.time) return { reset: true, from: 0 };
  return { reset: false, from: same(previous[last]!, next[last]!) ? previous.length : last };
}
export function retainedWindow(range: LogicalWindow, previous: PriceCandle[], next: PriceCandle[]) {
  if (range.to >= previous.length - 1) {
    const shift = next.length - previous.length;
    return { from: range.from + shift, to: range.to + shift };
  }
  const anchor = Math.max(0, Math.min(previous.length - 1, Math.floor(range.from)));
  const found = next.findIndex((c) => c.time === previous[anchor]?.time);
  // Preserve a manually inspected timestamp through a ring eviction or prepended history.
  const shift = found < 0 ? 0 : found - anchor;
  return { from: range.from + shift, to: range.to + shift };
}
export function sma20(candles: PriceCandle[]) {
  let sum = 0;
  return candles.flatMap((c, i) => {
    sum += c.close;
    if (i >= 20) sum -= candles[i - 20]!.close;
    return i < 19 ? [] : [{ time: c.time, value: sum / 20 }];
  });
}
