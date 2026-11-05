// @vitest-environment jsdom
// Explicit UI fixtures only. These numbers are not live participants or prize funding.
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, cleanup, within, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CompetitionSummary, utcCountdown } from './CompetitionSummary.js';
import { api, ApiError } from './api.js';
import type { Round } from './types.js';
const round: Round = {
  id: 'FIXTURE-HOUR',
  startsAt: '2026-11-03T12:00:00Z',
  endsAtExclusive: '2026-11-03T13:00:00Z',
  state: 'OPEN',
  startingPaperSolLamports: '10000000000',
  maxUniqueTokens: 5,
  maxBuyRatioBps: 2000,
  rewardFinalizationGracePeriodSeconds: 60,
};
const day = {
  id: 'FIXTURE-DAY',
  startsAt: '2026-11-03T00:00:00Z',
  endsAtExclusive: '2026-11-04T00:00:00Z',
  state: 'OPEN',
};
const user = { id: 'fixture-user', walletAddress: '11111111111111111111111111111111' };
function fixtures() {
  vi.spyOn(api, 'currentRound').mockResolvedValue({ round, serverTime: '2026-11-03T12:30:00Z' });
  vi.spyOn(api, 'currentDay').mockResolvedValue({
    competition: day,
    serverTime: '2026-11-03T12:30:00Z',
  });
  vi.spyOn(api, 'liveHourly').mockResolvedValue({
    round: {
      id: round.id,
      starts_at: round.startsAt,
      ends_at_exclusive: round.endsAtExclusive,
      state: 'OPEN',
    },
    phase: 'LIVE',
    status: 'AVAILABLE',
    reason: null,
    serverTime: '2026-11-03T12:30:00Z',
    entries: [
      {
        user_id: user.id,
        wallet_address: user.walletAddress,
        score: '-100000000',
        equityLamports: '9900000000',
        slotsUsed: 1,
        openPositions: 0,
        rank: 1,
        tied: false,
        tieGroupSize: 1,
      },
    ],
  });
  vi.spyOn(api, 'daily').mockResolvedValue({
    dailyCompetition: day,
    entries: [
      {
        user_id: user.id,
        wallet_address: user.walletAddress,
        score: '-200000000',
        completed_hourly_round_count: 2,
        rank: 1,
        tied: false,
        tieGroupSize: 1,
      },
    ],
  });
  vi.spyOn(api, 'account').mockRejectedValue(
    new ApiError('ROUND_ACCOUNT_NOT_FOUND', 'Not entered', undefined, 404),
  );
  vi.spyOn(api, 'competitionPool').mockImplementation(async (kind) =>
    kind === 'hourly'
      ? { hourlyRoundId: round.id, status: 'PROVISIONAL', provisionalNaturalHourlyLamports: '0' }
      : { dailyCompetitionId: day.id, status: 'PROVISIONAL', accumulatedLamports: '0' },
  );
  vi.spyOn(api, 'competitionWinners').mockResolvedValue(null);
}
function show(kind: 'hourly' | 'daily' = 'hourly') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <aside>FIXTURE DATA · UI test only · no reward eligibility</aside>
        <CompetitionSummary kind={kind} user={user} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return client;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('shows server ranks, negative P&L, actual zero funding and authoritative limits without Practice balances', async () => {
  fixtures();
  show();
  const panel = screen.getByRole('region', { name: 'hourly competition overview' });
  expect(await within(panel).findByText('-0.1 Paper SOL')).toBeInTheDocument();
  expect(within(panel).getByText('Rank #1')).toBeInTheDocument();
  expect(within(panel).getByText('20% of executable equity')).toBeInTheDocument();
  expect(await within(panel).findByText('0 SOL')).toBeInTheDocument();
  expect(within(panel).getByText(/Practice trades are not ranked/)).toBeInTheDocument();
});
it('keeps unavailable providers distinct from zero participants or prizes', async () => {
  fixtures();
  vi.mocked(api.currentRound).mockRejectedValue(
    new ApiError('LOCAL_COMPETITION_DISCONNECTED', 'Disconnected test preview', undefined, 503),
  );
  show();
  await screen.findByRole('alert');
  expect(screen.getByRole('region', { name: 'hourly competition overview' })).not.toHaveTextContent(
    '0 SOL',
  );
  expect(screen.queryByText('Rank #1')).toBeNull();
  expect(api.competitionPool).not.toHaveBeenCalled();
});
it('binds daily cumulative scores and allocations to the current UTC day', async () => {
  fixtures();
  vi.mocked(api.competitionWinners).mockResolvedValue({
    id: 'FIXTURE-PLAN',
    state: 'VALIDATED',
    dailyCompetitionId: day.id,
    hourlyRoundId: null,
    prizePoolLamports: '123',
    allocations: [
      {
        walletAddress: user.walletAddress,
        competitiveRank: 1,
        tied: false,
        tieGroupSize: 1,
        allocatedLamports: '123',
      },
    ],
  });
  show('daily');
  await screen.findByText('-0.2 Paper SOL');
  expect(screen.getByText('Wed, 04 Nov 2026 00:00:00 GMT')).toBeInTheDocument();
  expect(screen.getByLabelText('daily countdown')).not.toHaveTextContent('Unavailable');
  await waitFor(() => expect(api.competitionWinners).toHaveBeenCalledWith('daily', day.id));
  expect(screen.getByText('Allocation · VALIDATED')).toBeInTheDocument();
  expect(screen.queryByText('Verified payment')).toBeNull();
  expect(screen.getByText(/No live-hour estimate is added/i)).toBeInTheDocument();
});
it('does not carry a prior round account, pool or standings through rollover', async () => {
  fixtures();
  const client = show();
  await screen.findByText('Rank #1');
  await act(async () => {
    client.setQueryData(['round'], {
      round: { ...round, id: 'FIXTURE-NEXT' },
      serverTime: '2026-11-03T13:00:00Z',
    });
  });
  await waitFor(() => expect(api.competitionPool).toHaveBeenCalledWith('hourly', 'FIXTURE-NEXT'));
  expect(screen.queryByText('Rank #1')).toBeNull();
  expect(screen.queryByText('-0.1 Paper SOL')).toBeNull();
});
it('uses server time for UTC countdowns and never finalizes a round in the browser', () => {
  expect(utcCountdown('2026-11-03T13:00:00Z', '2026-11-03T12:30:00Z', 1000, 1000)).toBe('00:30:00');
  expect(utcCountdown('2026-11-03T13:00:00Z', '2026-11-03T12:30:00Z', 1000, 1801000)).toBe(
    'Awaiting server transition',
  );
});
