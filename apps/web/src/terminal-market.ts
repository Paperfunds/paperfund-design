import { useQuery } from '@tanstack/react-query';
import { loadPublicPairs, validMint, type DiscoveredPair } from './market-discovery.js';
import type { PulseSnapshot, PulseToken } from './pulse-model.js';

export interface TokenListing {
  mint: string;
  pair: string;
  dex: string;
  name: string;
  symbol: string;
  priceUsd: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  change5m: number | null;
  change1h?: number | null;
  change24h?: number | null;
  buys5m: number | null;
  sells5m: number | null;
  icon: string | null;
  links: { label: string; url: string }[];
  observedAt: number;
}
type ListingPair = DiscoveredPair & {
  marketCap?: unknown;
  volume?: { h24?: unknown };
  priceChange?: { m5?: unknown; h1?: unknown; h24?: unknown };
  txns?: { m5?: { buys?: unknown; sells?: unknown } };
  info?: {
    imageUrl?: unknown;
    websites?: { url?: unknown }[];
    socials?: { url?: unknown; type?: unknown }[];
  };
};
const number = (v: unknown, negative = false) =>
  typeof v === 'number' && Number.isFinite(v) && (negative || v >= 0) ? v : null;
export function externalUrl(value: unknown): string | null {
  try {
    if (typeof value !== 'string' || value.length > 1024) return null;
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}
export function tokenSocialLinks(links: TokenListing['links']) {
  const seen = new Set<string>();
  return links
    .flatMap((link) => {
      const url = externalUrl(link.url);
      if (!url || seen.has(url)) return [];
      seen.add(url);
      const parsed = new URL(url),
        host = parsed.hostname.replace(/^www\./, '');
      const kind = ['x.com', 'twitter.com'].includes(host)
        ? /\/(?:i\/web\/)?status\/\d+/.test(parsed.pathname)
          ? 'post'
          : 'x'
        : ['t.me', 'telegram.me'].includes(host)
          ? 'telegram'
          : link.label === 'Website'
            ? 'website'
            : 'link';
      const label = {
        x: 'X / Twitter',
        post: 'Tweet / post',
        telegram: 'Telegram',
        website: 'Website',
        link: 'External link',
      }[kind];
      return [{ url, kind, label }];
    })
    .slice(0, 5);
}
export function decodeListings(
  pairs: unknown,
  mints: readonly string[],
  now = Date.now(),
): Record<string, TokenListing> {
  const found: Record<string, TokenListing> = {};
  if (!Array.isArray(pairs)) return found;
  const allowed = new Set(mints);
  for (const value of pairs.slice(0, 500)) {
    if (!value || typeof value !== 'object') continue;
    const p = value as ListingPair,
      mint = p.baseToken?.address;
    // Pair statistics describe its BASE token. Never attribute quote-token price/cap to this mint.
    if (
      p.chainId !== 'solana' ||
      !mint ||
      !allowed.has(mint) ||
      !validMint(mint) ||
      typeof p.pairAddress !== 'string' ||
      !validMint(p.pairAddress)
    )
      continue;
    const liquidity = number(p.liquidity?.usd);
    if (found[mint] && (found[mint]!.liquidityUsd ?? -1) >= (liquidity ?? -1)) continue;
    const links: { label: string; url: string }[] = [];
    for (const w of p.info?.websites?.slice(0, 2) ?? []) {
      const url = externalUrl(w.url);
      if (url) links.push({ label: 'Website', url });
    }
    for (const s of p.info?.socials?.slice(0, 3) ?? []) {
      const url = externalUrl(s.url);
      if (url)
        links.push({ label: typeof s.type === 'string' ? s.type.slice(0, 16) : 'Social', url });
    }
    const price =
      typeof p.priceUsd === 'string' && /^\d+(\.\d+)?$/.test(p.priceUsd) ? Number(p.priceUsd) : NaN;
    found[mint] = {
      mint,
      pair: p.pairAddress,
      dex: typeof p.dexId === 'string' ? p.dexId.slice(0, 32) : 'Unknown DEX',
      name: p.baseToken?.name?.slice(0, 64) ?? '',
      symbol: p.baseToken?.symbol?.slice(0, 24) ?? '',
      priceUsd: Number.isFinite(price) && price >= 0 ? price : null,
      marketCapUsd: number(p.marketCap),
      liquidityUsd: liquidity,
      volume24h: number(p.volume?.h24),
      change5m: number(p.priceChange?.m5, true),
      change1h: number(p.priceChange?.h1, true),
      change24h: number(p.priceChange?.h24, true),
      buys5m: number(p.txns?.m5?.buys),
      sells5m: number(p.txns?.m5?.sells),
      icon: externalUrl(p.info?.imageUrl),
      links,
      observedAt: now,
    };
  }
  return found;
}
export function useTokenListing(mint: string) {
  return useQuery({
    queryKey: ['terminal-listing', mint],
    enabled: !!validMint(mint),
    queryFn: async () => decodeListings(await loadPublicPairs(mint), [mint])[mint] ?? null,
    staleTime: 60000,
    refetchInterval: 60000,
    retry: false,
  });
}
export function usePulseListings(snapshot: PulseSnapshot | null) {
  // Pulse uses the same mint-bound server enrichment as its classification and SSE updates.
  // Trade's independent token lookup remains unchanged.
  return {
    data: Object.fromEntries(
      (snapshot?.tokens ?? []).flatMap((t) => (t.marketData ? [[t.mint, t.marketData]] : [])),
    ) as Record<string, TokenListing>,
  };
}
export function launchpad(token: PulseToken | undefined) {
  return token?.verifiedAt ? 'Pump.fun' : 'Launchpad unverified';
}
export function compact(value: number | null | undefined, suffix = '') {
  return value == null
    ? '—'
    : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(value) +
        suffix;
}
export function marketUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value > 0 && value < 0.01) return '<$0.01';
  return (
    '$' +
    (value >= 1000
      ? compact(value)
      : new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
          value,
        ))
  );
}
export interface ObservedPoint {
  time: number;
  value: number;
  slot: number;
}
export interface ObservedCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  samples: number;
}
export function observedCandles(
  points: readonly ObservedPoint[],
  interval: number,
): ObservedCandle[] {
  const candles = new Map<number, ObservedCandle>();
  for (const p of [...points].sort((a, b) => a.time - b.time)) {
    if (
      !Number.isFinite(p.time) ||
      !Number.isFinite(p.value) ||
      p.value < 0 ||
      !Number.isSafeInteger(p.slot)
    )
      continue;
    const time = Math.floor(p.time / interval) * interval,
      c = candles.get(time);
    if (c) {
      c.high = Math.max(c.high, p.value);
      c.low = Math.min(c.low, p.value);
      c.close = p.value;
      c.samples++;
    } else
      candles.set(time, {
        time,
        open: p.value,
        high: p.value,
        low: p.value,
        close: p.value,
        samples: 1,
      });
  }
  // Missing periods stay missing. No interpolation, invented volume, or synthetic candles.
  return [...candles.values()];
}
