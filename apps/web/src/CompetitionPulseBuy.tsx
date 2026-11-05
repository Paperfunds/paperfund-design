import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, errorMessage } from './api.js';
import { formatSol, formatUnits, solTextToLamports } from './format.js';
import { useOrderPending } from './use-order-pending.js';
export function CompetitionPulseBuy({
  mint,
  symbol,
  amount,
  close,
}: {
  mint: string;
  symbol: string;
  amount: string;
  close(): void;
}) {
  const client = useQueryClient(),
    held = useOrderPending(),
    panel = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    panel.current?.focus();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const account = useQuery({ queryKey: ['account'], queryFn: api.account, retry: false });
  const preflight = useQuery({
    queryKey: ['buy-preflight', mint, account.data?.roundId],
    queryFn: () => api.buyPreflight(mint),
    enabled: !!account.data,
    retry: false,
  });
  const units = solTextToLamports(amount);
  const eligible =
    units !== null &&
    units > 0n &&
    !account.error &&
    !preflight.error &&
    preflight.data?.accountId === account.data?.accountId &&
    preflight.data?.roundId === account.data?.roundId &&
    preflight.data?.marketSupported &&
    preflight.data?.slotAvailable &&
    !preflight.data?.blockingReason &&
    (preflight.data?.equityValuationStatus
      ? preflight.data.equityValuationStatus !== 'UNAVAILABLE'
      : preflight.data?.valuationStatus === 'AVAILABLE') &&
    preflight.data?.maxBuyLamports != null &&
    units <= BigInt(preflight.data.maxBuyLamports);
  const [slippage, setSlippage] = useState(100);
  const preview = useMutation({
    mutationFn: async () => {
      if (!eligible || units === null) throw Error('Fresh trading eligibility is required.');
      const { user } = await api.me();
      return {
        owner: user.id,
        accountId: account.data!.accountId,
        roundId: account.data!.roundId,
        quote: await api.quote(mint, 'BUY', units.toString(), slippage),
      };
    },
  });
  const trade = useMutation({
    mutationFn: async () => {
      if (
        !preview.data ||
        !eligible ||
        held ||
        Date.parse(preview.data.quote.expiresAt) <= Date.now()
      )
        throw Error('Preview a fresh matching estimate first.');
      return api.buy(mint, amount, crypto.randomUUID(), preview.data, preview.data.quote, slippage);
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['account'] }),
        client.invalidateQueries({ queryKey: ['positions'] }),
        client.invalidateQueries({ queryKey: ['trades'] }),
        client.invalidateQueries({ queryKey: ['buy-preflight'] }),
      ]);
    },
  });
  const problem = trade.error ?? preview.error ?? preflight.error ?? account.error;
  return (
    <div className="pf-buy-backdrop">
      <div
        className="pf-buy-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Competition PAPER BUY"
        tabIndex={-1}
        ref={panel}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !trade.isPending) close();
          if (e.key === 'Tab') {
            const nodes = panel.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),a[href]',
            );
            const first = nodes?.[0],
              last = nodes?.[nodes.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first || document.activeElement === panel.current)
            ) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <h2>Paper BUY · {symbol}</h2>
        <label>Slippage limit <select value={slippage} disabled={trade.isPending || trade.isSuccess}
          onChange={e => { setSlippage(Number(e.target.value)); preview.reset(); }}>
          {[0, 50, 100, 300, 500].map(bps => <option key={bps} value={bps}>{bps / 100}%</option>)}
        </select></label>
        <p>{amount} Paper SOL · authoritative competition account, shared with the extension.</p>
        <p>
          Available cash:{' '}
          {account.data ? formatSol(account.data.paperSolLamports, 9) : 'Unavailable'}
        </p>
        {problem && <p role="alert">{errorMessage(problem)}</p>}
        {held && (
          <p role="status">
            Order outcome pending. Use Recover order before submitting another trade.
          </p>
        )}
        {preview.data && (
          <div className="pf-buy-quote">
            <b>
              Expected receive:{' '}
              {formatUnits(preview.data.quote.output, preview.data.quote.decimals, 6)} tokens
            </b>
            <span>Reported SOL fee: {formatSol(preview.data.quote.feeLamports, 9)}</span>
            <small>
              Server enforces quote expiry and a {slippage / 100}% net output slippage limit.
              Price-impact percentage unavailable.
            </small>
          </div>
        )}
        <button
          disabled={!eligible || held || preview.isPending || trade.isPending || trade.isSuccess}
          onClick={() => preview.mutate()}
        >
          {preview.isPending ? 'Reading execution bank…' : 'Preview PAPER BUY'}
        </button>
        <button
          disabled={
            !eligible ||
            held ||
            !preview.data ||
            Date.parse(preview.data.quote.expiresAt) <= now ||
            trade.isPending ||
            trade.isSuccess
          }
          onClick={() => trade.mutate()}
        >
          {trade.isPending ? 'Submitting…' : trade.isSuccess ? 'Confirmed' : 'Confirm PAPER BUY'}
        </button>
        {trade.isSuccess && (
          <p role="status">PAPER BUY confirmed. Shared balance, position and history updated.</p>
        )}
        <Link to={'/trade?mint=' + encodeURIComponent(mint)}>Open shared Trade account ↗</Link>
        <button disabled={trade.isPending} onClick={close}>
          Close
        </button>
      </div>
    </div>
  );
}
