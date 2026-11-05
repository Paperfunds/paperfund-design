// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CompetitionPulseBuy } from './CompetitionPulseBuy.js';
import { api } from './api.js';
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
function show(expired = false) {
  localStorage.clear();
  vi.spyOn(api, 'account').mockResolvedValue({
    accountId: 'fixture-account',
    roundId: 'fixture-round',
    paperSolLamports: '10000000000',
  } as Awaited<ReturnType<typeof api.account>>);
  vi.spyOn(api, 'me').mockResolvedValue({ user: { id: 'fixture-owner' } } as Awaited<
    ReturnType<typeof api.me>
  >);
  vi.spyOn(api, 'buyPreflight').mockResolvedValue({
    accountId: 'fixture-account',
    roundId: 'fixture-round',
    marketSupported: true,
    slotAvailable: true,
    valuationStatus: 'AVAILABLE',
    maxBuyLamports: '2000000000',
  } as Awaited<ReturnType<typeof api.buyPreflight>>);
  vi.spyOn(api, 'quote').mockResolvedValue({
    mint: 'fixture-mint',
    side: 'BUY',
    output: '1000000',
    feeLamports: '100',
    decimals: 6,
    expiresAt: new Date(Date.now() + (expired ? -1000 : 10000)).toISOString(),
    binding: 'SERVER_MIN_OUTPUT', quoteToken: 'test-quote', slippageBps: 100,
  } as Awaited<ReturnType<typeof api.quote>>);
  const buy = vi
    .spyOn(api, 'buy')
    .mockResolvedValue({ fillId: 'fixture-fill' } as Awaited<ReturnType<typeof api.buy>>);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <CompetitionPulseBuy mint="fixture-mint" symbol="FIXTURE" amount="0.01" close={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return buy;
}
it('previews and confirms through the shared account API with exact amount and owner/round binding', async () => {
  const buy = show();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Preview PAPER BUY' })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Preview PAPER BUY' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Confirm PAPER BUY' })).toBeEnabled(),
  );
  expect(screen.getByText(/Server enforces quote expiry/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Confirm PAPER BUY' }));
  await screen.findByText(/PAPER BUY confirmed/);
  expect(buy).toHaveBeenCalledTimes(1);
  expect(buy).toHaveBeenCalledWith(
    'fixture-mint',
    '0.01',
    expect.any(String),
    expect.objectContaining({
      owner: 'fixture-owner',
      accountId: 'fixture-account',
      roundId: 'fixture-round',
    }),
    expect.objectContaining({ quoteToken: 'test-quote' }),
    100,
  );
  expect(screen.getByRole('button', { name: 'Confirmed' })).toBeDisabled();
});
it('does not submit an expired estimate', async () => {
  const buy = show(true);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Preview PAPER BUY' })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Preview PAPER BUY' }));
  await screen.findByText(/Expected receive/);
  expect(screen.getByRole('button', { name: 'Confirm PAPER BUY' })).toBeDisabled();
  expect(buy).not.toHaveBeenCalled();
});
