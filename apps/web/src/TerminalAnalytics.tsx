import { DeveloperSampleHolding } from './SynchronizedMarketHeader.js';
import { MarketSyncStatus } from './MarketSyncStatus.js';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useMarketTrades, observedTraders, terminalPath } from './market-trades.js';
import type { PulseToken, PulseSnapshot } from './pulse-model.js';
import { compact, marketUsd } from './terminal-market.js';
import { formatUnits, shorten } from './format.js';
type HolderSample = {
  status: string;
  reason?: string;
  detail?: string;
  checkedAt: number;
  slot?: number;
  decimals?: number;
  supplyRaw?: string;
  sampledTokenAccounts?: number;
  sampledOnCurveOwners?: number;
  excludedProgramCustodyRaw?: string;
  top10LowerBoundPct?: number | null;
  top20LowerBoundPct?: number | null;
  scope?: string;
  rows?: { wallet: string; raw: string; percent: number | null }[];
};
export function TerminalAnalytics({
  kind,
  mint,
  pool,
  token,
  snapshot,
}: {
  kind: 'activity' | 'holders' | 'traders' | 'dev';
  mint: string;
  pool: string;
  token?: PulseToken | undefined;
  snapshot: PulseSnapshot | null;
}) {
  const swaps = useMarketTrades(kind !== 'holders' ? mint : '', pool),
    [windowMinutes, setWindowMinutes] = useState(60);
  const holders = useQuery({
    queryKey: ['terminal-holders', mint],
    enabled: kind === 'holders' && !!mint,
    queryFn: async () => {
      const r = await fetch(terminalPath('holders') + '?mint=' + encodeURIComponent(mint), {
        credentials: 'omit',
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw Error('Holder endpoint HTTP ' + r.status);
      return (await r.json()) as HolderSample;
    },
    staleTime: 60000,
    refetchInterval: 60000,
    retry: false,
  });
  if (kind === 'holders')
    return (
      <div className="pf-terminal-analytics-body">
        <MarketSyncStatus mint={mint} pool={pool} creator={{ address: token?.creatorAddress, verifiedAt: token?.verifiedAt }} />
        <header>
          <h3>Holder accounts · confirmed chain sample</h3>
          <button onClick={() => void holders.refetch()} disabled={holders.isFetching}>
            Refresh
          </button>
        </header>
        {holders.data?.checkedAt && (
          <div className="pf-analytics-freshness">
            Confirmed account sample · {new Date(holders.data.checkedAt).toLocaleTimeString()} ·
            bank {holders.data.slot ?? 'unavailable'}
            {Date.now() - holders.data.checkedAt > 120000 ? ' · stale / retained' : ''}
          </div>
        )}
        {holders.isPending ? (
          <p>Reading mint and largest token accounts…</p>
        ) : holders.data?.status !== 'available' ? (
          <p role="status">
            Holder data unavailable:{' '}
            {holders.data?.reason ?? holders.error?.message ?? 'Provider unavailable'}.{' '}
            {holders.data?.detail} No holder count is inferred.
          </p>
        ) : (
          <>
            <div className="pf-analytics-kpis">
              <span>
                Unique holders <b>Unavailable</b>
              </span>
              <span>
                Sample accounts <b>{holders.data.sampledTokenAccounts}</b>
              </span>
              <span>
                Sample owners <b>{holders.data.sampledOnCurveOwners}</b>
              </span>
              <span>
                Top 10 lower bound <b>{holders.data.top10LowerBoundPct?.toFixed(2) ?? '—'}%</b>
              </span>
              <span>
                Top 20 lower bound <b>{holders.data.top20LowerBoundPct?.toFixed(2) ?? '—'}%</b>
              </span>
            </div>
            <details className="pf-analytics-coverage">
              <summary>Sample scope &amp; supply coverage</summary>
              <p>
                {holders.data.scope} Percentages use total outstanding minted supply, not an
                asserted circulating supply. Ranking selected before atomic balance bank{' '}
                {holders.data.slot}. Complete circulating supply and beneficial-owner totals are
                unavailable.
              </p>
              <p>
                Outstanding supply{' '}
                {formatUnits(holders.data.supplyRaw ?? '0', holders.data.decimals ?? 0, 3)} ·
                sampled off-curve custody excluded{' '}
                {formatUnits(
                  holders.data.excludedProgramCustodyRaw ?? '0',
                  holders.data.decimals ?? 0,
                  3,
                )}{' '}
                tokens.
              </p>
            </details>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Owner wallet</th>
                    <th>Sampled tokens</th>
                    <th>% of issued supply</th>
                    <th>Creator link</th>
                  </tr>
                </thead>
                <tbody>
                  {holders.data.rows?.map((h) => (
                    <tr key={h.wallet}>
                      <td>
                        <a
                          href={'https://solscan.io/account/' + h.wallet}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shorten(h.wallet, 8)} ↗
                        </a>
                      </td>
                      <td>{formatUnits(h.raw, holders.data!.decimals ?? 0, 4)}</td>
                      <td>{h.percent == null ? '—' : h.percent.toFixed(3) + '%'}</td>
                      <td>
                        {token?.verifiedAt && h.wallet === token.creatorAddress ? 'Confirmed curve creator' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  if (kind === 'dev') {
    const creatorActivity = observedTraders(
      (swaps.data?.trades ?? []).filter((t) => t.wallet === token?.creatorAddress),
      0,
    ).find((r) => r.wallet === token?.creatorAddress);
    const related = token?.creatorAddress
      ? (snapshot?.tokens.filter(
          (t) => token.verifiedAt && t.verifiedAt && t.creatorAddress === token.creatorAddress,
        ) ?? [])
      : [];
    return (
      <div className="pf-terminal-analytics-body">
        <MarketSyncStatus mint={mint} pool={pool} creator={{ address: token?.creatorAddress, verifiedAt: token?.verifiedAt }} />
        <DeveloperSampleHolding mint={mint} pool={pool} creator={{ address: token?.creatorAddress, verifiedAt: token?.verifiedAt }} />
        <h3>Dev Tokens · shared confirmed creator field</h3>
        <p>
          {token?.creatorAddress ? (
            <a
              href={'https://solscan.io/account/' + token.creatorAddress}
              target="_blank"
              rel="noreferrer"
            >
              {token.creatorAddress} ↗
            </a>
          ) : (
            'Creator identity unavailable'
          )}
        </p>
        <p>
          Only tokens in retained verified discovery with this exact on-chain creator field. This is
          not a complete creator history or a claim that related wallets share ownership. Creator
          selling appears only if that same wallet is present in observed swaps. Dev balances
          outside the holder sample and lifetime P&amp;L are unavailable.
        </p>
        <div className="pf-analytics-kpis">
          <span>
            Creator observed buys{' '}
            <b>{creatorActivity ? '$' + compact(creatorActivity.buysUsd) : 'Unavailable'}</b>
          </span>
          <span>
            Creator observed sells{' '}
            <b>{creatorActivity ? '$' + compact(creatorActivity.sellsUsd) : 'Unavailable'}</b>
          </span>
          <span>
            Creator sampled trades <b>{creatorActivity?.count ?? 'Unavailable'}</b>
          </span>
        </div>
        <p>
          Selected pool's retained swaps only; no observed creator activity is not proof that the
          creator has never traded.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Created · UTC</th>
                <th>Migration</th>
                <th>USD cap</th>
                <th>Liquidity</th>
              </tr>
            </thead>
            <tbody>
              {related.slice(0, 100).map((t) => (
                <tr key={t.mint}>
                  <td>
                    <Link to={'/practice?mint=' + t.mint}>
                      {t.symbol} · {shorten(t.mint)}
                    </Link>
                  </td>
                  <td>{t.createdAt ? new Date(t.createdAt).toISOString() : 'Unverified'}</td>
                  <td>{t.migrationVerifiedAt ? 'Verified' : 'Not verified'}</td>
                  <td>
                    {t.marketCapUsd != null && Date.now() - (t.marketCapUsdAt ?? 0) < 120000
                      ? '$' + compact(t.marketCapUsd)
                      : '—'}
                  </td>
                  <td>
                    {t.marketData?.liquidityUsd != null &&
                    Date.now() - t.marketData.observedAt < 120000
                      ? '$' + compact(t.marketData.liquidityUsd)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!related.length && (
          <p>No verified creator-linked tokens available in the current discovery record.</p>
        )}
      </div>
    );
  }
  const trades = swaps.data?.trades ?? [],
    filtered = trades.filter((t) => t.time >= Date.now() - windowMinutes * 60000),
    rows = observedTraders(trades, Date.now() - windowMinutes * 60000);
  return (
    <div className="pf-terminal-analytics-body">
      <MarketSyncStatus mint={mint} pool={pool} creator={{ address: token?.creatorAddress, verifiedAt: token?.verifiedAt }} />
      <header>
        <h3>{kind === 'activity' ? 'Recent market swaps' : 'Top Traders · observed activity'}</h3>
        <select
          aria-label="Market activity window"
          value={windowMinutes}
          onChange={(e) => setWindowMinutes(Number(e.target.value))}
        >
          <option value={1}>1 minute</option>
          <option value={5}>5 minutes</option>
          <option value={60}>1 hour</option>
          <option value={1440}>24 hours</option>
        </select>
      </header>
      <div className="pf-activity-summary">
        <span>
          {swaps.data?.delivery === 'helius-confirmed' && swaps.data.streamState === 'live'
            ? '● Confirmed stream'
            : '◷ Delayed / unavailable'}
        </span>
        <span>{filtered.length} observed swaps</span>
        <span className="pf-up">{filtered.filter((t) => t.side === 'BUY').length} buys</span>
        <span className="pf-down">{filtered.filter((t) => t.side === 'SELL').length} sells</span>
        <span>
          Volume{' '}
          <b>
            {filtered.length
              ? '$' + compact(filtered.reduce((sum, t) => sum + t.volumeUsd, 0))
              : '—'}
          </b>{' '}
          · retained sample
        </span>
      </div>
      <details className="pf-analytics-coverage">
        <summary>
          Source &amp; coverage ·{' '}
          {swaps.data?.checkedAt
            ? new Date(swaps.data.checkedAt).toLocaleTimeString()
            : 'awaiting provider'}{' '}
          · {swaps.data?.gaps.length ?? 0} gaps
        </summary>
        <p>
          {swaps.data?.source ?? 'Market provider'} · selected chart pool · {filtered.length}{' '}
          retained swaps in this window.{' '}
          {swaps.data?.delivery === 'helius-confirmed' && swaps.data.streamState === 'live'
            ? 'Confirmed stream, browser updates batched ≤500ms.'
            : 'Delayed REST polling ≈12s; free fetches capped at300 trades.'}{' '}
          {swaps.data?.gaps.length ?? 0} detected gaps.{' '}
          {swaps.data?.lastError ?? swaps.error?.message ?? ''}
        </p>
      </details>
      {kind === 'traders' ? (
        <>
          <p>
            Ranks by observed buy+sell USD volume only. Net tokens are change within this incomplete
            sample, not wallet holdings. Realized/unrealized P&amp;L and cost basis are unavailable.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Wallet</th>
                  <th>Buy USD</th>
                  <th>Sell USD</th>
                  <th>Net tokens · sample</th>
                  <th>Trades</th>
                  <th>P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.wallet}>
                    <td>
                      <a
                        href={'https://solscan.io/account/' + r.wallet}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shorten(r.wallet, 8)} ↗
                        {r.wallet === token?.creatorAddress ? ' · Creator' : ''}
                      </a>
                    </td>
                    <td className="pf-up">{marketUsd(r.buysUsd)}</td>
                    <td className="pf-down">{marketUsd(r.sellsUsd)}</td>
                    <td>{compact(r.netTokens)}</td>
                    <td>{r.count}</td>
                    <td>Unavailable</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>UTC time</th>
                <th>Side</th>
                <th>USD</th>
                <th>Tokens</th>
                <th>Price USD</th>
                <th>Wallet / Tx</th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice(-100)
                .reverse()
                .map((t) => (
                  <tr key={t.id}>
                    <td>{new Date(t.time).toISOString().slice(11, 19)}</td>
                    <td className={t.side === 'BUY' ? 'pf-up' : 'pf-down'}>{t.side}</td>
                    <td>{marketUsd(t.volumeUsd)}</td>
                    <td>{compact(t.quantity)}</td>
                    <td>${t.priceUsd.toPrecision(5)}</td>
                    <td>
                      <a
                        href={'https://solscan.io/account/' + t.wallet}
                        aria-label={'Wallet ' + t.wallet}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shorten(t.wallet, 5)}
                      </a>{' '}
                      <a
                        href={'https://solscan.io/tx/' + t.signature}
                        aria-label={'Transaction ' + t.signature}
                        title="View transaction"
                        target="_blank"
                        rel="noreferrer"
                      >
                        ↗
                      </a>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {!filtered.length && (
        <p className="pf-analytics-empty" role="status">
          {swaps.isFetching
            ? 'Loading genuine pool trades…'
            : 'No observed swaps available in this window; no activity is synthesized.'}
        </p>
      )}
    </div>
  );
}
