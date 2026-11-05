import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, competitionRecoveryTrade } from './api.js';
import { practiceApi, practiceRecoveryTrade } from './practice-api.js';
import { pendingOrder, clearOrder, durableOrder, type OrderIntent } from './order-journal.js';
import { solTextToLamports } from './format.js';

export function OrderRecovery() {
  const client = useQueryClient();
  const [intent, setIntent] = useState<OrderIntent | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const refresh = () => {
      try {
        setIntent(pendingOrder());
      } catch (e) {
        setMessage((e as Error).message);
      }
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('paperfund:order-journal', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('paperfund:order-journal', refresh);
    };
  }, []);
  if (!intent && !message) return null;
  async function recover() {
    if (!intent || busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (intent.mode === 'practice') {
        const account = await practiceApi.account();
        if (account.wallet !== intent.owner)
          throw Error('Reconnect the original Practice wallet to recover this order.');
        await durableOrder(
          intent,
          () => practiceRecoveryTrade(intent.body.quoteId!, intent.key),
          true,
        );
      } else {
        const { user } = await api.me();
        if (user.id !== intent.owner)
          throw Error('Reconnect the original competition wallet to recover this order.');
        const receipt = await api.recoverOrder(intent.key);
        if (receipt.status === 'COMPLETED') {
          const buy = intent.path === '/api/v1/trades/buy';
          const operation = buy
            ? 'AUTHORITATIVE_PAPER_BUY'
            : intent.body.quantity === 'ALL'
              ? 'AUTHORITATIVE_PAPER_SELL_ALL'
              : 'AUTHORITATIVE_PAPER_SELL';
          const matched = receipt.receipts.some(
            (r) =>
              r.fill_id &&
              r.operation_class === operation &&
              r.hourly_round_id === intent.round &&
              r.mint_address === intent.body.mint &&
              (buy
                ? r.requested_quote_lamports ===
                  solTextToLamports(intent.body.paperSol ?? '')?.toString()
                : intent.body.quantity === 'ALL' ||
                  r.requested_base_units === intent.body.quantity),
          );
          if (!matched)
            throw Error(
              'Receipt does not match the original round, token and amount. Order remains held for reconciliation.',
            );
          clearOrder(intent.key);
        } else {
          const { round } = await api.currentRound();
          if (round?.id !== intent.round)
            throw Error(
              'Original round closed; no completed receipt yet. Order remains held for reconciliation. No replacement order submitted.',
            );
          await durableOrder(
            intent,
            () => competitionRecoveryTrade(intent.path, intent.body, intent.key),
            true,
          );
        }
      }
      await client.invalidateQueries();
      setMessage('Order recovered. Balances and history refreshed.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="notice" role="status">
      {intent ? (
        <>
          <strong>Order outcome pending · {intent.mode}</strong> · {intent.key.slice(0, 8)} · New
          orders are held until recovery.{' '}
          <button disabled={busy} onClick={() => void recover()}>
            {busy ? 'Checking original order…' : 'Recover order'}
          </button>
        </>
      ) : null}
      {message && <span> {message}</span>}
    </aside>
  );
}
