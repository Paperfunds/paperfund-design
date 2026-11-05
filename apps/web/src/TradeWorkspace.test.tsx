// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TokenMarketView } from './TokenMarketView.js';
const state = vi.hoisted(() => ({
  now: 1_000_000,
  listing: null as Record<string, unknown> | null,
}));
const mint = 'So11111111111111111111111111111111111111112';
vi.mock('./use-pulse.js', () => ({
  usePulseFeed: () => ({
    snapshot: {
      tokens: [
        {
          mint: 'So11111111111111111111111111111111111111112',
          name: 'Explicit UI fixture',
          symbol: 'TEST',
          verifiedAt: state.now,
          progressVerifiedAt: state.now,
          marketCapSol: 35.5,
          firstSeenAt: state.now - 1000,
        },
      ],
    },
    now: state.now,
    healthy: true,
  }),
}));
vi.mock('./terminal-market.js', async (original) => ({
  ...(await original<typeof import('./terminal-market.js')>()),
  useTokenListing: () => ({ data: state.listing, isFetching: false, isError: false }),
}));
vi.mock('./WebsiteMarkets.js', () => ({ WebsiteMarketChart: () => <div>Preserved chart</div> }));
vi.mock('./TerminalAnalytics.js', () => ({
  TerminalAnalytics: () => <div>Preserved analytics</div>,
}));
afterEach(() => {
  cleanup();
  state.listing = null;
});
const show = (onTab = vi.fn()) =>
  render(
    <MemoryRouter>
      <TokenMarketView mint={mint} tab="activity" onTab={onTab} portfolio={null} history={null} />
    </MemoryRouter>,
  );
it('keeps native cap explicitly in SOL and missing analytics unavailable', () => {
  show();
  const summary = screen.getByRole('region', { name: 'Token summary' });
  expect(summary).toHaveTextContent('35.5 SOL');
  expect(summary).not.toHaveTextContent('$35.5');
  expect(summary).toHaveTextContent('Holders Unavailable');
  expect(summary).toHaveTextContent('— buys');
  expect(screen.getByText('Preserved chart')).toBeInTheDocument();
});
it('renders genuine-source zero changes distinctly from missing changes and does not drop zero activity', () => {
  state.listing = {
    mint,
    pair: mint,
    observedAt: state.now,
    priceUsd: 0.01,
    marketCapUsd: 12000,
    volume24h: 0,
    liquidityUsd: 100,
    buys5m: 0,
    sells5m: 1,
    change5m: 0,
    change1h: -2.4,
    change24h: null,
    links: [],
  };
  show();
  const summary = screen.getByRole('region', { name: 'Token summary' });
  expect(summary).toHaveTextContent('$12K');
  expect(summary).toHaveTextContent('0.00%');
  expect(summary).toHaveTextContent('-2.40%');
  expect(summary).toHaveTextContent('0 buys');
  expect(summary).toHaveTextContent('24h —');
});
it('does not show stale market prices, cap, activity or changes as current', () => {
  state.listing = {
    mint,
    pair: mint,
    observedAt: state.now - 120001,
    priceUsd: 9,
    marketCapUsd: 999999,
    buys5m: 44,
    change1h: 123,
    links: [],
  };
  show();
  const summary = screen.getByRole('region', { name: 'Token summary' });
  expect(summary).not.toHaveTextContent('$1M');
  expect(summary).not.toHaveTextContent('44 buys');
  expect(summary).not.toHaveTextContent('123.00%');
});
it('keeps all seven intelligence actions accessible with their original selection callbacks', async () => {
  const onTab = vi.fn();
  show(onTab);
  const tabs = within(screen.getByRole('navigation', { name: 'Token intelligence' }));
  const labels = [
    'Activity',
    'Holders',
    'Top Traders',
    'Dev Tokens',
    'Positions',
    'Trade history',
    'Token information',
  ];
  for (const label of labels) await userEvent.click(tabs.getByRole('button', { name: label }));
  expect(onTab.mock.calls.map((c) => c[0])).toEqual([
    'activity',
    'holders',
    'traders',
    'dev',
    'positions',
    'history',
    'info',
  ]);
});
