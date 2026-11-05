import { describe, it, expect } from 'vitest';
import { filterColumn, defaultColumn, interactionOrder } from './pulse-controls.js';
import type { PulseToken } from './pulse-model.js';
import type { TokenListing } from './terminal-market.js';
const now = 1000000,
  mint = 'So11111111111111111111111111111111111111112';
const token: PulseToken = {
  mint,
  name: 'Fixture',
  symbol: 'TEST',
  stage: 'new',
  firstSeenAt: now - 60000,
  lastSeenAt: now,
  source: 'pumpportal',
  marketCapSol: 10,
  curveProgressPct: null,
};
const listing = {
  mint,
  observedAt: now,
  marketCapUsd: 0,
  liquidityUsd: 0,
  volume24h: 0,
  buys5m: 0,
  sells5m: 0,
  links: [],
} as unknown as TokenListing;
describe('column filters preserve real unknown-vs-zero semantics', () => {
  it('searches a column independently by name, symbol or exact mint and accepts legacy saved controls', () => {
    for (const query of ['fixTURE', 'test', mint])
      expect(
        filterColumn([token], { ...defaultColumn, query }, undefined, now, 'newest'),
      ).toHaveLength(1);
    expect(
      filterColumn([token], { ...defaultColumn, query: 'unmatched' }, undefined, now, 'newest'),
    ).toHaveLength(0);
    const legacy = { ...defaultColumn };
    delete legacy.query;
    expect(filterColumn([token], legacy, undefined, now, 'newest')).toHaveLength(1);
  });
  it('holds interaction order while using live values and never resurrecting a removed or reclassified row', () => {
    const updated = { ...token, marketCapSol: 42 },
      newcomer = { ...token, mint: 'new-fixture' };
    const next = [newcomer, updated];
    const ordered = interactionOrder(next, [mint, 'removed-fixture']);
    expect(ordered.map((t) => t.mint)).toEqual([mint, 'new-fixture']);
    expect(ordered[0]).toBe(updated);
    expect(next[0]).toBe(newcomer);
    expect(interactionOrder([newcomer], [mint])).toEqual([newcomer]);
    expect(interactionOrder(next)).toBe(next);
  });
  it('keeps genuine zero metrics but never treats missing metrics as zero', () => {
    expect(
      filterColumn(
        [token],
        { ...defaultColumn, minLiquidity: '0' },
        { [mint]: listing },
        now,
        'newest',
      ),
    ).toHaveLength(1);
    expect(
      filterColumn([token], { ...defaultColumn, minLiquidity: '0' }, undefined, now, 'newest'),
    ).toHaveLength(0);
  });
  it('does not use expired financial data to pass a filter', () =>
    expect(
      filterColumn(
        [token],
        { ...defaultColumn, minVolume: '0' },
        { [mint]: listing },
        now + 120001,
        'newest',
      ),
    ).toHaveLength(0));
  it('requires explicit verified authority flags and supplied social links', () => {
    expect(
      filterColumn([token], { ...defaultColumn, authorities: true }, undefined, now, 'newest'),
    ).toHaveLength(0);
    expect(
      filterColumn(
        [{ ...token, mintAuthorityDisabled: true, freezeAuthorityDisabled: true }],
        { ...defaultColumn, authorities: true },
        undefined,
        now,
        'newest',
      ),
    ).toHaveLength(1);
    expect(
      filterColumn(
        [{ ...token, links: [{ label: 'twitter', url: 'https://x.com/token/status/123' }] }],
        { ...defaultColumn, socials: true },
        undefined,
        now,
        'newest',
      ),
    ).toHaveLength(1);
  });
  it('uses one unit per sort and puts missing values after actual zeros', () => {
    const unknown = {
      ...token,
      mint: 'BJVWrJnwMkZ5upJcQqeQ4eShsfuvcEgzxnr6jprBpump',
      marketCapSol: 999,
    };
    expect(
      filterColumn(
        [unknown, token],
        { ...defaultColumn, sort: 'capUsd' },
        { [mint]: listing },
        now,
        'newest',
      )[0]?.mint,
    ).toBe(mint);
    expect(
      filterColumn([token], { ...defaultColumn, maxAge: '0.5' }, undefined, now, 'newest'),
    ).toHaveLength(0);
  });
});
