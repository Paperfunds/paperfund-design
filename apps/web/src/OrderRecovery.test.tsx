import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrderRecovery } from './OrderRecovery.js';
import { api } from './api.js';
import { pendingOrder } from './order-journal.js';
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OrderRecovery />
    </QueryClientProvider>,
  );
}
function seed() {
  localStorage.setItem(
    'pf.unresolved-order.v1',
    JSON.stringify({
      owner: 'fixture-owner',
      mode: 'competition',
      path: '/api/v1/trades/buy',
      body: { mint: 'fixture-mint', paperSol: '0.01', roundId: 'old-round' },
      round: 'old-round',
      key: 'fixture-original-key',
      attempts: 1,
    }),
  );
}
it('recovers a committed original receipt after reload/rollover without submitting another trade', async () => {
  seed();
  vi.spyOn(api, 'me').mockResolvedValue({
    user: { id: 'fixture-owner', walletAddress: 'fixture-wallet' },
  });
  vi.spyOn(api, 'recoverOrder').mockResolvedValue({
    status: 'COMPLETED',
    receipts: [
      {
        fill_id: 'fixture-fill',
        operation_class: 'AUTHORITATIVE_PAPER_BUY',
        hourly_round_id: 'old-round',
        mint_address: 'fixture-mint',
        requested_quote_lamports: '10000000',
        requested_base_units: null,
      },
    ],
  });
  const buy = vi.spyOn(api, 'buy');
  const round = vi.spyOn(api, 'currentRound');
  show();
  await userEvent.click(await screen.findByRole('button', { name: 'Recover order' }));
  await screen.findByText(/Order recovered/);
  expect(pendingOrder()).toBeNull();
  expect(buy).not.toHaveBeenCalled();
  expect(round).not.toHaveBeenCalled();
});
it('holds an unresolved old-round request and never resubmits it in the next round', async () => {
  seed();
  vi.spyOn(api, 'me').mockResolvedValue({
    user: { id: 'fixture-owner', walletAddress: 'fixture-wallet' },
  });
  vi.spyOn(api, 'recoverOrder').mockResolvedValue({ status: 'UNRESOLVED', receipts: [] });
  vi.spyOn(api, 'currentRound').mockResolvedValue({
    round: { id: 'new-round' } as never,
    serverTime: '',
  });
  show();
  await userEvent.click(await screen.findByRole('button', { name: 'Recover order' }));
  await screen.findByText(/Original round closed/);
  expect(pendingOrder()?.key).toBe('fixture-original-key');
});
