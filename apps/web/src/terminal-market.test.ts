import { describe, it, expect } from 'vitest';
import {
  decodeListings,
  externalUrl,
  observedCandles,
  launchpad,
  tokenSocialLinks,
  marketUsd,
} from './terminal-market.js';
const mint = 'So11111111111111111111111111111111111111112',
  pair = 'BJVWrJnwMkZ5upJcQqeQ4eShsfuvcEgzxnr6jprBpump';
describe('verified display-only market boundaries', () => {
  it('keeps missing market amounts separate from real zero and very small positive trades', () => {
    expect(marketUsd(null)).toBe('—');
    expect(marketUsd(0)).toBe('$0.00');
    expect(marketUsd(0.0006)).toBe('<$0.01');
    expect(marketUsd(1.257)).toBe('$1.26');
  });
  it('shows only supplied safe social links and distinguishes a post from an X profile', () => {
    const links = tokenSocialLinks([
      { label: 'twitter', url: 'https://x.com/token' },
      { label: 'twitter', url: 'https://x.com/token/status/123' },
      { label: 'telegram', url: 'https://t.me/token' },
      { label: 'Website', url: 'https://token.example' },
      { label: 'twitter', url: 'javascript:alert(1)' },
      { label: 'twitter', url: 'https://x.com/token' },
    ]);
    expect(links.map((l) => l.kind)).toEqual(['x', 'post', 'telegram', 'website']);
    expect(
      tokenSocialLinks([{ label: 'twitter', url: 'https://unrelated.example' }])[0]?.kind,
    ).toBe('link');
  });
  it('attributes DEX pair data only to the exact base mint and keeps missing fields unavailable', () => {
    const base = {
      chainId: 'solana',
      pairAddress: pair,
      baseToken: { address: mint, symbol: 'SOL' },
      priceUsd: '123.45',
      volume: { h24: 120 },
      priceChange: { m5: -3, h1: 0, h24: 4.5 },
      liquidity: { usd: 400 },
    };
    expect(decodeListings([base], [mint])[mint]).toMatchObject({
      mint,
      priceUsd: 123.45,
      volume24h: 120,
      change5m: -3,
      change1h: 0,
      change24h: 4.5,
      liquidityUsd: 400,
      marketCapUsd: null,
    });
    expect(
      decodeListings(
        [{ ...base, baseToken: { address: pair }, quoteToken: { address: mint } }],
        [mint],
      ),
    ).toEqual({});
    expect(decodeListings([{ ...base, chainId: 'ethereum' }], [mint])).toEqual({});
    expect(
      decodeListings([{ ...base, priceUsd: 'NaN', volume: { h24: -1 } }], [mint])[mint],
    ).toMatchObject({ priceUsd: null, volume24h: null });
  });
  it('selects one liquid mint-matched pair rather than adding unrelated volume or liquidity', () => {
    const base = {
      chainId: 'solana',
      pairAddress: pair,
      baseToken: { address: mint },
      volume: { h24: 10 },
    };
    expect(
      decodeListings(
        [
          { ...base, liquidity: { usd: 10 } },
          { ...base, liquidity: { usd: 20 }, volume: { h24: 40 } },
        ],
        [mint],
      )[mint],
    ).toMatchObject({ liquidityUsd: 20, volume24h: 40 });
  });
  it('blocks dangerous URLs and does not infer a launchpad from a ticker or mint suffix', () => {
    expect(externalUrl('javascript:alert(1)')).toBeNull();
    expect(externalUrl('https://user:password@example.com')).toBeNull();
    expect(externalUrl('http://example.com')).toBeNull();
    expect(launchpad(undefined)).toBe('Launchpad unverified');
  });
  it('builds OHLC from real observations without filling missing intervals or inventing volume', () => {
    const c = observedCandles(
      [
        { time: 1000, value: 10, slot: 1 },
        { time: 2000, value: 15, slot: 2 },
        { time: 4000, value: 12, slot: 3 },
        { time: 121000, value: 20, slot: 4 },
      ],
      60000,
    );
    expect(c).toEqual([
      { time: 0, open: 10, high: 15, low: 10, close: 12, samples: 3 },
      { time: 120000, open: 20, high: 20, low: 20, close: 20, samples: 1 },
    ]);
    expect(c[0]).not.toHaveProperty('volume');
    expect(observedCandles([{ time: 1000, value: NaN, slot: 1 }], 60000)).toEqual([]);
  });
});
