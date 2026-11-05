// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { App } from './App.js';
import type { Account, Round } from './types.js';
import './test/setup.js';

const now = new Date();
const round: Round = {
  id: 'round-1',
  startsAt: new Date(now.getTime() - 1_000).toISOString(),
  endsAtExclusive: new Date(now.getTime() + 3_600_000).toISOString(),
  state: 'OPEN',
  startingPaperSolLamports: '10000000000',
  maxUniqueTokens: 5,
  maxBuyRatioBps: 2000,
  rewardFinalizationGracePeriodSeconds: 60,
};
const account: Account = {
  accountId: 'account-1',
  roundId: 'round-1',
  paperSolLamports: '8000000000',
  startingPaperSolLamports: '10000000000',
  realizedPnlLamports: '0',
  slotsUsed: 1,
  slotLimit: 5,
  roundState: 'OPEN',
  positions: [
    {
      id: 'position-1',
      mint: '11111111111111111111111111111111',
      originMarketId: 'market-1',
      originProtocol: 'PUMP_FUN',
      tokenDecimals: 6,
      tokenQuantityBaseUnits: '1000000',
      costBasisPaperSolLamports: '2000000000',
      realizedPnlLamports: '0',
      valuation: {
        status: 'UNAVAILABLE',
        reason: 'MARKET_STATE_UNAVAILABLE',
        valuedAt: new Date().toISOString(),
      },
    },
  ],
};

