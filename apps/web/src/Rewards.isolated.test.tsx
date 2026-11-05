// @vitest-environment jsdom
// Explicit UI fixtures: protect test-vs-real reward presentation.
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RewardsPage } from './Rewards.js';
import { api } from './api.js';
vi.mock('./competition-mode.js', () => ({
  isolatedCompetitionTest: true,
  competitionRewardUnit: 'TEST units · no cash value',
}));
it('never presents disposable competition allocations or a mistaken payout flag as real SOL rewards', async () => {
  vi.spyOn(api, 'hourlyRewards').mockResolvedValue({
    status: 'PROVISIONAL',
    provisionalNaturalHourlyLamports: '1000000000',
  });
  vi.spyOn(api, 'dailyRewards').mockResolvedValue({
    status: 'PROVISIONAL',
    accumulatedLamports: '2000000000',
  });
  vi.spyOn(api, 'hourly').mockResolvedValue(null);
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            stop: 'CLEARED',
            payoutsActive: true,
            observedCreatorFeesLamports: '3000000000',
            observations: [],
            payoutHistory: [
              {
                signature: 'EXPLICIT_NON_CHAIN_FIXTURE',
                lamports: '1000000000',
                verifiedAt: '2026-11-03T12:00:00Z',
                status: 'VERIFIED',
              },
            ],
          }),
        ),
    ),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RewardsPage user={null} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('1 TEST units · no cash value')).toBeInTheDocument();
  expect(screen.getByText(/Mainnet funding evidence is disconnected/)).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByText('3 TEST units · no cash value')).toBeNull();
  expect(screen.getByText('TEST ONLY · Real payouts disabled')).toBeInTheDocument();
  expect(screen.queryByText('SOL payouts available')).toBeNull();
  expect(screen.queryByText('1 SOL')).toBeNull();
  expect(screen.queryByText('VERIFIED · PAID')).toBeNull();
  vi.unstubAllGlobals();
});
