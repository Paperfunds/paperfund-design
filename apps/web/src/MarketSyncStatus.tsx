import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { terminalPath, useMarketTrades } from './market-trades.js';
import { marketSynchronization, type HolderSnapshot } from './market-synchronization.js';

export function useMarketSynchronization(mint: string, pool: string, creator: { address?: string | null | undefined; verifiedAt?: number | null | undefined } = {}) {
  const feed = useMarketTrades(mint, pool);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  const holders = useQuery({
    queryKey: ['terminal-holders', mint], enabled: !!mint,
    queryFn: async () => {
      const r = await fetch(terminalPath('holders') + '?mint=' + encodeURIComponent(mint), { credentials: 'omit', signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw Error('Holder endpoint HTTP ' + r.status);
      return await r.json() as HolderSnapshot;
    }, staleTime: 60000, refetchInterval: 60000, retry: false,
  });
  return { feed, holders, synchronization: marketSynchronization(feed.data, holders.data, creator, now) };
}
export function MarketSyncStatus({ mint, pool, creator }: { mint: string; pool: string; creator?: { address?: string | null | undefined; verifiedAt?: number | null | undefined } | undefined }) {
  const { synchronization: s } = useMarketSynchronization(mint, pool, creator);
  const time = (at: number | null | undefined) => at ? new Date(at).toISOString().slice(11, 19) + ' UTC' : 'unavailable';
  return <div className="pf-analytics-freshness" role="group" aria-label="Independent market data freshness">
    <span>Chart: {s.charts.status} · last swap {time(s.charts.lastEventAt)}</span>{' · '}
    <span>Trades: {s.trades.status} · last swap {time(s.trades.lastEventAt)}</span>{' · '}
    <span>Holders: {s.holders.status} · last reconciliation {time(s.holders.lastSuccessfulAt)}</span>{' · '}
    <span>Developer: {s.developer.status} · identity verified {time(s.developer.verifiedAt)}</span>
  </div>;
}
