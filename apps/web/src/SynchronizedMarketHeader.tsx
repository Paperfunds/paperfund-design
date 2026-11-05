import { MarketSyncStatus, useMarketSynchronization } from './MarketSyncStatus.js';
import { marketUsd } from './terminal-market.js';
import { formatUnits } from './format.js';
type Creator = { address?: string | null | undefined; verifiedAt?: number | null | undefined };
/** Integration slot for TokenMarketView; indexed 24h metrics must remain separately labeled. */
export function SynchronizedMarketHeader({ mint, pool, creator }: { mint: string; pool: string; creator?: Creator | undefined }) {
  const { synchronization: s } = useMarketSynchronization(mint, pool, creator);
  return <div className="pf-activity-summary">
    <span>Confirmed swap price <b>{s.observed.priceUsd == null ? 'Unavailable' : marketUsd(s.observed.priceUsd)}</b></span>
    <span>Observed volume · ≤5m sample <b>{s.observed.volume5mUsd == null ? 'Unavailable' : marketUsd(s.observed.volume5mUsd)}</b></span>
    <span>Observed change · sample <b>{s.observed.changeObservedPct == null ? 'Unavailable' : s.observed.changeObservedPct.toFixed(2) + '%'}</b></span>
    <MarketSyncStatus mint={mint} pool={pool} creator={creator} />
  </div>;
}
export function DeveloperSampleHolding({ mint, pool, creator }: { mint: string; pool: string; creator?: Creator | undefined }) {
  const { synchronization: s, holders } = useMarketSynchronization(mint, pool, creator);
  return <p>Confirmed creator holdings in account sample: {s.developer.sampledRaw != null && holders.data?.decimals != null
    ? formatUnits(s.developer.sampledRaw, holders.data.decimals, 4) + ' tokens · sampled lower bound'
    : 'Unavailable'}. {s.developer.status}. No complete developer balance or related-wallet ownership is inferred.</p>;
}
