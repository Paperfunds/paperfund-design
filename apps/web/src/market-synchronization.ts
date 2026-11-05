import type { SwapFeed } from './market-trades.js';

export interface HolderSnapshot {
  status: string;
  checkedAt: number;
  lastSuccessfulAt?: number | null;
  lastAttemptAt?: number;
  slot?: number;
  decimals?: number;
  supplyRaw?: string;
  reason?: string;
  rows?: { wallet: string; raw: string; percent: number | null }[];
}
export function marketSynchronization(
  feed: SwapFeed | undefined,
  holder: HolderSnapshot | undefined,
  creator: { address?: string | null | undefined; verifiedAt?: number | null | undefined },
  now: number,
) {
  const last = feed?.trades.at(-1);
  const connected = feed?.delivery === 'helius-confirmed' && feed.streamState === 'live';
  const age = last ? Math.max(0, now - last.time) : null;
  const sampleAt = holder?.lastSuccessfulAt ?? (holder?.status === 'available' ? holder.checkedAt : null);
  const holderFresh = holder?.status === 'available' && sampleAt != null && now - sampleAt <= 120000;
  const confirmedCreator = !!creator.address && !!creator.verifiedAt;
  const creatorRow = confirmedCreator ? holder?.rows?.find((r) => r.wallet === creator.address) : undefined;
  const observed = feed?.trades.filter((t) => t.time >= now - 300000) ?? [];
  const baseline = observed[0];
  return {
    charts: { status: connected ? 'confirmed' : 'delayed', lastEventAt: last?.time ?? null, ageMs: age },
    trades: { status: connected ? 'confirmed' : 'delayed', lastEventAt: last?.time ?? null, ageMs: age },
    holders: { status: holderFresh ? 'sample' : sampleAt ? 'stale' : 'unavailable', lastSuccessfulAt: sampleAt, ageMs: sampleAt ? Math.max(0, now - sampleAt) : null },
    developer: { status: !confirmedCreator ? 'unavailable' : holderFresh && creatorRow ? 'sample' : 'identity-only', verifiedAt: confirmedCreator ? creator.verifiedAt : null, sampledRaw: holderFresh ? creatorRow?.raw ?? null : null },
    // All values describe this selected pool's retained window; never claim rolling global 24h stats.
    observed: {
      priceUsd: connected && age != null && age <= 30000 ? last?.priceUsd ?? null : null,
      volume5mUsd: observed.length ? observed.reduce((n, t) => n + t.volumeUsd, 0) : null,
      changeObservedPct: last && baseline && last !== baseline ? (last.priceUsd / baseline.priceUsd - 1) * 100 : null,
      since: baseline?.time ?? null, swaps: observed.length, partial: true as const,
    },
  };
}
