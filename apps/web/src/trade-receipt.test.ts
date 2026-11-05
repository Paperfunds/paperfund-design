import { expect, it } from 'vitest';
import { matchesTradeReceipt } from './trade-receipt.js';
const buy = {
  fillId: 'explicit-test-fill',
  tokenMint: 'test-mint',
  executionProtocol: 'SOLANA_ROUTE',
  actualPaperSolSpentLamports: '9999999',
  tokenQuantityReceivedBaseUnits: '123',
  feeLamports: '1',
  executedAt: '2026-01-01T00:00:00Z',
};
const body = { mint: 'test-mint', paperSol: '0.01' };
it('accepts rounded actual spend and old idempotent receipts without a direct-SOL requirement', () => {
  expect(matchesTradeReceipt(buy, '/api/v1/trades/buy', body)).toBe(true);
});
it.each([
  { tokenMint: 'other-mint' },
  { actualPaperSolSpentLamports: '10000001' },
  { feeLamports: '-1' },
  { tokenQuantityReceivedBaseUnits: 'NaN' },
  { requestedPaperSolLamports: '1' },
  { fillId: '' },
])('retains an uncertain mismatched/malformed receipt %j', (patch) => {
  expect(matchesTradeReceipt({ ...buy, ...patch }, '/api/v1/trades/buy', body)).toBe(false);
});
it('binds partial SELL quantity and verifies a supplied SELL ALL remainder', () => {
  const sell = {
    ...buy,
    tokenAmountSoldBaseUnits: '25',
    paperSolCreditedLamports: '123',
    realizedPnlLamports: '-1',
    remainingQuantityBaseUnits: '75',
  };
  expect(
    matchesTradeReceipt(sell, '/api/v1/trades/sell', { mint: body.mint, quantity: '25' }),
  ).toBe(true);
  expect(
    matchesTradeReceipt(sell, '/api/v1/trades/sell', { mint: body.mint, quantity: '26' }),
  ).toBe(false);
  expect(
    matchesTradeReceipt(sell, '/api/v1/trades/sell', { mint: body.mint, quantity: 'ALL' }),
  ).toBe(false);
});
