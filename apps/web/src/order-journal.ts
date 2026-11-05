// Public request identifiers only. No session tokens, signatures or wallet keys.
export type OrderIntent = {
  owner: string;
  mode: 'practice' | 'competition';
  key: string;
  path: string;
  body: Record<string, string>;
  round?: string;
  attempts: number;
};
const storageKey = 'pf.unresolved-order.v1';
export function pendingOrder(): OrderIntent | null {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  const v = JSON.parse(raw) as OrderIntent;
  if (
    !v ||
    !v.owner ||
    !v.key ||
    !['practice', 'competition'].includes(v.mode) ||
    !Number.isSafeInteger(v.attempts) ||
    !['trade', '/api/v1/trades/buy', '/api/v1/trades/sell'].includes(v.path) ||
    !v.body
  )
    throw Error('Saved order is invalid. Reconcile trade history before submitting another order.');
  return v;
}
function save(intent: OrderIntent) {
  localStorage.setItem(storageKey, JSON.stringify(intent));
  if (localStorage.getItem(storageKey) !== JSON.stringify(intent))
    throw Error('Order persistence unavailable. No order submitted.');
  window.dispatchEvent(new Event('paperfund:order-journal'));
}
export function clearOrder(key: string) {
  if (pendingOrder()?.key !== key) throw Error('Order recovery changed in another tab.');
  localStorage.removeItem(storageKey);
  window.dispatchEvent(new Event('paperfund:order-journal'));
}
export async function durableOrder<T>(
  intent: OrderIntent,
  send: () => Promise<T>,
  recover = false,
): Promise<T> {
  if (!navigator.locks) throw Error('Browser order locking unavailable. No order submitted.');
  return navigator.locks.request('paperfund-order-journal', async () => {
    const prior = pendingOrder();
    if (
      prior &&
      (!recover ||
        prior.key !== intent.key ||
        prior.owner !== intent.owner ||
        prior.mode !== intent.mode ||
        prior.path !== intent.path ||
        JSON.stringify(prior.body) !== JSON.stringify(intent.body) ||
        prior.round !== intent.round)
    )
      throw Error(
        'An earlier order needs recovery. Use Recover order above before submitting another.',
      );
    if (recover && !prior) throw Error('This order has already been recovered. Refresh balances.');
    const next = { ...intent, attempts: (prior?.attempts ?? 0) + 1 };
    save(next); // Must succeed BEFORE any order reaches the backend.
    try {
      const result = await send();
      clearOrder(intent.key);
      return result;
    } catch (error) {
      const e = error as { status?: number; code?: string };
      // A first, explicit rejection is definitive. A later rejection cannot disprove an earlier lost fill.
      const rejected = [
        'INVALID_REQUEST',
        'INVALID_ORDER',
        'INVALID_FINANCIAL_INPUT',
        'ROUND_NOT_OPEN',
        'OUTSIDE_ROUND_WINDOW',
        'INSUFFICIENT_PAPER_SOL',
        'INSUFFICIENT_PRACTICE_SOL',
        'INSUFFICIENT_PRACTICE_TOKENS',
        'INSUFFICIENT_TOKEN_BALANCE',
        'QUOTE_INVALID', 'QUOTE_EXPIRED', 'SLIPPAGE_EXCEEDED',
  'INSUFFICIENT_EXECUTABLE_LIQUIDITY',
        'ZERO_EXECUTABLE_OUTPUT',
        'UNSUPPORTED_MARKET',
        'UNSUPPORTED_PROTOCOL',
        'UNSUPPORTED_MIGRATED_PROTOCOL',
        'MARKET_ACCOUNT_NOT_FOUND',
        'MAX_BUY_RATIO_EXCEEDED',
        'TOKEN_SLOT_LIMIT_REACHED',
        'UNAUTHENTICATED',
        'PRACTICE_SIGN_IN_REQUIRED',
      ];
      if (
        !prior &&
        e.status &&
        e.status >= 400 &&
        e.status < 500 &&
        rejected.includes(e.code ?? '')
      )
        clearOrder(intent.key);
      else if (
        intent.mode === 'practice' &&
        ['QUOTE_EXPIRED', 'SLIPPAGE_EXCEEDED'].includes(e.code ?? '')
      )
        clearOrder(intent.key);
      throw error;
    }
  });
}
