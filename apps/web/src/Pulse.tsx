import { useEffect, useState, useRef } from 'react';
import { freshPulseValue } from '../../../packages/shared/src/pulse-classification.mjs';
import { Link } from 'react-router-dom';
import {
  stageTokens,
  tokenAge,
  SOLANA_MINT,
  type PulseStage,
  type PulseToken,
} from './pulse-model.js';
import { usePulseFeed } from './use-pulse.js';
import {
  compact,
  launchpad,
  usePulseListings,
  tokenSocialLinks,
  type TokenListing,
} from './terminal-market.js';
import { ContractAddress, TokenAvatar } from './TokenIdentity.js';
import { validMint } from './market-discovery.js';
import { competitionTrading, tradeUrl } from './trading-account.js';
import { CompetitionPulseBuy } from './CompetitionPulseBuy.js';
import { PulseBuyDialog, PulseBuyToolbar, usePulseBuy } from './PulseBuy.js';
import { PulseColumnControls } from './PulseColumnControls.js';
import {
  defaultColumn,
  filterColumn,
  interactionOrder,
  type ColumnControls,
} from './pulse-controls.js';

const stages: { key: PulseStage; title: string; subtitle: string }[] = [
  { key: 'new', title: 'New Pairs', subtitle: 'Observed token launches' },
  { key: 'stretch', title: 'Pre-Migration', subtitle: 'Pump.fun · age <60m · fresh MC >$7K' },
  { key: 'migrated', title: 'Migrated', subtitle: 'Verified Pump→PumpSwap · 24h vol ≥$50K' },
];
function stored<T>(key: string, fallback: T, check: (value: unknown) => boolean): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return check(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}
function TokenRow({
  token,
  now,
  listing,
  watched,
  toggle,
  details,
  buy,
  competitionBuy,
}: {
  token: PulseToken;
  now: number;
  listing?: TokenListing | undefined;
  watched: boolean;
  toggle(): void;
  details: boolean;
  buy: ReturnType<typeof usePulseBuy>;
  competitionBuy(token: PulseToken, amount: string): void;
}) {
  const fresh = !!token.progressVerifiedAt && now - token.progressVerifiedAt <= 60000;
  const progress = fresh ? token.curveProgressPct : null;
  const to = tradeUrl(token.mint);
  const metadata = listing?.mint === token.mint ? listing : null;
  const dex = metadata && now - metadata.observedAt < 120000 ? metadata : null;
  const links = tokenSocialLinks([...(token.links ?? []), ...(metadata?.links ?? [])]);
  const usdCap = freshPulseValue(token.marketCapUsd, token.marketCapUsdAt, now);
  const cap =
    usdCap != null
      ? '$' + compact(usdCap)
      : token.marketCapSol !== null
        ? compact(token.marketCapSol) + ' SOL'
        : '—';
  const capSource =
    usdCap != null
      ? token.marketCapSource || 'Sourced USD display cap; not executable valuation'
      : 'Confirmed curve market cap · SOL, not USD';
  return (
    <article className="pf-pulse-token" data-mint={token.mint}>
      <div className="pf-row-main">
        <Link
          to={to}
          className="pf-row-identity"
          aria-label={'Open ' + token.symbol + ' trading screen'}
        >
          <TokenAvatar symbol={token.symbol} icon={token.icon} fallbackIcon={metadata?.icon} />
          <span className="pf-row-name">
            <strong title={token.symbol}>{token.symbol}</strong>
            <small title={token.name}>{token.name}</small>
            <span className="pf-row-origin">
              <span
                className="pf-row-age"
                title={
                  token.creationVerifiedAt
                    ? 'Age since verified Pump creation transaction'
                    : 'Age since observation; creation time is not verified'
                }
              >
                {tokenAge(token.createdAt ?? token.firstSeenAt, now)}
                {!token.creationVerifiedAt && ' obs'}
              </span>
              <span className="pf-launchpad">◈ {launchpad(token)}</span>
            </span>
          </span>
        </Link>
        <div className="pf-row-metadata">
          <ContractAddress mint={token.mint} compact />
          <span className="pf-row-socials" aria-label={token.symbol + ' listed links'}>
            {links.length ? (
              links.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={link.label + ' for ' + token.symbol}
                  title={link.label + ' · provider-listed, ownership not verified'}
                >
                  {link.kind === 'x' ? (
                    '𝕏'
                  ) : link.kind === 'post' ? (
                    <span className="pf-post-icon">↗</span>
                  ) : link.kind === 'website' ? (
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <circle cx="10" cy="10" r="7" />
                      <path d="M3 10h14M10 3c4 4 4 10 0 14M10 3c-4 4-4 10 0 14" />
                    </svg>
                  ) : link.kind === 'telegram' ? (
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="m3 9 14-6-3 14-5-5-6-3Zm6 3 8-9M9 12v4l3-2" />
                    </svg>
                  ) : (
                    '↗'
                  )}
                </a>
              ))
            ) : (
              <small className="pf-social-unlisted">Socials unlisted</small>
            )}
          </span>
        </div>
        <div className="pf-row-flags">
          <button
            className="pf-watch"
            aria-label={'Watch ' + token.symbol}
            aria-pressed={watched}
            onClick={toggle}
          >
            {watched ? '★' : '☆'}
          </button>
          <span
            className="pf-verified-badge"
            title="On-chain identity verification only; not a safety or ownership endorsement"
          >
            {token.migrationVerifiedAt
              ? '✓ Migration verified'
              : token.verifiedAt
                ? '✓ Curve verified'
                : 'Verification pending'}
          </span>
          {(token.mintAuthorityDisabled != null || token.freezeAuthorityDisabled != null) && (
            <span
              className="pf-authority-badges"
              title="Confirmed mint-account authority flags only. Token-2022 extensions, holder concentration and other risks are not certified."
            >
              <span className={token.mintAuthorityDisabled === true ? 'pf-up' : ''}>
                MA{' '}
                {token.mintAuthorityDisabled == null
                  ? '—'
                  : token.mintAuthorityDisabled
                    ? 'off'
                    : 'on'}
              </span>
              <span className={token.freezeAuthorityDisabled === true ? 'pf-up' : ''}>
                FA{' '}
                {token.freezeAuthorityDisabled == null
                  ? '—'
                  : token.freezeAuthorityDisabled
                    ? 'off'
                    : 'on'}
              </span>
            </span>
          )}
          {progress != null && (
            <span
              className="pf-curve-inline"
              title="Verified standard native-SOL curve reserves; expires after 60 seconds"
            >
              <progress
                max="100"
                value={progress}
                aria-label={'Verified curve progress for ' + token.symbol}
              />
              <b>{progress.toFixed(1)}%</b>
            </span>
          )}
        </div>
        <div
          className="pf-row-activity"
          title="DEX Screener five-minute transactions across deduplicated indexed base-token pools; holders unavailable."
        >
          {dex?.buys5m != null || dex?.sells5m != null ? (
            <span>
              5m <b className="pf-up">B {dex?.buys5m ?? '—'}</b>{' '}
              <b className="pf-down">S {dex?.sells5m ?? '—'}</b>
            </span>
          ) : (
            <span>Activity not indexed</span>
          )}
          <span title="Unique holder count is unavailable; it is not zero">Holders —</span>
        </div>
        <div className="pf-row-provenance">
          {token.creatorAddress && (
            <a
              href={'https://solscan.io/account/' + token.creatorAddress}
              target="_blank"
              rel="noopener noreferrer"
              title="Creator from confirmed curve account; holdings and behavior not verified"
            >
              Dev {token.creatorAddress.slice(0, 4)}…{token.creatorAddress.slice(-4)} ↗
            </a>
          )}
          {token.curveVariant === 'MAYHEM' && (
            <span title="Verified Mayhem curve identity. Standard bonding progress does not apply.">
              MAYHEM
            </span>
          )}
          <span title="Smart money, developer balances, holder concentration and token tax are not provided by this feed">
            Risk analytics —
          </span>
        </div>
      </div>
      <Link
        to={to}
        className="pf-row-metrics"
        aria-label={'Inspect & paper trade ' + token.symbol}
        title={
          dex
            ? 'DEX Screener · selected pool ' +
              dex.pair +
              ' · volume sums deduplicated indexed token pools · fetched ' +
              new Date(dex.observedAt).toLocaleTimeString()
            : 'DEX statistics unavailable; curve market cap shown when fresh'
        }
      >
        <span className="pf-stat-cap" title={capSource}>
          <small>MC</small>
          <b>{cap}</b>
        </span>
        <span className="pf-stat-volume">
          <small>Vol 24h</small>
          <b>{dex?.volume24h != null ? '$' + compact(dex.volume24h) : '—'}</b>
        </span>
        <span className="pf-stat-liquidity">
          <small>Liq</small>
          <b>{dex?.liquidityUsd != null ? '$' + compact(dex.liquidityUsd) : '—'}</b>
        </span>
      </Link>
      <div className="pf-row-actions">
        <span
          className={
            'pf-row-change ' + (dex?.change5m == null ? '' : dex.change5m < 0 ? 'pf-down' : 'pf-up')
          }
          title="DEX-reported selected-pair price change over five minutes"
        >
          <small>5m</small>{' '}
          {dex?.change5m != null
            ? (dex.change5m > 0 ? '+' : '') + dex.change5m.toFixed(1) + '%'
            : '—'}
        </span>
        <Link
          className="pf-row-trade"
          to={to}
          aria-label={'Open paper trade ' + token.symbol}
          title="Open the existing ticket to preview and confirm a simulated trade"
        >
          Trade <span>↗</span>
        </Link>
        <div className="pf-row-quick" aria-label={'Quick PAPER BUY ' + token.symbol}>
          {buy.presets.map((amount) =>
            competitionTrading ? (
              <button
                key={amount}
                disabled={buy.busy}
                onClick={() => competitionBuy(token, amount)}
                aria-label={
                  'Review competition BUY ' + token.symbol + ' for ' + amount + ' Paper SOL'
                }
              >
                {amount}
              </button>
            ) : (
              <button
                key={amount}
                disabled={buy.busy}
                aria-label={'Preview PAPER BUY ' + token.symbol + ' for ' + amount + ' Paper SOL'}
                title={'Preview ' + amount + ' Paper SOL BUY; quote and confirmation required'}
                onClick={() => buy.choose(token.mint, token.symbol, amount)}
              >
                <span className="pf-quick-buy-glyph" aria-hidden="true">
                  ◈{' '}
                </span>
                {amount}
              </button>
            ),
          )}
        </div>
      </div>
      {details && (
        <div className="pf-row-details">
          <span>
            Created{' '}
            {token.creationVerifiedAt && token.createdAt
              ? new Date(token.createdAt).toISOString()
              : 'unverified'}{' '}
            · Migration{' '}
            {token.migrationEventAt
              ? new Date(token.migrationEventAt).toISOString()
              : 'unavailable'}
          </span>
          {token.creatorAddress && (
            <a
              href={'https://solscan.io/account/' + token.creatorAddress}
              target="_blank"
              rel="noopener noreferrer"
              title="Creator field from the verified Pump curve; not an ownership or holdings attestation"
            >
              Curve creator {token.creatorAddress.slice(0, 4)}…{token.creatorAddress.slice(-4)} ↗
            </a>
          )}
          <span title="Holder counts, developer holdings and comprehensive risk analytics are not supplied by current sources">
            Holder / dev holdings / risk score: unavailable
          </span>
          {token.description && <span className="pf-token-description">{token.description}</span>}
          {token.tokenProgram && (
            <span>{token.tokenProgram.startsWith('Tokenz') ? 'Token-2022' : 'SPL Token'}</span>
          )}
          {token.metadataSource && (
            <a href={token.metadataSource} target="_blank" rel="noopener noreferrer">
              Metadata source ↗
            </a>
          )}
          {token.metadataStatus && token.metadataStatus !== 'AVAILABLE' && (
            <small>{token.metadataStatus}</small>
          )}
          {dex?.buys5m != null && dex.sells5m != null && (
            <span>
              5m txns <b className="pf-up">{dex.buys5m} B</b> /{' '}
              <b className="pf-down">{dex.sells5m} S</b>
            </span>
          )}
        </div>
      )}
    </article>
  );
}