function response(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

function mockApi(
  options: {
    authenticated?: boolean;
    entered?: boolean;
    marketError?: string;
    preflightUnavailable?: boolean;
    valuationAvailable?: boolean;
    migrated?: boolean;
    liveUnavailable?: boolean;
  } = {},
) {
  let entered = options.entered ?? false;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/me'))
      return options.authenticated
        ? response({ user: { id: 'user-1', walletAddress: '11111111111111111111111111111111' } })
        : response(
            { error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } },
            401,
          );
    if (url.endsWith('/rounds/current'))
      return response({ round, serverTime: new Date().toISOString() });
    if (url.endsWith('/rounds/current/account'))
      return entered
        ? response(account)
        : response({ error: { code: 'ROUND_ACCOUNT_NOT_FOUND', message: 'Not entered.' } }, 404);
    if (url.endsWith('/rounds/current/enter')) {
      entered = true;
      return response(account);
    }
    if (url.includes('/results/hourly')) return response({ items: [], nextCursor: null });
    if (url.includes('/trades/buy-preflight'))
      return response({
        accountId: account.accountId,
        roundId: account.roundId,
        cashLamports: account.paperSolLamports,
        executablePositionsLamports: options.preflightUnavailable ? null : '2000000000',
        portfolioEquityLamports: options.preflightUnavailable ? null : '10000000000',
        maxBuyByRatioLamports: options.preflightUnavailable ? null : '2000000000',
        maxBuyLamports: options.preflightUnavailable ? null : '2000000000',
        maxBuyRatioBps: '2000',
        slotsUsed: 1,
        slotLimit: 5,
        targetAlreadyConsumesSlot: true,
        requiresNewSlot: false,
        slotAvailable: true,
        marketSupported: true,
        protocol: 'PUMP_FUN',
        marketStatus: 'ACTIVE_BONDING_CURVE',
        valuationStatus: options.preflightUnavailable ? 'UNAVAILABLE' : 'AVAILABLE',
        unavailablePositionIds: options.preflightUnavailable ? ['position-1'] : [],
        serverTime: now.toISOString(),
      });
    if (url.endsWith('/positions'))
      return response({
        accountId: account.accountId,
        roundId: account.roundId,
        cashLamports: account.paperSolLamports,
        startingPaperSolLamports: account.startingPaperSolLamports,
        valuationStatus: options.valuationAvailable ? 'AVAILABLE' : 'UNAVAILABLE',
        executablePositionsLamports: options.valuationAvailable ? '2100000000' : null,
        portfolioEquityLamports: options.valuationAvailable ? '10100000000' : null,
        livePnlLamports: options.valuationAvailable ? '100000000' : null,
        valuedAt: now.toISOString(),
        positions: account.positions.map((position) => ({
          ...position,
          valuation: options.valuationAvailable
            ? {
                status: 'AVAILABLE',
                executablePaperSolLamports: '2100000000',
                unrealizedPnlLamports: '100000000',
                currentProtocol: options.migrated ? 'PUMP_SWAP' : 'PUMP_FUN',
                evidenceFingerprint: 'fixture-fingerprint',
                observedAt: now.toISOString(),
                chainSlot: '123',
                valuedAt: now.toISOString(),
              }
            : position.valuation,
        })),
      });
    if (url.includes('/trades') && (!init?.method || init.method === 'GET'))
      return response({ items: [], nextCursor: null });
    if (url.endsWith('/trades/quote')) {
      const input = JSON.parse(String(init?.body)) as { mint: string; side: string; amount: string; slippageBps: number };
      return response({ ...input, requestedInput: input.amount, input: input.amount, output: '500000', feeLamports: '100', decimals: 6,
        quoteToken: 'explicit-synthetic-test-quote', binding: 'SERVER_MIN_OUTPUT', slippageBps: input.slippageBps,
        expiresAt: new Date(Date.now() + 10000).toISOString(), estimatedRealizedPnlLamports: null });
    }
    if (url.includes('/markets/'))
      return options.marketError
        ? response({ error: { code: options.marketError, message: 'Rejected.' } }, 422)
        : response({
            mint: account.positions[0]!.mint,
            supported: true,
            executionProtocol: 'PUMP_FUN',
            status: 'ACTIVE_BONDING_CURVE',
            tokenDecimals: 6,
          });
    if (url.endsWith('/trades/sell'))
      return response({
        fillId: 'fixture-sell-fill',
        tokenMint: account.positions[0]!.mint,
        executionProtocol: 'PUMP_FUN',
        tokenAmountSoldBaseUnits:
          JSON.parse(String(init?.body)).quantity === 'ALL'
            ? '1000000'
            : JSON.parse(String(init?.body)).quantity,
        paperSolCreditedLamports: '900000000',
        feeLamports: '1000000',
        realizedPnlLamports: '100000000',
        executedAt: now.toISOString(),
      });
    if (url.endsWith('/trades/buy'))
      return response({
        fillId: 'fixture-buy-fill',
        tokenMint: account.positions[0]!.mint,
        executionProtocol: 'PUMP_FUN',
        actualPaperSolSpentLamports: '1000000000',
        tokenQuantityReceivedBaseUnits: '500000',
        feeLamports: '1000000',
        executedAt: now.toISOString(),
      });
    if (url.includes('/leaderboards/hourly/live'))
      return response({
        round: {
          id: round.id,
          starts_at: round.startsAt,
          ends_at_exclusive: round.endsAtExclusive,
          state: 'OPEN',
        },
        phase: 'LIVE',
        status: options.liveUnavailable ? 'UNAVAILABLE' : 'AVAILABLE',
        reason: options.liveUnavailable ? 'POSITION_VALUATION_UNAVAILABLE' : null,
        entries: options.liveUnavailable
          ? []
          : [
              {
                user_id: 'user-1',
                wallet_address: account.positions[0]!.mint,
                score: '100000000',
                equityLamports: '10100000000',
                rank: 1,
                tied: true,
                tieGroupSize: 2,
                slotsUsed: 1,
                openPositions: 1,
              },
              {
                user_id: 'user-2',
                wallet_address: 'other-wallet',
                score: '100000000',
                equityLamports: '10100000000',
                rank: 1,
                tied: true,
                tieGroupSize: 2,
                slotsUsed: 2,
                openPositions: 1,
              },
            ],
      });
    if (url.endsWith('/leaderboards/hourly'))
      return response({
        round: { ...round, state: 'FINALIZED' },
        entries: [
          {
            user_id: 'user-1',
            wallet_address: account.positions[0]!.mint,
            score: '2000000000',
            final_settled_balance_lamports: '12000000000',
            rank: 1,
            tied: false,
            tieGroupSize: 1,
          },
        ],
      });
    if (url.includes('/leaderboards/daily'))
      return response({
        dailyCompetition: {
          id: 'daily-1',
          startsAt: now.toISOString(),
          endsAtExclusive: now.toISOString(),
          state: 'OPEN',
        },
        entries: [
          {
            user_id: 'user-1',
            wallet_address: account.positions[0]!.mint,
            score: '2000000000',
            completed_hourly_round_count: 2,
            rank: 1,
            tied: true,
            tieGroupSize: 2,
          },
        ],
      });
    if (url.endsWith('/rewards/me')) return response([]);
    return response({}, 200);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderApp(path = '/trade') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

it('disables BUY and MAX when a refreshed preflight fails instead of relying on cached limits', async () => {
  const fetchMock = mockApi({ authenticated: true, entered: true });
  const original = fetchMock.getMockImplementation()!;
  const { client } = renderApp('/trade?mint=' + account.positions[0]!.mint);
  await userEvent.type(await screen.findByLabelText('Paper SOL amount'), '0.01');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Buy with Paper SOL' })).toBeEnabled(),
  );
  fetchMock.mockImplementation((input, init) =>
    String(input).includes('/trades/buy-preflight')
      ? response({ error: { code: 'RPC_UNAVAILABLE', message: 'Explicit UI fixture outage' } }, 503)
      : original(input, init),
  );
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['buy-preflight'] });
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Buy with Paper SOL' })).toBeDisabled(),
  );
  expect(screen.getByRole('button', { name: 'MAX' })).toBeDisabled();
  expect(screen.getByText('Explicit UI fixture outage')).toBeInTheDocument();
  client.clear();
});

