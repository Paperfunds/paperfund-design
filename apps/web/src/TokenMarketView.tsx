import { useState, type ReactNode } from 'react';
import { TerminalAnalytics } from './TerminalAnalytics.js';
import { Link } from 'react-router-dom';
import { usePulseFeed } from './use-pulse.js';
import { useTokenListing, launchpad, compact, tokenSocialLinks } from './terminal-market.js';
import { ContractAddress, TokenAvatar } from './TokenIdentity.js';
import { WebsiteMarketChart } from './WebsiteMarkets.js';
import { tokenAge } from './pulse-model.js';
import type { ChartExecution } from './trade-markers.js';

export type MarketTab =
  'positions' | 'history' | 'info' | 'activity' | 'holders' | 'traders' | 'dev';
export function TicketMarketSummary({ mint }: { mint: string }) {
  const { data } = useTokenListing(mint);
  const { snapshot, now } = usePulseFeed();
  const shared = snapshot?.tokens.find((t) => t.mint === mint)?.marketData;
  const dex =
    shared?.mint === mint && now - shared.observedAt < 120000
      ? shared
      : data?.mint === mint && now - data.observedAt < 120000
        ? data
        : null;
  return (
    <div
      className="pf-ticket-market"
      title={
        dex
          ? 'DEX Screener · USD · fetched ' +
            new Date(dex.observedAt).toLocaleTimeString() +
            ' · pool ' +
            dex.pair
          : 'No fresh indexed market listing. Executable Practice quotes are independent.'
      }
    >
      <span>
        {dex?.symbol || 'Selected mint'}
        <small>{dex?.name || 'Solana mainnet'}</small>
      </span>
      <strong>
        {dex?.priceUsd != null ? '$' + dex.priceUsd.toPrecision(5) : 'Price unavailable'}
        <small>Informational · USD</small>
      </strong>
    </div>
  );
}
export function TokenMarketView({
  mint,
  tab,
  onTab,
  portfolio,
  history,
  fills = [],
  accountOnly = false,
}: {
  mint: string;
  tab: MarketTab;
  onTab(value: MarketTab): void;
  portfolio: ReactNode;
  history: ReactNode;
  fills?: ChartExecution[];
  accountOnly?: boolean;
}) {
  const { snapshot, now, healthy } = usePulseFeed(),
    listing = useTokenListing(mint);
  const [chartPool, setChartPool] = useState('');
  const token = snapshot?.tokens.find((t) => t.mint === mint);
  const dex =
    token?.marketData?.mint === mint && now - token.marketData.observedAt < 120000
      ? token.marketData
      : listing.data?.mint === mint && now - listing.data.observedAt < 120000
        ? listing.data
        : null;
  const freshCap =
    token?.marketCapUsd != null && now - (token.marketCapUsdAt ?? 0) < 120000
      ? token.marketCapUsd
      : null;
  const freshSolCap =
    token?.marketCapSol != null && now - (token.progressVerifiedAt ?? 0) < 60000
      ? token.marketCapSol
      : null;
  const metadata = listing.data?.mint === mint ? listing.data : null;
  const freshListing =
    metadata && now - metadata.observedAt < 120000 && (!dex || metadata.pair === dex.pair)
      ? metadata
      : null;
  const change1h = dex?.change1h ?? freshListing?.change1h;
  const change24h = dex?.change24h ?? freshListing?.change24h;
  const links = tokenSocialLinks([...(token?.links ?? []), ...(metadata?.links ?? [])]);
  const name = token?.name || dex?.name || 'Solana token',
    symbol = token?.symbol || dex?.symbol || 'TOKEN';
  const progress =
    token?.progressVerifiedAt && now - token.progressVerifiedAt <= 60000
      ? token.curveProgressPct
      : null;
  if (accountOnly)
    return (
      <div className="pf-token-market pf-portfolio-content">
        <nav className="pf-analytics-tabs" aria-label="Portfolio sections">
          <button aria-pressed={tab !== 'history'} onClick={() => onTab('positions')}>
            Positions
          </button>
          <button aria-pressed={tab === 'history'} onClick={() => onTab('history')}>
            Trade history
          </button>
        </nav>
        {tab === 'history' ? history : portfolio}
      </div>
    );
  return (
    <div className="pf-token-market">
      <div className="pf-token-breadcrumb">
        <Link to="/pulse">← Back to Pulse</Link>
        <span className={healthy ? 'pf-up' : 'muted'}>
          {healthy ? '● Live discovery' : '● Discovery delayed'}
        </span>
      </div>
      <section className="pf-token-summary" aria-label="Token summary">
        <header className="pf-token-header">
          <TokenAvatar symbol={symbol} icon={token?.icon} fallbackIcon={metadata?.icon} />
          <div>
            <span className="eyebrow">
              SOLANA <span className="pf-summary-ticker">{symbol}</span>
            </span>
            <h1 title={name}>{mint ? name : 'Select a token from Pulse'}</h1>
            <ContractAddress mint={mint || 'No mint selected'} />
          </div>
          <span className="pf-token-platform">
            ◈ {launchpad(token)}
            {token && (
              <small>
                {token.createdAt && token.creationVerifiedAt
                  ? 'Created ' + tokenAge(token.createdAt, now) + ' ago · '
                  : ''}
                {token.migrationVerifiedAt ? 'Migration verified ' : 'First observed '}
                {tokenAge(token.migrationVerifiedAt ?? token.firstSeenAt, now)} ago
              </small>
            )}
          </span>
        </header>
        <div className="pf-trade-socials" aria-label="Token social links">
          {links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Provider-listed; ownership not verified"
            >
              {link.label} ↗
            </a>
          ))}
          {!links.length && <small>No provider-listed socials available</small>}
          <span className="pf-trade-verified">
            {token?.migrationVerifiedAt
              ? '✓ Migration verified'
              : token?.verifiedAt
                ? '✓ Curve identity verified'
                : 'Identity verification unavailable'}
          </span>
        </div>
        <div className="pf-token-stats">
          <div
            title={
              (freshCap != null
                ? token?.marketCapSource || 'Verified supply / sourced USD'
                : dex?.marketCapUsd != null
                  ? 'DEX Screener listing'
                  : token?.marketCapSource || 'Unavailable') +
              ' · ' +
              (freshCap != null
                ? new Date(token!.marketCapUsdAt!).toLocaleTimeString()
                : dex?.marketCapUsd != null
                  ? new Date(dex.observedAt).toLocaleTimeString()
                  : token?.marketCapAt
                    ? new Date(token.marketCapAt).toLocaleTimeString()
                    : 'source timestamp unavailable')
            }
          >
            <small>
              Market cap{' '}
              <span className="pf-stat-unit">
                {freshCap != null || dex?.marketCapUsd != null
                  ? 'USD'
                  : freshSolCap != null
                    ? 'SOL'
                    : ''}
              </span>
            </small>
            <strong>
              {freshCap != null
                ? '$' + compact(freshCap)
                : dex?.marketCapUsd != null
                  ? '$' + compact(dex.marketCapUsd)
                  : freshSolCap != null
                    ? compact(freshSolCap, ' SOL')
                    : '—'}
            </strong>
          </div>
          <div>
            <small>Price · USD</small>
            <strong>{dex?.priceUsd != null ? '$' + dex.priceUsd.toPrecision(5) : '—'}</strong>
          </div>
          <div>
            <small>Pair volume · 24h</small>
            <strong>{dex?.volume24h != null ? '$' + compact(dex.volume24h) : '—'}</strong>
          </div>
          <div>
            <small>Pair liquidity</small>
            <strong>{dex?.liquidityUsd != null ? '$' + compact(dex.liquidityUsd) : '—'}</strong>
          </div>
          <div>
            <small>Price change · 5m</small>
            <strong className={dex?.change5m == null ? '' : dex.change5m < 0 ? 'pf-down' : 'pf-up'}>
              {dex?.change5m != null ? dex.change5m.toFixed(2) + '%' : '—'}
            </strong>
          </div>
          <div>
            <small>Verified curve</small>
            <strong>
              {progress != null
                ? progress.toFixed(1) + '%'
                : token?.migrationVerifiedAt
                  ? 'Migrated'
                  : '—'}
            </strong>
          </div>
        </div>
        <div className="pf-summary-detail">
          <span>
            5m activity <b className="pf-up">{dex?.buys5m ?? '—'} buys</b>
            <b className="pf-down">{dex?.sells5m ?? '—'} sells</b>
          </span>
          <span title="A complete unique-holder total is not supplied. See Holders for the confirmed account sample.">
            Holders <b>Unavailable</b>
          </span>
          <span title="Only retained discovery records with the exact confirmed creator; not lifetime creator history.">
            Dev tokens · retained{' '}
            <b>
              {token?.creatorAddress
                ? (snapshot?.tokens.filter(
                    (t) => t.verifiedAt && t.creatorAddress === token.creatorAddress,
                  ).length ?? '—')
                : '—'}
            </b>
          </span>
          <span>
            1h{' '}
            <b className={change1h == null ? '' : change1h < 0 ? 'pf-down' : 'pf-up'}>
              {change1h == null ? '—' : change1h.toFixed(2) + '%'}
            </b>
            24h{' '}
            <b className={change24h == null ? '' : change24h < 0 ? 'pf-down' : 'pf-up'}>
              {change24h == null ? '—' : change24h.toFixed(2) + '%'}
            </b>
          </span>
          <a
            href={'https://solscan.io/token/' + encodeURIComponent(mint)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Explorer ↗
          </a>
        </div>
      </section>
      <WebsiteMarketChart
        mint={mint}
        fills={fills}
        currentSupply={
          token?.mintSupplyRaw &&
          token.decimals != null &&
          token.verifiedAt &&
          now - token.verifiedAt < 120000
            ? Number(token.mintSupplyRaw) / 10 ** token.decimals
            : undefined
        }
        onPoolChange={setChartPool}
      />
      <section className="pf-token-analytics">
        <nav className="pf-analytics-tabs" aria-label="Token intelligence">
          {(['activity', 'holders', 'traders', 'dev'] as const).map((value) => (
            <button key={value} aria-pressed={tab === value} onClick={() => onTab(value)}>
              {
                {
                  activity: 'Activity',
                  holders: 'Holders',
                  traders: 'Top Traders',
                  dev: 'Dev Tokens',
                }[value]
              }
            </button>
          ))}
          <button aria-pressed={tab === 'positions'} onClick={() => onTab('positions')}>
            Positions
          </button>
          <button aria-pressed={tab === 'history'} onClick={() => onTab('history')}>
            Trade history
          </button>
          <button aria-pressed={tab === 'info'} onClick={() => onTab('info')}>
            Token information
          </button>
        </nav>
        {['activity', 'holders', 'traders', 'dev'].includes(tab) ? (
          <TerminalAnalytics
            kind={tab as 'activity' | 'holders' | 'traders' | 'dev'}
            mint={mint}
            pool={chartPool}
            token={token}
            snapshot={snapshot}
          />
        ) : tab === 'positions' ? (
          portfolio
        ) : tab === 'history' ? (
          history
        ) : tab === 'info' ? (
          <div className="pf-analytics-info">
            <div>
              <span>Network</span>
              <b>Solana mainnet</b>
            </div>
            <div>
              <span>Launchpad</span>
              <b>{launchpad(token)}</b>
            </div>
            <div>
              <span>DEX-reported venue</span>
              <b>{dex?.dex ?? 'Not indexed / unavailable'}</b>
            </div>
            <div>
              <span>Curve creator · on-chain</span>
              {token?.creatorAddress ? (
                <a
                  href={'https://solscan.io/account/' + token.creatorAddress}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {token.creatorAddress} ↗
                </a>
              ) : (
                <b>Unavailable</b>
              )}
            </div>
            <div>
              <span>Mint authority</span>
              <b>
                {token?.mintAuthorityDisabled == null
                  ? 'Unavailable'
                  : token.mintAuthorityDisabled
                    ? 'Disabled'
                    : 'Enabled'}
              </b>
            </div>
            <div>
              <span>Freeze authority</span>
              <b>
                {token?.freezeAuthorityDisabled == null
                  ? 'Unavailable'
                  : token.freezeAuthorityDisabled
                    ? 'Disabled'
                    : 'Enabled'}
              </b>
            </div>
            <div>
              <span>Token program</span>
              <b>
                {token?.tokenProgram?.startsWith('Tokenz')
                  ? 'Token-2022'
                  : token?.tokenProgram
                    ? 'SPL Token'
                    : 'Unavailable'}
              </b>
            </div>
            <div>
              <span>Holders / creator holdings / risk score</span>
              <b>Unavailable from current providers</b>
            </div>
            {token?.description && <p>{token.description}</p>}
            <p>
              Curve identity and migrations come from the existing mainnet verification feed. DEX
              statistics describe one mint-matched base-token pair; they are not independently
              verified reserve or risk guarantees and do not price Practice orders. Authority flags
              do not certify safety, holder concentration or Token-2022 extensions.
            </p>
            <div className="pf-token-links">
              {links.map((link, i) => (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label} ↗
                </a>
              ))}
              <small>
                {links.length
                  ? 'Provider-listed links; ownership not verified.'
                  : 'No provider-listed social/developer links available.'}
              </small>
              <small>Metadata: {token?.metadataStatus ?? 'Unavailable'}</small>
            </div>
          </div>
        ) : (
          <div className="pf-analytics-info">
            <div>
              <span>Buys · last 5m</span>
              <b>{dex?.buys5m ?? '—'}</b>
            </div>
            <div>
              <span>Sells · last 5m</span>
              <b>{dex?.sells5m ?? '—'}</b>
            </div>
            <p>
              DEX-reported counts, not a live transaction tape. A verified trade-by-trade feed is
              not connected. No market activity is synthesized.
            </p>
          </div>
        )}
        {listing.isFetching && <small>Refreshing optional market listing…</small>}
        {listing.isError && (
          <small>
            Market listing unavailable. On-chain chart and executable Practice quotes remain
            independent.
          </small>
        )}
      </section>
      <div className="pf-market-freshness">
        DEX Screener ·{' '}
        {dex
          ? 'fetched ' + new Date(dex.observedAt).toLocaleTimeString() + ' · pair ' + dex.pair
          : 'no fresh indexed statistics'}{' '}
        · Curve observations:{' '}
        {token?.progressVerifiedAt
          ? new Date(token.progressVerifiedAt).toLocaleTimeString()
          : 'unavailable'}
      </div>
    </div>
  );
}