export function PulsePage() {
  const [competitionSelection, setCompetitionSelection] = useState<{
    mint: string;
    symbol: string;
    amount: string;
  } | null>(null);
  const columnContainer = useRef<HTMLDivElement>(null);
  const [rowLimits, setRowLimits] = useState<Record<PulseStage, number>>({
    new: 100,
    stretch: 100,
    migrated: 100,
  });
  const [heldOrders, setHeldOrders] = useState<Partial<Record<PulseStage, string[]>>>({});
  const buy = usePulseBuy();
  const feed = usePulseFeed(),
    { snapshot, now } = feed;
  const [search, setSearch] = useState(() =>
    stored('pf.pulse.search', '', (v) => typeof v === 'string' && v.length <= 80),
  );
  const [sort, setSort] = useState(() =>
    stored('pf.pulse.sort', 'newest', (v) => ['newest', 'cap', 'progress'].includes(String(v))),
  );
  const [source, setSource] = useState('all'),
    [details, setDetails] = useState(false),
    [watchOnly, setWatchOnly] = useState(false);
  const [watch, setWatch] = useState<string[]>(() =>
    stored(
      'pf.pulse.watch',
      [],
      (v) =>
        Array.isArray(v) &&
        v.length <= 200 &&
        v.every((m) => typeof m === 'string' && SOLANA_MINT.test(m)),
    ),
  );
  const [columnControls, setColumnControls] = useState<Record<PulseStage, ColumnControls>>(() =>
    stored(
      'pf.pulse.columns',
      { new: { ...defaultColumn }, stretch: { ...defaultColumn }, migrated: { ...defaultColumn } },
      (v) => {
        if (!v || typeof v !== 'object') return false;
        return (['new', 'stretch', 'migrated'] as const).every((stage) => {
          const c = (v as Record<string, ColumnControls>)[stage];
          return (
            c &&
            (c.query === undefined || (typeof c.query === 'string' && c.query.length <= 80)) &&
            [
              'global',
              'newest',
              'capUsd',
              'capSol',
              'volume',
              'liquidity',
              'activity',
              'progress',
            ].includes(c.sort) &&
            ['minCap', 'minLiquidity', 'minVolume', 'maxAge'].every(
              (k) =>
                typeof c[k as keyof ColumnControls] === 'string' &&
                String(c[k as keyof ColumnControls]).length <= 24,
            ) &&
            ['images', 'socials', 'authorities'].every(
              (k) => typeof c[k as keyof ColumnControls] === 'boolean',
            )
          );
        });
      },
    ),
  );
  const listings = usePulseListings(snapshot);
  const searchedMint = validMint(search);
  const diagnostics = snapshot?.diagnostics;
  const columns = stages.map((stage) => {
    let items = stageTokens(snapshot, stage.key, search, now, Number.MAX_SAFE_INTEGER).filter(
      (t) =>
        (source !== 'pump' || !!t.verifiedAt) &&
        (source !== 'images' || !!(t.icon ?? listings.data?.[t.mint]?.icon)) &&
        (!watchOnly || watch.includes(t.mint)),
    );
    items = filterColumn(items, columnControls[stage.key], listings.data, now, sort);
    return { ...stage, items };
  });
  const displayed = columns.reduce(
    (sum, column) => sum + Math.min(column.items.length, rowLimits[column.key]),
    0,
  );
  useEffect(() => {
    try {
      localStorage.setItem('pf.pulse.search', JSON.stringify(search));
      localStorage.setItem('pf.pulse.sort', JSON.stringify(sort));
      localStorage.setItem('pf.pulse.watch', JSON.stringify(watch));
      localStorage.setItem('pf.pulse.columns', JSON.stringify(columnControls));
    } catch {
      /* preferences may be blocked; live trading does not depend on storage */
    }
  }, [search, sort, watch, columnControls]);
  const toggle = (mint: string) =>
    setWatch((values) =>
      values.includes(mint) ? values.filter((v) => v !== mint) : [...values.slice(-199), mint],
    );
  return (
    <div className="page pf-pulse pf-terminal-pulse">
      <header className="pf-pulse-head">
        <div>
          <span className="eyebrow">REAL-TIME SOLANA DISCOVERY</span>
          <h1>
            Pulse <span>Find your next market.</span>
          </h1>
        </div>
        <div className="pf-pulse-feed-health" role="status">
          <span className={feed.healthy ? 'pf-pulse-live' : 'pf-pulse-offline'} />
          {feed.label}
          {snapshot?.rpcHealth === 'unavailable' && ' · Chain verification delayed'}
        </div>
      </header>
      <div className="pf-pulse-toolbar">
        <input
          type="search"
          aria-label="Filter tokens by symbol, name or CA"
          placeholder="Search token, ticker or contract…"
          maxLength={80}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {searchedMint && (
          <Link className="pf-control" to={tradeUrl(searchedMint)}>
            Open token
          </Link>
        )}
        <label>
          Sort
          <select aria-label="Sort tokens" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest observed</option>
            <option value="cap">Market cap · SOL</option>
            <option value="progress">Curve progress</option>
          </select>
        </label>
        <label>
          Source
          <select
            aria-label="Source filter"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="all">All observed sources</option>
            <option value="pump">Verified Pump.fun</option>
            <option value="images">With metadata image</option>
          </select>
        </label>
        <button
          className="pf-control"
          aria-pressed={watchOnly}
          onClick={() => setWatchOnly((v) => !v)}
        >
          ★ Watchlist <span>{watch.length}</span>
        </button>
        <button className="pf-control" aria-pressed={details} onClick={() => setDetails((v) => !v)}>
          Details {details ? 'on' : 'off'}
        </button>
      </div>
      {competitionTrading ? (
        <>
          <p className="pf-pulse-practice">
            Competition account · shared with the extension · quote, review and confirm PAPER only.
          </p>
          {competitionSelection && (
            <CompetitionPulseBuy
              key={competitionSelection.mint + ':' + competitionSelection.amount}
              {...competitionSelection}
              close={() => setCompetitionSelection(null)}
            />
          )}
        </>
      ) : (
        <>
          <PulseBuyToolbar buy={buy} />
          <PulseBuyDialog buy={buy} />
        </>
      )}
      {diagnostics && (
        <details
          className="pf-feed-diagnostics"
          aria-label="Pulse pipeline status"
          open={snapshot?.rpcHealth === 'unavailable' || undefined}
        >
          <summary>
            <span className={feed.healthy ? 'pf-pulse-live' : 'pf-pulse-offline'} />
            Feed health
            <span>
              Observed {diagnostics.tracked} <i>/</i> Pending {diagnostics.pending} <i>/</i>{' '}
              Displayed {displayed}
            </span>
            <small>Details ⌄</small>
          </summary>
          <div>
            Observed {diagnostics.tracked} · Verification pending {diagnostics.pending} · Rejected{' '}
            {diagnostics.rejected} · Verified {diagnostics.verified} · Available rows{' '}
            {diagnostics.displayed} · Rendered {displayed} (load more in each column)
            {diagnostics.migrationPending > 0 &&
              ` · Migration checks pending ${diagnostics.migrationPending}`}
            {diagnostics.progressUnavailable > 0 &&
              ` · Optional curve progress unavailable ${diagnostics.progressUnavailable} (not a classification requirement)`}
            {!!diagnostics.creationTimePending &&
              ` · Creation-time verification pending ${diagnostics.creationTimePending}`}
            {diagnostics.marketError && ` · Market provider: ${diagnostics.marketError}`}
            {Object.entries(diagnostics.reasons).map(([reason, count]) => (
              <span key={reason}>
                {' '}
                · {reason}: {count}
              </span>
            ))}
            {Object.entries(diagnostics.exclusions ?? {}).map(([reason, count]) => (
              <span key={reason}>
                {' '}
                · Excluded {reason}: {count}
              </span>
            ))}
            {snapshot?.rpcHealth === 'unavailable' && diagnostics.lastRpcError && (
              <span>
                {' '}
                · {diagnostics.lastRpcError.code}: {diagnostics.lastRpcError.detail}
              </span>
            )}
          </div>
        </details>
      )}
      {!feed.healthy && (
        <div className="pf-terminal-warning">
          {snapshot
            ? 'Connection delayed. Showing last observations; expired curve progress is hidden.'
            : 'Connecting to the real token feed… No simulated market activity.'}
        </div>
      )}
      {feed.paginationError && <div className="pf-terminal-warning">{feed.paginationError}</div>}
      <nav className="pf-pulse-mobile-tabs" aria-label="Pulse columns">
        {columns.map((stage) => (
          <button
            key={stage.key}
            onClick={() => {
              const container = columnContainer.current;
              const column = container?.querySelector(`[data-stage="${stage.key}"]`);
              if (container && column)
                container.scrollLeft +=
                  column.getBoundingClientRect().left - container.getBoundingClientRect().left;
            }}
          >
            {stage.title} <span>{stage.items.length}</span>
          </button>
        ))}
      </nav>
      <div className="pf-pulse-columns" ref={columnContainer}>
        {columns.map((stage) => {
          const items = interactionOrder(stage.items, heldOrders[stage.key]).slice(
            0,
            rowLimits[stage.key],
          );
          return (
            <section
              key={stage.key}
              data-stage={stage.key}
              className="pf-pulse-column"
              aria-label={stage.title}
            >
              <div className="pf-pulse-column-head">
                <div>
                  <h2>{stage.title}</h2>
                  <p>{stage.subtitle}</p>
                </div>
                <div className="pf-column-tools">
                  {heldOrders[stage.key] && (
                    <small
                      className="pf-order-held"
                      title="Row order is held while you interact. Verification, classification and values remain live."
                    >
                      Order held · data live
                    </small>
                  )}
                  <span
                    className="pf-pulse-count"
                    title="All matching verified rows, including those below Load more"
                  >
                    {stage.items.length}
                  </span>
                  <PulseColumnControls
                    title={stage.title}
                    value={columnControls[stage.key]}
                    onChange={(value) => setColumnControls((v) => ({ ...v, [stage.key]: value }))}
                  />
                </div>
              </div>
              <div
                className="pf-pulse-list"
                tabIndex={0}
                aria-label={stage.title + ' live rows'}
                onMouseEnter={() =>
                  setHeldOrders((v) => ({
                    ...v,
                    [stage.key]: v[stage.key] ?? stage.items.map((t) => t.mint),
                  }))
                }
                onMouseLeave={(event) => {
                  if (!event.currentTarget.contains(document.activeElement))
                    setHeldOrders((v) => ({ ...v, [stage.key]: undefined }));
                }}
                onFocusCapture={() =>
                  setHeldOrders((v) => ({
                    ...v,
                    [stage.key]: v[stage.key] ?? stage.items.map((t) => t.mint),
                  }))
                }
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    setHeldOrders((v) => ({ ...v, [stage.key]: undefined }));
                }}
              >
                {items.length ? (
                  items.map((token) => (
                    <TokenRow
                      key={token.mint}
                      token={token}
                      now={now}
                      listing={listings.data?.[token.mint]}
                      watched={watch.includes(token.mint)}
                      toggle={() => toggle(token.mint)}
                      details={details}
                      buy={buy}
                      competitionBuy={(token, amount) =>
                        setCompetitionSelection({ mint: token.mint, symbol: token.symbol, amount })
                      }
                    />
                  ))
                ) : (
                  <div className="pf-pulse-empty">
                    {search ||
                    watchOnly ||
                    source !== 'all' ||
                    JSON.stringify(columnControls[stage.key]) !== JSON.stringify(defaultColumn)
                      ? 'No tokens match these filters.'
                      : stage.key === 'stretch'
                        ? 'No verified Pump.fun launches currently have verified age under 60 minutes and fresh USD market cap above $7,000.'
                        : !snapshot
                          ? 'Waiting for verified provider data…'
                          : stage.key === 'migrated'
                            ? diagnostics?.migrationPending
                              ? `${diagnostics.migrationPending} provider migration observations await successful on-chain instruction verification.`
                              : 'No verified Pump→PumpSwap migrations currently have fresh 24h volume of at least $50,000. See exclusion counts in Feed health.'
                            : diagnostics?.pending
                              ? `${diagnostics.pending} real provider observations await chain verification. Unverified tokens are hidden.`
                              : diagnostics?.rejected
                                ? 'Observed accounts failed chain validation. See pipeline rejection reasons above.'
                                : 'Awaiting eligible on-chain launches from the provider.'}
                  </div>
                )}
                {stage.items.length > items.length && (
                  <button
                    className="pf-load-more"
                    onClick={() => setRowLimits((v) => ({ ...v, [stage.key]: v[stage.key] + 50 }))}
                  >
                    Show 50 more · {items.length} / {stage.items.length}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <details className="pf-pulse-coverage">
        <summary>
          Sources &amp; coverage <span>· Real observations · Simulated trading</span>
        </summary>
        <p className="pf-pulse-footnote">
          PumpPortal + public Solana RPC · Pump.fun coverage only. Pre-Migration requires verified
          creation age &lt;60m and fresh USD cap &gt;$7K. Migrated requires chain proof and fresh
          24h volume ≥$50K. DEX Screener supplies USD prices and summed deduplicated indexed
          base-pool volume; fields expire after two minutes. SOL curve cap converts only with fresh
          SOL/USD. Known verified migrations have no age cutoff; ungraduated observations retain the
          1,000-row / 12h window. “—” means unavailable. No holder, developer-risk or ownership
          guarantees. Discovery metrics never price Practice orders.
        </p>
      </details>
    </div>
  );
}
