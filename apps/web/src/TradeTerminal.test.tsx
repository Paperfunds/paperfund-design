// @vitest-environment jsdom
// Explicitly mocked API responses; genuine-market acceptance is recorded separately.
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PracticePage } from './Practice.js';
import { practiceApi, type PracticeAccount, type PracticeQuote } from './practice-api.js';
vi.mock('./WebsiteMarkets.js', () => ({
  WebsiteMarketPicker: () => null,
  WebsiteMarketChart: () => null,
}));
vi.mock('./TokenMarketView.js', () => ({
  TokenMarketView: () => null,
  TicketMarketSummary: () => null,
}));
const mint = 'So11111111111111111111111111111111111111112';
const account: PracticeAccount = {
  mode: 'PRACTICE',
  rewardEligible: false,
  wallet: mint,
  cash: '10000000000',
  positions: [],
  trades: [],
};
const quote: PracticeQuote = {
  id: 'fixture-only',
  mint,
  side: 'BUY',
  input: '100000000',
  output: '1000000',
  decimals: 6,
  fee: '1000',
  minimumOutput: '990000',
  expires: Date.now() + 60000,
  protocol: 'FIXTURE_ONLY',
  slot: '1',
};
function show(value = account) {
  vi.spyOn(practiceApi, 'account').mockResolvedValue(value);
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter initialEntries={['/practice?mint=' + mint]}>
        <PracticePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
it('refuses a mismatched executable quote before confirmation', async () => {
  vi.spyOn(practiceApi, 'quote').mockResolvedValue({ ...quote, mint: 'another-mint' });
  const trade = vi.spyOn(practiceApi, 'trade');
  show();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Preview practice order' })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Preview practice order' }));
  await screen.findByText(/Executable quote does not match/);
  expect(screen.queryByRole('button', { name: 'Confirm practice BUY' })).toBeNull();
  expect(trade).not.toHaveBeenCalled();
});
it('shares saved Pulse presets and sends exact lamports', async () => {
  localStorage.setItem('pf.pulse.buy-presets', JSON.stringify(['0.012345678', '0.2', '0.3']));
  const read = vi.spyOn(practiceApi, 'quote').mockResolvedValue({ ...quote, input: '12345678' });
  show();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Preview practice order' })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole('button', { name: '0.012345678 Paper SOL' }));
  await userEvent.click(screen.getByRole('button', { name: 'Preview practice order' }));
  await screen.findByRole('button', { name: 'Confirm practice BUY' });
  expect(read).toHaveBeenCalledWith(mint, 'BUY', '12345678', 100);
});
it('uses integer proportional quantities for partial SELL and all remaining tokens for SELL ALL', async () => {
  vi.spyOn(practiceApi, 'quote').mockImplementation(async (m, side, input) => ({
    ...quote,
    mint: m,
    side,
    input,
  }));
  show({ ...account, positions: [{ mint, quantity: '1000003', basis: '10000000', decimals: 6 }] });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Preview practice order' })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole('button', { name: 'SELL' }));
  await userEvent.click(screen.getByRole('button', { name: '25%' }));
  await userEvent.click(screen.getByRole('button', { name: 'Preview practice order' }));
  await screen.findByRole('button', { name: 'Confirm practice SELL' });
  expect(practiceApi.quote).toHaveBeenCalledWith(mint, 'SELL', '250000', 100);
  expect(screen.getByLabelText('Executable quote preview')).toHaveTextContent('-0.001499992 Paper SOL');
  expect(screen.getByLabelText('Executable quote preview')).toHaveTextContent('Protocol fees · included');
  await userEvent.click(screen.getByRole('button', { name: 'SELL ALL' }));
  await userEvent.click(screen.getByRole('button', { name: 'Preview practice order' }));
  await screen.findByRole('button', { name: 'Confirm practice SELL' });
  expect(practiceApi.quote).toHaveBeenCalledWith(mint, 'SELL', '1000003', 100);
  expect(screen.getByLabelText('Executable quote preview')).toHaveTextContent('-0.009 Paper SOL');
});
