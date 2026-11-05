// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TerminalAnalytics } from './TerminalAnalytics.js';
const { sample } = vi.hoisted(() => ({
  sample: { status: 'unavailable', reason: 'RPC_HTTP_429' },
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: sample, isPending: false, isFetching: false }),
}));
vi.mock('./market-trades.js', async (original) => ({
  ...(await original<typeof import('./market-trades.js')>()),
  useMarketTrades: () => ({
    data: {
      trades: [
        {
          id: 'explicit-test-fixture',
          wallet: '11111111111111111111111111111111',
          signature: 'fixture-tx',
          side: 'SELL',
          time: Date.now(),
          volumeUsd: 12,
          quantity: 3,
          priceUsd: 4,
        },
      ],
      gaps: [],
      lastError: null,
    },
    isFetching: false,
  }),
}));
afterEach(cleanup);
const props = {
  mint: '11111111111111111111111111111111',
  pool: '11111111111111111111111111111111',
  snapshot: null,
};
it('renders source-backed transaction actions and observed trader metrics without claiming profitability', () => {
  const { rerender } = render(
    <MemoryRouter>
      <TerminalAnalytics {...props} kind="activity" />
    </MemoryRouter>,
  );
  expect(screen.getByText('SELL')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Transaction fixture-tx' })).toHaveAttribute(
    'href',
    'https://solscan.io/tx/fixture-tx',
  );
  expect(
    screen.getByRole('link', { name: 'Wallet 11111111111111111111111111111111' }),
  ).toHaveAttribute('href', 'https://solscan.io/account/11111111111111111111111111111111');
  rerender(
    <MemoryRouter>
      <TerminalAnalytics {...props} kind="traders" />
    </MemoryRouter>,
  );
  expect(screen.getByText(/not wallet holdings/)).toBeInTheDocument();
  expect(screen.getByText('Unavailable')).toBeInTheDocument();
});
it('reports holder provider failure without rendering an invented zero holder count', () => {
  render(
    <MemoryRouter>
      <TerminalAnalytics {...props} kind="holders" />
    </MemoryRouter>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('RPC_HTTP_429');
  expect(screen.getByRole('status')).toHaveTextContent('No holder count is inferred');
  expect(screen.queryByRole('table')).toBeNull();
});
it('does not fabricate developer associations when creator evidence is unavailable', () => {
  render(
    <MemoryRouter>
      <TerminalAnalytics {...props} kind="dev" />
    </MemoryRouter>,
  );
  expect(screen.getByText('Creator identity unavailable')).toBeInTheDocument();
  expect(screen.getByText(/No verified creator-linked tokens/)).toBeInTheDocument();
});
