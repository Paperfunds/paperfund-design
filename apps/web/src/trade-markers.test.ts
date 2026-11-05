import { describe, it, expect } from 'vitest';
import { tradeMarkers, competitionExecutions } from './trade-markers.js';
import type { PracticeFill } from './practice-api.js';
import type { Trade } from './types.js';
const fill: PracticeFill = {
  id: 'fixture-only',
  mint: 'mint-a',
  side: 'BUY',
  input: '10000000',
  output: '1000000',
  decimals: 6,
  fee: '100',
  at: 1800000,
  realizedPnl: '0',
  protocol: 'FIXTURE_ONLY',
};
const candles = [1800, 1860].map((time) => ({
  time,
  open: 1,
  high: 2,
  low: 1,
  close: 2,
  volume: 3,
}));
describe('paper chart annotations', () => {
  it('maps authenticated competition ledger timestamps without invented Practice amounts or USD fills', () => {
    const trade = {
      id: 'fixture-competition-fill',
      owner_user_id: 'alice',
      mint_address: 'mint-a',
      side: 'SELL',
      executed_at: '1970-01-01T00:30:05Z',
    } as Trade;
    const executions = competitionExecutions(
      [
        trade,
        { ...trade, id: 'another-user', owner_user_id: 'bob' },
        { ...trade, id: 'invalid-time', executed_at: 'invalid' },
      ],
      'alice',
    );
    expect(executions).toEqual([{ id: trade.id, mint: 'mint-a', side: 'SELL', at: 1805000 }]);
    expect(tradeMarkers(executions, 'mint-a', candles, '1m')).toMatchObject([
      { time: 1800, text: 'S', position: 'aboveBar' },
    ]);
    expect(tradeMarkers(executions, 'other-mint', candles, '1m')).toEqual([]);
  });
  it('binds the exact mint, actual candle and interval without inventing USD levels', () => {
    const result = tradeMarkers(
      [fill, { ...fill, mint: 'mint-b' }, { ...fill, at: 1920000 }],
      'mint-a',
      candles,
      '1m',
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ time: 1800, text: 'B', position: 'belowBar' });
    expect(result[0]).not.toHaveProperty('price');
  });
  it('groups fills by direction within a real bucket and restores closed-position sells', () => {
    expect(
      tradeMarkers(
        [fill, { ...fill, at: 1801000 }, { ...fill, side: 'SELL', at: 1820000 }],
        'mint-a',
        candles,
        '5m',
      ),
    ).toEqual([
      expect.objectContaining({ time: 1800, text: 'B ×2' }),
      expect.objectContaining({ time: 1800, text: 'S', position: 'aboveBar' }),
    ]);
  });
  it('clears for another mint or absent history', () => {
    expect(tradeMarkers([fill], 'mint-b', candles, '1m')).toEqual([]);
    expect(tradeMarkers([fill], 'mint-a', [], '1m')).toEqual([]);
  });
});
