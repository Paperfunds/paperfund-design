import { solTextToLamports } from './format.js';
const positive = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d*$/.test(v);
const unsigned = (v: unknown) => typeof v === 'string' && /^\d+$/.test(v);
// Validate a response before clearing the durable intent. Replays can be old; no freshness cutoff
// applies to a previously committed fill. Price/fees/accounting are still determined by the server.
export function matchesTradeReceipt(value: unknown, path: string, body: Record<string, string>) {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.fillId !== 'string' ||
    !v.fillId ||
    v.tokenMint !== body.mint ||
    typeof v.executionProtocol !== 'string' ||
    !v.executionProtocol ||
    !unsigned(v.feeLamports) ||
    typeof v.executedAt !== 'string' ||
    !Number.isFinite(Date.parse(v.executedAt))
  )
    return false;
  if (path === '/api/v1/trades/buy') {
    const budget = solTextToLamports(body.paperSol ?? '');
    return (
      budget !== null &&
      budget > 0n &&
      positive(v.actualPaperSolSpentLamports) &&
      BigInt(v.actualPaperSolSpentLamports) <= budget &&
      positive(v.tokenQuantityReceivedBaseUnits) &&
      (v.requestedPaperSolLamports === undefined ||
        v.requestedPaperSolLamports === budget.toString())
    );
  }
  return (
    path === '/api/v1/trades/sell' &&
    positive(v.tokenAmountSoldBaseUnits) &&
    positive(v.paperSolCreditedLamports) &&
    typeof v.realizedPnlLamports === 'string' &&
    /^-?\d+$/.test(v.realizedPnlLamports) &&
    (body.quantity === 'ALL'
      ? v.remainingQuantityBaseUnits === undefined || v.remainingQuantityBaseUnits === '0'
      : v.tokenAmountSoldBaseUnits === body.quantity)
  );
}
