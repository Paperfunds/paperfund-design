import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  practiceApi,
  PracticeError,
  matchesPracticeInput,
  type PracticeQuote,
} from './practice-api.js';
import { signInPractice } from './practice-auth.js';
import { formatSol as formattedSol, formatUnits, solTextToLamports, shorten } from './format.js';
import { mintFromSearch } from './market-discovery.js';
import { TokenMarketView, TicketMarketSummary, type MarketTab } from './TokenMarketView.js';
import { WebsiteMarketPicker } from './WebsiteMarkets.js';
import { TradePresets } from './TradePresets.js';
import { selectedSellQuantity } from './trade-input.js';
import { TerminalCompetition } from './TerminalCompetition.js';
import { useOrderPending } from './use-order-pending.js';

const formatSol = (value: string, places: number) =>
  formattedSol(value, places).replace(/\sSOL$/, '');

export function PracticePage() {
  const [params, setParams] = useSearchParams(),
    mint = mintFromSearch(params.toString()) ?? '';
  const client = useQueryClient();
  const unresolved = useOrderPending();
  const portfolioView = params.get('view') === 'portfolio';
  const [workspaceTab, setWorkspaceTab] = useState<MarketTab>('activity');
  const [mobileView, setMobileView] = useState<'chart' | 'trade'>('chart');
  function openAccountTab(tab: 'positions' | 'history') {
    setWorkspaceTab(tab);
    setMobileView('chart');
    requestAnimationFrame(() =>
      document
        .querySelector('.pf-token-analytics')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
    );
  }
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY'),
    [amount, setAmount] = useState('0.1');
  const [sellPercent, setSellPercent] = useState<10 | 25 | 50 | 75 | 100>(100),
    [slippage, setSlippage] = useState(
      () => client.getQueryData<string>(['practice-ui-slippage']) ?? '100',
    );
  const [sellCustom, setSellCustom] = useState('');
  const [quote, setQuote] = useState<PracticeQuote | null>(null),
    [now, setNow] = useState(Date.now());
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<{ quoteId: string; key: string; wallet: string } | null>(null);
  const submitting = useRef(false),
    ambiguous = useRef(false);
  const selection = useRef('');
  selection.current = JSON.stringify([mint, side, amount, sellPercent, slippage, sellCustom]);
  const account = useQuery({
    queryKey: ['practice-account'],
    queryFn: practiceApi.account,
    retry: false,
    refetchInterval: 10000,
  });
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setQuote(null);
  }, [mint, side, amount, sellPercent, slippage, sellCustom]);
  const signIn = useMutation({
    mutationFn: () => signInPractice(pending.current?.wallet),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['practice-account'] });
    },
  });
  const logout = useMutation({
    mutationFn: () => practiceApi.logout(),
    onSuccess: () => {
      client.removeQueries({ queryKey: ['practice-account'] });
      setQuote(null);
      pending.current = null;
      setUncertain(false);
      void account.refetch();
    },
  });
  const authenticated = !!account.data && !account.error;
  const position = authenticated ? account.data!.positions.find((p) => p.mint === mint) : undefined;
  const fills = authenticated ? account.data!.trades : [];
  const tokenFills = fills.filter((f) => f.mint === mint);
  const realized = tokenFills
    .filter((f) => f.side === 'SELL')
    .reduce((sum, f) => sum + BigInt(f.realizedPnl), 0n)
    .toString();
  const preview = useMutation({
    mutationFn: async () => {
      const selected = selection.current;
      let quantity: string;
      if (side === 'BUY') {
        const parsed = solTextToLamports(amount);
        if (parsed === null || parsed <= 0n)
          throw Error('Enter a positive Paper SOL amount with at most nine decimals.');
        quantity = parsed.toString();
      } else {
        if (!position) throw Error('No practice position in this token.');
        quantity = selectedSellQuantity(
          position.quantity,
          position.decimals,
          sellPercent,
          sellCustom,
        );
      }
      const result = await practiceApi.quote(mint, side, quantity, Number(slippage));
      if (
        result.mint !== mint ||
        result.side !== side ||
        !matchesPracticeInput(result, quantity) ||
        result.expires <= Date.now()
      )
        throw Error('Executable quote does not match this token, side or amount. Preview again.');
      return { quote: result, selected };
    },
    onSuccess: (data) => {
      if (data.selected === selection.current) {
        setQuote(data.quote);
        pending.current = null;
      }
    },
    onError: () => setQuote(null),
  });
  const trade = useMutation({
    mutationFn: async () => {
      if (submitting.current) throw Error('An order is already in flight.');
      if (!authenticated) throw Error('Reconnect the original Practice wallet first.');
      if (!pending.current) {
        if (!quote || quote.expires <= Date.now()) throw Error('Preview a fresh order first.');
        pending.current = {
          quoteId: quote.id,
          key: crypto.randomUUID(),
          wallet: account.data!.wallet,
        };
      }
      if (pending.current.wallet !== account.data!.wallet)
        throw Error('Reconnect the original Practice wallet first.');
      submitting.current = true;
      return practiceApi.trade(pending.current.quoteId, pending.current.key);
    },
    onSuccess: async () => {
      setUncertain(false);
      ambiguous.current = false;
      pending.current = null;
      setQuote(null);
      await client.invalidateQueries({ queryKey: ['practice-account'] });
    },
    onError: (error) => {
      const provenNotFilled =
        error instanceof PracticeError &&
        ['QUOTE_EXPIRED', 'SLIPPAGE_EXCEEDED'].includes(error.code);
      const unknown =
        !provenNotFilled &&
        (ambiguous.current ||
          (submitting.current &&
            (!(error instanceof PracticeError) || error.status === 0 || error.status >= 500)));
      ambiguous.current = unknown;
      if (error instanceof PracticeError && error.status === 401)
        void client.invalidateQueries({ queryKey: ['practice-account'] });
      setUncertain(unknown);
      if (!unknown) {
        pending.current = null;
        setQuote(null);
      }
    },
    onSettled: () => {
      submitting.current = false;
    },
  });
  const busy =
    preview.isPending || trade.isPending || uncertain || (unresolved && !pending.current);
  const problem = trade.error ?? preview.error ?? signIn.error ?? logout.error;
  const exit = useQuery({
    queryKey: ['practice-executable-exit', account.data?.wallet, mint, position?.quantity],
    enabled: !!position && !busy,
    queryFn: async () => {
      const value = await practiceApi.quote(mint, 'SELL', position!.quantity, 0);
      if (
        value.mint !== mint ||
        value.side !== 'SELL' ||
        value.input !== position!.quantity ||
        value.expires <= Date.now()
      )
        throw Error('Executable exit estimate unavailable');
      return value;
    },
    retry: false,
    staleTime: 10000,
    refetchInterval: 10000,
  });
  const exitValue = position && exit.data && exit.data.expires > now ? exit.data : null;
  const unrealized =
    exitValue && position ? (BigInt(exitValue.output) - BigInt(position.basis)).toString() : null;
  const entry =
    position && BigInt(position.quantity) > 0n
      ? (Number(position.basis) * 10 ** position.decimals) / Number(position.quantity) / 1e9
      : null;
  const quotedPnl =
    quote?.side === 'SELL' && position
      ? BigInt(quote.output) -
        (BigInt(position.basis) * BigInt(quote.input)) / BigInt(position.quantity)
      : null;
  return (
    <div
      className={'page pf-practice pf-token-screen' + (portfolioView ? ' pf-portfolio-screen' : '')}
    >
      <div className="pf-practice-mode" role="note">
        <span>◈ PRACTICE MODE</span> Separate simulated account · no prizes or reward eligibility.
        <Link to={'/trade' + (mint ? '?mint=' + encodeURIComponent(mint) : '')}>
          Competitions ↗
        </Link>
      </div>
      {portfolioView && (
        <section className="pf-portfolio-overview">
          <header>
            <div>
              <span className="eyebrow">YOUR ACCOUNT</span>
              <h1>Paper portfolio</h1>
              <p>
                Practice positions and recorded results. Separate from hourly competition accounts.
              </p>
            </div>
            {authenticated ? (
              <button
                className="button secondary"
                aria-label="Sign out of Practice"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
              >
                Sign out
              </button>
            ) : (
              <button
                className="button primary"
                aria-label="Sign in to Practice"
                onClick={() => signIn.mutate()}
                disabled={signIn.isPending}
              >
                {signIn.isPending ? 'Signing in…' : 'Sign in'}
              </button>
            )}
          </header>
          {signIn.error && <p role="alert">{signIn.error.message}</p>}
          <div className="pf-portfolio-metrics">
            <div>
              <small>Available cash · Paper SOL</small>
              <strong>{authenticated ? formatSol(account.data!.cash, 9) : '—'}</strong>
            </div>
            <div>
              <small>Open positions</small>
              <strong>{authenticated ? account.data!.positions.length : '—'}</strong>
            </div>
            <div>
              <small>Recorded open basis · Paper SOL</small>
              <strong>
                {authenticated
                  ? formatSol(
                      account
                        .data!.positions.reduce((sum, p) => sum + BigInt(p.basis), 0n)
                        .toString(),
                      9,
                    )
                  : '—'}
              </strong>
            </div>
            <div>
              <small>Recent realized · last 100 fills</small>
              <strong>
                {authenticated
                  ? formatSol(
                      fills
                        .filter((f) => f.side === 'SELL')
                        .reduce((sum, f) => sum + BigInt(f.realizedPnl), 0n)
                        .toString(),
                      9,
                    )
                  : '—'}
              </strong>
            </div>
          </div>
        </section>
      )}
      <details className="pf-trade-switcher" open={!mint}>
        <summary>⌕ Find another token</summary>
        <WebsiteMarketPicker
          selectedMint={mint}
          onSelect={(next) => {
            if (!busy) setParams({ mint: next });
          }}
        />
        {busy && <small>Resolve the pending order before changing tokens.</small>}
      </details>
      <nav className="pf-mobile-workspace" aria-label="Token workspace">
        <button aria-pressed={mobileView === 'chart'} onClick={() => setMobileView('chart')}>
          Chart &amp; positions
        </button>
        <button aria-pressed={mobileView === 'trade'} onClick={() => setMobileView('trade')}>
          Practice BUY / SELL
        </button>
      </nav>
      <div className="pf-terminal-grid" data-mobile-view={mobileView}>
        <TokenMarketView
          accountOnly={portfolioView}
          mint={mint}
          tab={workspaceTab}
          onTab={setWorkspaceTab}
          fills={fills}
          portfolio={
            <section className="panel" id="practice-portfolio">
              <h2>Practice portfolio</h2>
              {account.data ? (
                <>
                  <p>
                    Cash: {formatSol(account.data.cash, 6)} Paper SOL. Recorded cost basis, not
                    chart valuation.
                  </p>
                  {account.data.positions.length ? (
                    <div className="pf-practice-positions">
                      {account.data.positions.map((p) => (
                        <article key={p.mint}>
                          <Link to={'/practice?mint=' + encodeURIComponent(p.mint)}>
                            {shorten(p.mint, 8)}
                          </Link>
                          <span>{formatUnits(p.quantity, p.decimals, 6)} tokens</span>
                          <span>Basis {formatSol(p.basis, 6)} Paper SOL</span>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>No open practice positions.</p>
                  )}
                </>
              ) : (
                <p>Sign in to view your practice portfolio.</p>
              )}
            </section>
          }
          history={
            <section className="panel" id="practice-history">
              <h2>Practice trade history</h2>
              <p>
                Last 100 simulated fills across this account. Practice trades never appear in
                competition leaderboards or Rewards.
              </p>
              {account.data?.trades.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Side</th>
                        <th>Token</th>
                        <th>Amount spent</th>
                        <th>Amount received</th>
                        <th>Fee included · Paper SOL</th>
                        <th>Realized PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {account.data.trades.map((fill) => (
                        <tr key={fill.id}>
                          <td>{new Date(fill.at).toLocaleString()}</td>
                          <td>{fill.side}</td>
                          <td>
                            <Link to={'/practice?mint=' + encodeURIComponent(fill.mint)}>
                              {shorten(fill.mint)}
                            </Link>
                          </td>
                          <td>
                            {fill.side === 'BUY'
                              ? formatSol(fill.input, 9) + ' Paper SOL'
                              : formatUnits(fill.input, fill.decimals, 6) + ' tokens'}
                          </td>
                          <td>
                            {fill.side === 'BUY'
                              ? formatUnits(fill.output, fill.decimals, 6) + ' tokens'
                              : formatSol(fill.output, 9) + ' Paper SOL'}
                          </td>
                          <td>{formatSol(fill.fee, 9)}</td>
                          <td>
                            {fill.side === 'SELL'
                              ? formatSol(fill.realizedPnl, 9) + ' Paper SOL'
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No practice trades yet.</p>
              )}
            </section>
          }
        />
        {!portfolioView && (
          <aside className="panel pf-practice-order" aria-label="Practice order">
            <header className="pf-ticket-brand">
              <img src="/paperfund-mark-v2.svg" alt="" />
              <strong>Paperfund</strong>
              <span>PAPER ONLY</span>
            </header>
            <h2>
              Paper trading terminal <span className="pf-ticket-session">Simulated execution</span>
            </h2>
            <TicketMarketSummary mint={mint} />
            <div className="pf-ticket-token">
              <small>SELECTED TOKEN</small>
              <code title={mint}>{mint ? shorten(mint, 9) : 'Select from Pulse'}</code>
            </div>
            {account.isPending ? (
              <p>Loading your practice session…</p>
            ) : authenticated ? (
              <>
                <div className="pf-ticket-wallet">
                  <span title={account.data!.wallet}>◉ {shorten(account.data!.wallet, 7)}</span>
                  <button
                    className="button secondary compact"
                    disabled={busy || logout.isPending}
                    onClick={() => logout.mutate()}
                  >
                    Sign out of Practice
                  </button>
                </div>
                <div className="pf-ticket-cash">
                  <small>PRACTICE BALANCE</small>
                  <strong className="pf-practice-balance">
                    {formatSol(account.data!.cash, 6)} <span>Paper SOL</span>
                  </strong>
                </div>
              </>
            ) : (
              <>
                <p>
                  {account.error instanceof PracticeError && account.error.status === 401
                    ? 'Sign a wallet message to open your separate practice account. No transaction or deposit.'
                    : 'Practice service is unavailable. Orders are disabled; no local balance is invented.'}
                </p>
                <button
                  className="button primary"
                  disabled={signIn.isPending}
                  onClick={() => signIn.mutate()}
                >
                  {signIn.isPending ? 'Waiting for wallet…' : 'Connect & sign in to Practice'}
                </button>
              </>
            )}
            <div
              className="pf-practice-sides"
              aria-label="Order side"
              data-side={side.toLowerCase()}
            >
              <button aria-pressed={side === 'BUY'} disabled={busy} onClick={() => setSide('BUY')}>
                BUY
              </button>
              <button
                aria-pressed={side === 'SELL'}
                disabled={busy}
                onClick={() => setSide('SELL')}
              >
                SELL
              </button>
            </div>
            {side === 'BUY' ? (
              <>
                <label>
                  Spend Paper SOL
                  <span className="pf-amount-field">
                    <input
                      aria-label="Spend Paper SOL"
                      inputMode="decimal"
                      value={amount}
                      maxLength={24}
                      disabled={busy}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    <span aria-hidden="true">PAPER SOL</span>
                  </span>
                </label>
                <TradePresets disabled={busy} onSelect={setAmount} />
              </>
            ) : (
              <>
                <label className="pf-sell-selection">
                  Sell position
                  <select
                    aria-label="Sell position"
                    value={sellPercent}
                    disabled={busy}
                    onChange={(e) => {
                      setSellPercent(Number(e.target.value) as 10 | 25 | 50 | 75 | 100);
                      setSellCustom('');
                    }}
                  >
                    <option value={10}>10%</option>
                    <option value={25}>25%</option>
                    <option value={50}>50%</option>
                    <option value={75}>75%</option>
                    <option value={100}>SELL ALL</option>
                  </select>
                </label>
                <div className="pf-ticket-presets">
                  {([10, 25, 50, 75, 100] as const).map((value) => (
                    <button
                      key={value}
                      aria-pressed={sellPercent === value}
                      disabled={busy}
                      onClick={() => {
                        setSellPercent(value);
                        setSellCustom('');
                      }}
                    >
                      {value === 100 ? 'SELL ALL' : value + '%'}
                    </button>
                  ))}
                </div>
                <label>
                  Custom token amount
                  <input
                    aria-label="Sell token amount"
                    inputMode="decimal"
                    maxLength={80}
                    disabled={busy}
                    value={sellCustom}
                    placeholder="Use selected percentage"
                    onChange={(e) => setSellCustom(e.target.value)}
                  />
                </label>
              </>
            )}
            <div className="pf-ticket-settings">
              <label>
                Maximum slippage
                <select
                  value={slippage}
                  disabled={busy}
                  onChange={(e) => {
                    setSlippage(e.target.value);
                    client.setQueryData(['practice-ui-slippage'], e.target.value);
                  }}
                >
                  <option value="50">0.5%</option>
                  <option value="100">1%</option>
                  <option value="300">3%</option>
                  <option value="500">5%</option>
                </select>
              </label>
              <div title="Fees are determined by the executable quote and cannot be overridden here.">
                <small>Protocol fees · included</small>
                <strong>{quote ? formatSol(quote.fee, 9) + ' Paper SOL' : 'Shown in quote'}</strong>
              </div>
            </div>
            <button
              className={'button secondary pf-ticket-preview ' + side.toLowerCase()}
              disabled={!authenticated || !mint || busy || (side === 'SELL' && !position)}
              onClick={() => {
                trade.reset();
                preview.mutate();
              }}
            >
              {preview.isPending ? 'Reading executable market…' : 'Preview practice order'}
            </button>
            {quote && (
              <div className="pf-practice-quote" aria-label="Executable quote preview">
                <header>
                  <span>Executable quote</span>
                  <b className={quote.expires <= now ? 'pf-down' : ''}>
                    {quote.expires <= now
                      ? 'Expired · preview again'
                      : Math.max(0, Math.ceil((quote.expires - now) / 1000)) + 's remaining'}
                  </b>
                </header>
                <p className="pf-quote-receive">
                  <span>Estimated receive</span>
                  <strong>
                    {side === 'BUY'
                      ? formatUnits(quote.output, quote.decimals, 6) + ' tokens'
                      : formatSol(quote.output, 9) + ' Paper SOL'}
                  </strong>
                </p>
                <p>
                  <span>Minimum receive</span>
                  <b>
                    {side === 'BUY'
                      ? formatUnits(quote.minimumOutput, quote.decimals, 6) + ' tokens'
                      : formatSol(quote.minimumOutput, 9) + ' Paper SOL'}
                  </b>
                </p>
                <p>
                  <span>Protocol fees · included</span>
                  <b>{formatSol(quote.fee, 9)} Paper SOL</b>
                </p>
                {quotedPnl !== null && (
                  <p>
                    <span title="Proportional recorded basis, before execution">
                      Estimated realized P&amp;L
                    </span>
                    <b className={quotedPnl < 0n ? 'pf-down' : 'pf-up'}>
                      {formatSol(quotedPnl.toString(), 9)} Paper SOL
                    </b>
                  </p>
                )}
                <p>
                  <span>Average execution</span>
                  <b>
                    {(
                      Number(side === 'BUY' ? quote.input : quote.output) /
                      1e9 /
                      (Number(side === 'BUY' ? quote.output : quote.input) / 10 ** quote.decimals)
                    ).toPrecision(6)}{' '}
                    Paper SOL / token
                  </b>
                </p>
                <details className="pf-quote-details">
                  <summary>Fees, impact &amp; source</summary>
                  <small>
                    Size-dependent executable output after fees. Price impact percentage unavailable
                    from this API; never inferred from the USD chart.
                  </small>
                  <small>
                    {quote.protocol} · confirmed bank {quote.slot} · Paper SOL only
                  </small>
                </details>
              </div>
            )}
            {(quote || uncertain) && (
              <button
                className={'button primary pf-ticket-confirm ' + side.toLowerCase()}
                disabled={trade.isPending || (!uncertain && (!quote || quote.expires <= now))}
                onClick={() => {
                  if (!submitting.current) trade.mutate();
                }}
              >
                {trade.isPending
                  ? 'Submitting…'
                  : uncertain
                    ? 'Retry same practice order'
                    : 'Confirm practice ' + side}
              </button>
            )}
            {problem && (
              <p className="pf-order-feedback is-error" role="alert">
                {problem.message}
              </p>
            )}
            {trade.isSuccess && (
              <p className="pf-order-feedback" role="status">
                ✓ Practice {trade.data.side} filled. Portfolio and history updated.
              </p>
            )}
            <section className="pf-current-position" aria-label="Selected token position">
              <h3>
                Current position{' '}
                <span className="pf-position-state">{position ? 'Open' : 'No position'}</span>
              </h3>
              <div className="pf-realized-summary">
                Realized P&amp;L · selected mint, recent fills{' '}
                <strong
                  data-testid="practice-realized"
                  className={BigInt(realized) < 0n ? 'pf-down' : 'pf-up'}
                >
                  {authenticated ? formatSol(realized, 9) + ' Paper SOL' : 'Unavailable'}
                </strong>
                <small>From the account's last 100 fills; not a lifetime total.</small>
              </div>
              {position ? (
                <>
                  <dl>
                    <div>
                      <dt>Holding</dt>
                      <dd>{formatUnits(position.quantity, position.decimals, 6)} tokens</dd>
                    </div>
                    <div>
                      <dt>Cost basis</dt>
                      <dd>{formatSol(position.basis, 6)} Paper SOL</dd>
                    </div>
                    <div>
                      <dt>Average entry · all-in</dt>
                      <dd>{entry?.toPrecision(5) ?? '—'} SOL / token</dd>
                    </div>
                    <div>
                      <dt>Executable exit estimate</dt>
                      <dd data-testid="practice-exit-value">
                        {exitValue
                          ? formatSol(exitValue.output, 9) + ' Paper SOL'
                          : exit.isFetching
                            ? 'Refreshing…'
                            : 'Unavailable'}
                      </dd>
                    </div>
                    <div>
                      <dt>Unrealized PnL · estimate</dt>
                      <dd
                        data-testid="practice-unrealized"
                        className={
                          unrealized !== null && BigInt(unrealized) < 0n ? 'pf-down' : 'pf-up'
                        }
                      >
                        {unrealized === null
                          ? 'Unavailable'
                          : (BigInt(unrealized) > 0n ? '+' : '') +
                            formatSol(unrealized, 9) +
                            ' Paper SOL'}
                      </dd>
                    </div>
                  </dl>
                  <small>
                    Fresh full-SELL quote after fees, expires in15s; not a guaranteed future fill.
                    Chart prices do not value your position.
                  </small>
                </>
              ) : (
                <p>
                  {authenticated
                    ? 'No open Practice position for this mint.'
                    : 'Sign in to load your position.'}
                </p>
              )}
            </section>
            <div className="pf-ticket-links">
              <button onClick={() => openAccountTab('positions')}>Positions</button>
              <button onClick={() => openAccountTab('history')}>Trade history</button>
              <Link to="/pulse">Pulse ↗</Link>
            </div>
            {tokenFills.length > 0 && (
              <section className="pf-ticket-recent">
                <h3>Recent PAPER fills</h3>
                {tokenFills.slice(0, 3).map((f) => (
                  <div key={f.id}>
                    <b className={f.side === 'BUY' ? 'pf-up' : 'pf-down'}>{f.side}</b>
                    <span>{new Date(f.at).toLocaleTimeString()}</span>
                    <span>
                      {f.side === 'BUY' ? formatSol(f.input, 5) : formatSol(f.output, 5)} Paper SOL
                    </span>
                  </div>
                ))}
              </section>
            )}
            <TerminalCompetition />
          </aside>
        )}
      </div>
    </div>
  );
}
