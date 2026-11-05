import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  practiceApi,
  PracticeError,
  matchesPracticeInput,
  type PracticeQuote,
} from './practice-api.js';
import { signInPractice } from './practice-auth.js';
import { formatSol, formatUnits, solTextToLamports, shorten } from './format.js';
import { useOrderPending } from './use-order-pending.js';
import { competitionTrading } from './trading-account.js';

const paperSol = (value: string, places: number) => formatSol(value, places).replace(/\sSOL$/, '');
const defaults = ['0.01', '0.1', '0.5'];
export function buyPresets(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const amounts = value.map((v) =>
    typeof v === 'string' && v.length <= 24 ? solTextToLamports(v) : null,
  );
  return amounts.every((v) => v !== null && v > 0n) && new Set(amounts.map(String)).size === 3
    ? value
    : null;
}
type Selection = {
  mint: string;
  symbol: string;
  amount: string;
  wallet: string | null;
  nonce: number;
};
type Intent = { quoteId: string; key: string; wallet: string };
export function usePulseBuy() {
  const unresolved = useOrderPending();
  const client = useQueryClient();
  const [presets, setPresets] = useState<string[]>(() => {
    try {
      return (
        buyPresets(JSON.parse(localStorage.getItem('pf.pulse.buy-presets') ?? 'null')) ?? defaults
      );
    } catch {
      return defaults;
    }
  });
  const [slippage, setSlippage] = useState(
    () => client.getQueryData<string>(['practice-ui-slippage']) ?? '100',
  );
  const [selection, setSelection] = useState<Selection | null>(null),
    current = useRef<Selection | null>(null);
  const [quote, setQuote] = useState<PracticeQuote | null>(null),
    [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState(''),
    [now, setNow] = useState(Date.now());
  const intent = useRef<Intent | null>(null),
    lock = useRef(false),
    ambiguous = useRef(false),
    submitted = useRef(false);
  const account = useQuery({
    queryKey: ['practice-account'],
    enabled: !competitionTrading,
    queryFn: async () => {
      const a = await practiceApi.account();
      if (
        a.mode !== 'PRACTICE' ||
        a.rewardEligible !== false ||
        typeof a.wallet !== 'string' ||
        !/^\d+$/.test(a.cash)
      )
        throw Error('Practice account unavailable');
      return a;
    },
    retry: false,
    refetchInterval: 10000,
  });
  const authenticated = !!account.data && !account.error;
  const signIn = useMutation({
    mutationFn: () => signInPractice(intent.current?.wallet),
    onSuccess: () => client.invalidateQueries({ queryKey: ['practice-account'] }),
  });
  const preview = useMutation({
    mutationFn: async (s: Selection) => {
      if (!authenticated) throw Error('Sign in to your separate Practice account first.');
      const amount = solTextToLamports(s.amount);
      if (amount === null || amount <= 0n)
        throw Error('Enter a positive Paper SOL amount with at most nine decimals.');
      const q = await practiceApi.quote(s.mint, 'BUY', amount.toString(), Number(slippage));
      if (
        q.mint !== s.mint ||
        q.side !== 'BUY' ||
        !matchesPracticeInput(q, amount.toString()) ||
        q.expires <= Date.now()
      )
        throw Error('The executable quote does not match this token and amount. Preview again.');
      return { q, s };
    },
    onSuccess: ({ q, s }) => {
      if (current.current === s) {
        setQuote(q);
        intent.current = null;
      }
    },
    onError: (error) => {
      if (error instanceof PracticeError && error.status === 401)
        void client.invalidateQueries({ queryKey: ['practice-account'] });
    },
    onSettled: () => {
      lock.current = false;
    },
  });
  const trade = useMutation({
    mutationFn: async () => {
      if (lock.current) throw Error('An order request is already in flight.');
      if (!authenticated || !account.data)
        throw Error('Sign in with the original Practice wallet first.');
      if (!intent.current) {
        if (
          !quote ||
          !current.current ||
          quote.expires <= Date.now() ||
          current.current.wallet !== account.data.wallet
        )
          throw Error('Quote expired or wallet changed. Preview again.');
        intent.current = {
          quoteId: quote.id,
          key: crypto.randomUUID(),
          wallet: account.data.wallet,
        };
      }
      if (intent.current.wallet !== account.data.wallet)
        throw Error('Reconnect the original wallet before retrying this order.');
      lock.current = true;
      submitted.current = true;
      return practiceApi.trade(intent.current.quoteId, intent.current.key);
    },
    onSuccess: async (fill) => {
      ambiguous.current = false;
      setUncertain(false);
      intent.current = null;
      setQuote(null);
      setSelection(null);
      current.current = null;
      setNotice(
        `PAPER BUY filled · ${formatUnits(fill.output, fill.decimals, 6)} tokens · ${paperSol(fill.input, 4)} Paper SOL spent.`,
      );
      await client.invalidateQueries({ queryKey: ['practice-account'] });
    },
    onError: (error) => {
      if (error instanceof PracticeError && error.status === 401)
        void client.invalidateQueries({ queryKey: ['practice-account'] });
      const provenNotFilled =
        error instanceof PracticeError &&
        ['QUOTE_EXPIRED', 'SLIPPAGE_EXCEEDED'].includes(error.code);
      const unknown =
        !provenNotFilled &&
        (ambiguous.current ||
          (submitted.current &&
            (!(error instanceof PracticeError) || error.status === 0 || error.status >= 500)));
      ambiguous.current = unknown;
      setUncertain(unknown);
      if (!unknown) {
        intent.current = null;
        setQuote(null);
      }
    },
    onSettled: () => {
      lock.current = false;
      submitted.current = false;
    },
  });
  const busy = preview.isPending || trade.isPending || uncertain || unresolved;
  function read(s: Selection) {
    if (lock.current || uncertain) return;
    lock.current = true;
    setQuote(null);
    preview.reset();
    trade.reset();
    preview.mutate(s);
  }
  function choose(mint: string, symbol: string, amount: string) {
    if (lock.current || busy) return;
    const s = {
      mint,
      symbol,
      amount,
      wallet: authenticated ? account.data!.wallet : null,
      nonce: Date.now(),
    };
    current.current = s;
    setSelection(s);
    setQuote(null);
    setNotice('');
    preview.reset();
    trade.reset();
    if (authenticated) read(s);
  }
  function cancel() {
    if (busy) return;
    current.current = null;
    setSelection(null);
    setQuote(null);
    intent.current = null;
  }
  function refresh() {
    if (!current.current || busy) return;
    const s = { ...current.current, wallet: account.data?.wallet ?? null };
    current.current = s;
    setSelection(s);
    read(s);
  }
  function save(values: string[], slip: string) {
    if (!buyPresets(values) || !['50', '100', '300', '500'].includes(slip))
      throw Error('Use three different positive Paper SOL amounts and a supported slippage limit.');
    setPresets(values);
    setSlippage(slip);
    client.setQueryData(['practice-ui-slippage'], slip);
    try {
      localStorage.setItem('pf.pulse.buy-presets', JSON.stringify(values));
    } catch {
      /* Trading never depends on preference storage. */
    }
  }
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return {
    presets,
    slippage,
    save,
    selection,
    quote,
    now,
    uncertain,
    busy,
    account,
    authenticated,
    signIn,
    preview,
    trade,
    notice,
    choose,
    cancel,
    refresh,
    confirm: () => {
      if (!lock.current) trade.mutate();
    },
  };
}
type PulseBuy = ReturnType<typeof usePulseBuy>;
export function PulseBuyToolbar({ buy }: { buy: PulseBuy }) {
  const [draft, setDraft] = useState(buy.presets),
    [slip, setSlip] = useState(buy.slippage),
    [error, setError] = useState('');
  return (
    <div className="pf-paper-controls">
      <span className="pf-paper-label">PAPER ONLY</span>
      {buy.authenticated ? (
        <span className="pf-paper-cash">
          {paperSol(buy.account.data!.cash, 4)} Paper SOL{' '}
          <small>{shorten(buy.account.data!.wallet)}</small>
        </span>
      ) : (
        <button
          className="pf-control"
          disabled={buy.signIn.isPending || buy.busy}
          onClick={() => buy.signIn.mutate()}
        >
          Connect Practice wallet
        </button>
      )}
      <details className="pf-buy-settings">
        <summary>Buy presets ⚙</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              buy.save(draft, slip);
              setError('');
              e.currentTarget.closest('details')?.removeAttribute('open');
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <strong>Quick PAPER BUY presets</strong>
          <small>Each opens a fresh executable quote for confirmation.</small>
          {draft.map((amount, i) => (
            <label key={i}>
              Preset {i + 1} · Paper SOL
              <input
                aria-label={'Paper buy preset ' + (i + 1)}
                value={amount}
                inputMode="decimal"
                maxLength={24}
                disabled={buy.busy}
                onChange={(e) => setDraft((v) => v.map((p, n) => (n === i ? e.target.value : p)))}
              />
            </label>
          ))}
          <label>
            Maximum slippage
            <select
              aria-label="Pulse buy slippage"
              value={slip}
              disabled={buy.busy}
              onChange={(e) => setSlip(e.target.value)}
            >
              {[
                ['50', '0.5%'],
                ['100', '1%'],
                ['300', '3%'],
                ['500', '5%'],
              ].map(([v, t]) => (
                <option value={v} key={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {error && <p role="alert">{error}</p>}
          <button className="pf-control" disabled={buy.busy}>
            Save presets
          </button>
        </form>
      </details>
      {buy.signIn.error && <span role="alert">{buy.signIn.error.message}</span>}
      {buy.notice && (
        <span role="status" className="pf-paper-notice">
          {buy.notice}
        </span>
      )}
    </div>
  );
}
export function PulseBuyDialog({ buy }: { buy: PulseBuy }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (buy.selection) panel.current?.focus();
  }, [buy.selection]);
  if (!buy.selection) return null;
  const problem = buy.trade.error ?? buy.preview.error ?? buy.signIn.error;
  return (
    <div className="pf-buy-backdrop">
      <div
        className="pf-buy-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pulse-buy-title"
        tabIndex={-1}
        ref={panel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') buy.cancel();
          if (e.key === 'Tab') {
            const nodes = panel.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)',
            );
            if (!nodes?.length) return;
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first || document.activeElement === panel.current)
            ) {
              e.preventDefault();
              last!.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first!.focus();
            }
          }
        }}
      >
        <span className="pf-paper-label">SIMULATED · NO REWARDS</span>
        <h2 id="pulse-buy-title">PAPER BUY {buy.selection.symbol}</h2>
        <code>{buy.selection.mint}</code>
        <p>
          Spend <strong>{buy.selection.amount} Paper SOL</strong> · maximum slippage{' '}
          {Number(buy.slippage) / 100}%
        </p>
        {!buy.authenticated && (
          <button
            className="pf-control"
            disabled={buy.signIn.isPending}
            onClick={() => buy.signIn.mutate()}
          >
            Sign in to Practice
          </button>
        )}
        {buy.quote && (
          <div className="pf-buy-quote">
            <p>
              Estimated receive{' '}
              <strong>{formatUnits(buy.quote.output, buy.quote.decimals, 6)} tokens</strong>
            </p>
            <p>
              Minimum receive {formatUnits(buy.quote.minimumOutput, buy.quote.decimals, 6)} tokens
            </p>
            <p>Protocol fees {paperSol(buy.quote.fee, 9)} Paper SOL · included</p>
            <small>
              {buy.quote.protocol} · slot {buy.quote.slot} · expires in{' '}
              {Math.max(0, Math.ceil((buy.quote.expires - buy.now) / 1000))}s
            </small>
          </div>
        )}
        {buy.preview.isPending && <p role="status">Reading executable market…</p>}
        {problem && <p role="alert">{problem.message}</p>}
        {buy.uncertain && (
          <p className="pf-buy-uncertain">
            Result unknown. Retry the same order to recover its original result. New orders are held
            until resolved.
          </p>
        )}
        {buy.authenticated && !buy.uncertain && (
          <button className="pf-control" disabled={buy.busy} onClick={buy.refresh}>
            {buy.quote ? 'Refresh quote' : 'Get executable quote'}
          </button>
        )}
        {(buy.quote || buy.uncertain) && (
          <button
            className="pf-quick-confirm"
            disabled={
              buy.trade.isPending ||
              !buy.authenticated ||
              (!buy.uncertain && buy.quote!.expires <= buy.now)
            }
            onClick={buy.confirm}
          >
            {buy.trade.isPending
              ? 'Submitting…'
              : buy.uncertain
                ? 'Retry same PAPER order'
                : 'Confirm PAPER BUY'}
          </button>
        )}
        <div className="pf-buy-sheet-footer">
          <button className="pf-control" disabled={buy.busy} onClick={buy.cancel}>
            Cancel
          </button>
          <Link
            to={'/practice?mint=' + encodeURIComponent(buy.selection.mint)}
            onClick={(e) => {
              if (buy.busy) e.preventDefault();
            }}
          >
            Open full Trade view ↗
          </Link>
        </div>
      </div>
    </div>
  );
}
