import { durableOrder, pendingOrder } from './order-journal.js';
import type { PracticeFill, PracticeAccount, PracticeQuote } from './practice-types.js';
export type {
  PracticeFill,
  PracticeAccount,
  PracticeQuote,
  PracticePosition,
} from './practice-types.js';
export function matchesPracticeInput(quote: PracticeQuote, requested: string): boolean {
  return (
    /^[1-9][0-9]*$/.test(quote.input) &&
    (quote.requestedInput ?? quote.input) === requested &&
    (quote.side === 'SELL' ? quote.input === requested : BigInt(quote.input) <= BigInt(requested))
  );
}
export class PracticeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function request<T>(path: string, body?: unknown, key?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/practice-api/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(key ? { 'idempotency-key': key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new PracticeError(
      'NETWORK_UNCERTAIN',
      'Connection interrupted. Retry the same order to check its result.',
      0,
    );
  }
  const data = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok || !data)
    throw new PracticeError(
      data?.error?.code ?? 'PRACTICE_UNAVAILABLE',
      data?.error?.message ?? 'Practice Trading is not available on this website yet.',
      response.ok ? 0 : response.status,
    );
  return data as T;
}
export const practiceApi = {
  account: () => request<PracticeAccount>('account'),
  challenge: (wallet: string) => request<{ id: string; message: string }>('challenge', { wallet }),
  verify: (id: string, signature: string) =>
    request<{ wallet: string }>('verify', { id, signature }),
  logout: () => request('logout', {}),
  quote: (mint: string, side: 'BUY' | 'SELL', amount: string, slippageBps: number) =>
    request<PracticeQuote>('quote', { mint, side, amount, slippageBps }),
  trade: async (quoteId: string, key: string) => {
    const account = await request<PracticeAccount>('account');
    return durableOrder(
      {
        owner: account.wallet,
        mode: 'practice',
        path: 'trade',
        body: { quoteId },
        key,
        attempts: 0,
      },
      () => practiceRecoveryTrade(quoteId, key),
      pendingOrder()?.key === key,
    );
  },
};
export async function practiceRecoveryTrade(quoteId: string, key: string) {
  const fill = await request<PracticeFill>('trade', { quoteId }, key);
  if (!fill?.id || !fill.input || !fill.output)
    throw new PracticeError(
      'NETWORK_UNCERTAIN',
      'Order response incomplete. Recover the same order.',
      0,
    );
  return fill;
}
