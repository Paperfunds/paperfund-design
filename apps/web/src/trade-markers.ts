import type { PracticeFill } from './practice-api.js';
import type { Trade } from './types.js';
export type ChartExecution = Pick<PracticeFill, 'id' | 'mint' | 'side' | 'at'>;
/** Only actual authenticated ledger executions become time annotations; no price conversion. */
export function competitionExecutions(trades: Trade[], userId: string): ChartExecution[] {
  return trades
    .filter((t) => !t.owner_user_id || t.owner_user_id === userId)
    .map((t) => ({ id: t.id, mint: t.mint_address, side: t.side, at: Date.parse(t.executed_at) }))
    .filter((t) => Number.isSafeInteger(t.at));
}
import type { ChartInterval, PriceCandle } from './market-ohlcv.js';

import { intervalSeconds as seconds } from './market-trades.js';
// Time-only annotations: there is no persisted execution-time USD conversion in Practice.
// Never draw a SOL execution price against the USD chart or invent a candle for a fill.
export function tradeMarkers(
  fills: ChartExecution[],
  mint: string,
  candles: PriceCandle[],
  interval: ChartInterval,
) {
  const buckets = new Set(candles.map((c) => c.time));
  const grouped = new Map<string, { time: number; side: 'BUY' | 'SELL'; count: number }>();
  for (const fill of fills) {
    if (
      fill.mint !== mint ||
      !Number.isSafeInteger(fill.at) ||
      !['BUY', 'SELL'].includes(fill.side)
    )
      continue;
    const time = Math.floor(fill.at / 1000 / seconds[interval]) * seconds[interval];
    if (!buckets.has(time)) continue;
    const key = time + ':' + fill.side;
    const group = grouped.get(key);
    if (group) group.count++;
    else grouped.set(key, { time, side: fill.side, count: 1 });
  }
  return [...grouped.values()]
    .sort((a, b) => a.time - b.time || a.side.localeCompare(b.side))
    .map((g) => ({
      time: g.time,
      position: g.side === 'BUY' ? ('belowBar' as const) : ('aboveBar' as const),
      shape: g.side === 'BUY' ? ('arrowUp' as const) : ('arrowDown' as const),
      color: g.side === 'BUY' ? '#65d9ac' : '#ef7d99',
      text: (g.side === 'BUY' ? 'B' : 'S') + (g.count > 1 ? ' ×' + g.count : ''),
    }));
}