it('follows current hourly standings on refresh without pinning an old round ID', async () => {
  const fetchMock = mockApi({ authenticated: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/hourly']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const region = screen.getByRole('region', { name: 'Live hourly leaderboard' });
  await within(region).findByText('YOU');
  await client.invalidateQueries({ queryKey: ['hourly-live'] });
  const reads = fetchMock.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.includes('/leaderboards/hourly/live'));
  expect(reads.length).toBeGreaterThanOrEqual(2);
  expect(reads.every((url) => !url.includes('roundId='))).toBe(true);
});

it('explains a missing browser wallet before connection succeeds', async () => {
  mockApi();
  Object.defineProperty(window, 'solana', {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(window, 'phantom', {
    configurable: true,
    value: undefined,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/trade']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Connect Wallet' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No compatible Solana wallet');
  client.clear();
});

describe('Paperfund web app', () => {
  it('allows a fresh matching authoritative preflight even if optional market metadata fails', async () => {
    mockApi({ authenticated: true, entered: true, marketError: 'RPC_TIMEOUT' });
    renderApp('/trade?mint=' + account.positions[0]!.mint);
    await userEvent.type(await screen.findByLabelText('Paper SOL amount'), '0.01');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Buy with Paper SOL' })).toBeEnabled(),
    );
  });
  it('does not accept a preflight bound to another account', async () => {
    const fetchMock = mockApi({ authenticated: true, entered: true });
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) =>
      String(input).includes('/trades/buy-preflight')
        ? response({
            ...account,
            accountId: 'other-account',
            roundId: account.roundId,
            marketSupported: true,
            valuationStatus: 'AVAILABLE',
            maxBuyLamports: '1000000000',
            slotAvailable: true,
          })
        : original(input, init),
    );
    renderApp('/trade?mint=' + account.positions[0]!.mint);
    await userEvent.type(await screen.findByLabelText('Paper SOL amount'), '0.01');
    expect(screen.getByRole('button', { name: 'Buy with Paper SOL' })).toBeDisabled();
  });
  it('opens a recorded UTC day and returns to current standings without changing the account', async () => {
    const fetchMock = mockApi({ authenticated: true });
    renderApp('/daily?date=2026-11-02');
    await screen.findByRole('heading', { name: 'Daily leaderboard' });
    expect(screen.getByLabelText('UTC results date')).toHaveValue('2026-11-02');
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes('/leaderboards/daily?date=2026-11-02'),
        ),
      ).toBe(true),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Current UTC day' }));
    await waitFor(() => expect(screen.getByLabelText('UTC results date')).toHaveValue(''));
    const nav = screen.getByRole('navigation', { name: 'Primary navigation' });
    expect(within(nav).getByRole('link', { name: 'Daily' })).toHaveAttribute('href', '/daily');
    expect(within(nav).getByRole('link', { name: 'History' })).toHaveAttribute('href', '/history');
    expect(within(nav).getByRole('link', { name: 'Daily' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Leaderboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });
  it('labels live standings provisional, displays own equity and slots, and does not promise payouts', async () => {
    mockApi({ authenticated: true });
    renderApp('/hourly');
    const board = screen.getByRole('region', {
      name: 'Live hourly leaderboard',
    });
    expect(await within(board).findByText('YOU')).toBeVisible();
    expect(within(board).getByText('LIVE / PROVISIONAL')).toBeVisible();
    expect(within(board).getAllByText('1 (tie ×2)')).toHaveLength(2);
    expect(within(board).getByText(/Provisional scores never allocate rewards/)).toBeVisible();
    expect(within(board).getByText('Slots used')).toBeVisible();
  });

  it('hides provisional ranks when any account cannot be valued', async () => {
    mockApi({ liveUnavailable: true });
    renderApp('/hourly');
    const board = screen.getByRole('region', { name: 'Live hourly leaderboard' });
    expect(await within(board).findByText('Live ranking temporarily unavailable')).toBeVisible();
    expect(within(board).queryByRole('table')).not.toBeInTheDocument();
  });
  it('uses the approved brand mark and publishes privacy disclosures', async () => {
    mockApi();
    const { unmount } = renderApp('/');
    expect(
      screen.getByRole('link', { name: 'Paperfund home' }).querySelector('img'),
    ).toHaveAttribute('src', '/paperfund-mark-v2.svg');
    unmount();
    renderApp('/privacy');
    expect(
      await screen.findByRole('heading', { name: 'Paperfund privacy notice' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not request seed phrases or private keys/i)).toBeInTheDocument();
  });

  it('opens Pulse by default and preserves canonical competition rules', async () => {
    mockApi();
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: /Pulse/i })).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Primary navigation' })).getByRole('link', {
        name: 'Trade',
      }),
    ).toHaveAttribute('href', '/practice');

    renderApp('/rules');
    expect(await screen.findByText('Fresh hourly account')).toBeInTheDocument();
    expect(screen.getByText(/top 10; daily rewards use the top 25/)).toBeInTheDocument();
    expect(
      screen.getByText(/Paper SOL and simulated positions have no monetary value/),
    ).toBeInTheDocument();
  });

  it('shows the unauthenticated product state', async () => {
    mockApi();
    renderApp();
    expect(await screen.findByText('Trade the market.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Wallet' })).toBeEnabled();
  });

  it('distinguishes a connected wallet from an authenticated session', async () => {
    mockApi();
    window.solana = {
      connect: vi
        .fn()
        .mockResolvedValue({ publicKey: { toString: () => '11111111111111111111111111111111' } }),
      signMessage: vi.fn(),
    };
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Connect Wallet' }));
    expect(await screen.findByRole('button', { name: 'Sign In' })).toBeEnabled();
  });

  it('enters the current round and shows the authoritative account', async () => {
    mockApi({ authenticated: true });
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /Enter Round/i }));
    expect((await screen.findAllByText('8 SOL')).length).toBeGreaterThan(0);
    expect(screen.getByText('Open positions')).toBeInTheDocument();
  });

  it('inspects a market, submits BUY, and maps a typed BUY error', async () => {
    const fetchMock = mockApi({ authenticated: true, entered: true });
    renderApp();
    const mint = account.positions[0]!.mint;
    await userEvent.type(await screen.findByLabelText('Token mint'), mint);
    await userEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    expect(await screen.findByText('Supported market')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Paper SOL amount'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Buy with Paper SOL' }));
    expect(await screen.findByText('BUY FILLED')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/trades/buy'),
      expect.objectContaining({ method: 'POST' }),
    );

    fetchMock.mockImplementationOnce(() =>
      response({ error: { code: 'MAX_BUY_RATIO_EXCEEDED', message: 'Rejected.' } }, 409),
    );
    await userEvent.type(screen.getByLabelText('Paper SOL amount'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Buy with Paper SOL' }));
    expect(await screen.findByText('Buy exceeds the 20% per-order limit.')).toBeInTheDocument();
  });

  it('renders positions and supports exact partial SELL and SELL ALL', async () => {
    const fetchMock = mockApi({ authenticated: true, entered: true });
    renderApp();
    expect((await screen.findAllByText('Valuation unavailable')).length).toBeGreaterThan(0);
    const sellInput = screen.getByLabelText('Token base units to sell');
    const position = sellInput.closest('article')!;
    await userEvent.click(within(position).getByRole('button', { name: '10%' }));
    expect(sellInput).toHaveValue('100000');
    await userEvent.click(within(position).getByRole('button', { name: '100%' }));
    expect(sellInput).toHaveValue('1000000');
    await userEvent.click(within(position).getByRole('button', { name: '25%' }));
    expect(sellInput).toHaveValue('250000');
    await userEvent.click(within(position).getByRole('button', { name: 'Sell' }));
    expect(await screen.findByText('SELL FILLED')).toBeInTheDocument();
    await userEvent.click(within(position).getByRole('button', { name: 'Sell All' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, init]) => String(init?.body).includes('"quantity":"ALL"')),
      ).toBe(true),
    );
  });

  it('uses the exact backend max and disables BUY when preflight cannot value equity', async () => {
    mockApi({ authenticated: true, entered: true });
    const { unmount } = renderApp();
    await userEvent.type(await screen.findByLabelText('Token mint'), account.positions[0]!.mint);
    await userEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    await screen.findByText('Supported market');
    await userEvent.click(await screen.findByRole('button', { name: 'MAX' }));
    expect(screen.getByLabelText('Paper SOL amount')).toHaveValue('2');
    await userEvent.clear(screen.getByLabelText('Paper SOL amount'));
    await userEvent.type(screen.getByLabelText('Paper SOL amount'), '2.000000001');
    expect(screen.getByText('Exceeds 20% maximum for this order.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buy with Paper SOL' })).toBeDisabled();

    unmount();
    mockApi({ authenticated: true, entered: true, preflightUnavailable: true });
    renderApp();
    await userEvent.type(await screen.findByLabelText('Token mint'), account.positions[0]!.mint);
    await userEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    expect(await screen.findByRole('button', { name: 'MAX' })).toBeDisabled();
  });

  it('renders exact live equity, P&L, executable value, and a migrated current venue', async () => {
    mockApi({ authenticated: true, entered: true, valuationAvailable: true, migrated: true });
    renderApp();
    expect(await screen.findByText('10.1 SOL')).toBeInTheDocument();
    expect((await screen.findAllByText('+0.1 SOL')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('2.1 SOL')).toBeInTheDocument();
    expect(screen.getByText(/PumpSwap current/)).toBeInTheDocument();
  });

  it('renders backend ranks and tie metadata on hourly and daily boards', async () => {
    mockApi({ authenticated: true });
    const { unmount } = renderApp('/hourly');
    expect(await screen.findByText('+2 SOL')).toBeInTheDocument();
    unmount();
    renderApp('/daily');
    expect(
      within(screen.getByRole('navigation', { name: 'Primary navigation' })).getByRole('link', {
        name: 'Daily',
      }),
    ).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText('T2')).toBeInTheDocument();
    expect(screen.getByText('YOU')).toBeInTheDocument();
  });

  it('detects a new round without carrying the old account into it', async () => {
    mockApi({ authenticated: true, entered: true });
    const changedRound = { ...round, id: 'round-2' };
    const originalFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    originalFetch.mockImplementation((input: RequestInfo | URL) =>
      String(input).endsWith('/rounds/current')
        ? response({ round: changedRound, serverTime: new Date().toISOString() })
        : String(input).endsWith('/auth/me')
          ? response({ user: { id: 'user-1', walletAddress: account.positions[0]!.mint } })
          : String(input).endsWith('/rounds/current/account')
            ? response(account)
            : String(input).includes('/trades')
              ? response({ items: [], nextCursor: null })
              : response({ items: [], nextCursor: null }),
    );
    renderApp();
    expect(await screen.findByText('New round available')).toBeInTheDocument();
  });
});
