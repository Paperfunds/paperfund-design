// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TokenMarketView } from './TokenMarketView.js';
const { token } = vi.hoisted(() => ({
  token: {
    mint: 'So11111111111111111111111111111111111111112',
    name: 'Explicit test fixture',
    symbol: 'FIXTURE',
    stage: 'new',
    source: 'pumpportal',
    firstSeenAt: 100,
    lastSeenAt: 100,
    marketCapSol: null,
    curveProgressPct: null,
    verifiedAt: 100,
    creatorAddress: '11111111111111111111111111111111',
    mintAuthorityDisabled: true,
    freezeAuthorityDisabled: false,
    links: [{ label: 'twitter', url: 'https://x.com/fixture/status/123' }],
    metadataStatus: 'AVAILABLE',
  },
}));
vi.mock('./use-pulse.js', () => ({
  usePulseFeed: () => ({ snapshot: { tokens: [token] }, now: Date.now(), healthy: true }),
}));
vi.mock('./terminal-market.js', async (original) => ({
  ...(await original<typeof import('./terminal-market.js')>()),
  useTokenListing: () => ({ data: null, isFetching: false, isError: false }),
}));
vi.mock('./WebsiteMarkets.js', () => ({ WebsiteMarketChart: () => null }));
afterEach(cleanup);
it('portfolio mode exposes account tabs and preserves supplied history without a token/chart placeholder', () => {
 const onTab=vi.fn();
 const {rerender}=render(<MemoryRouter><TokenMarketView accountOnly mint="" tab="positions" onTab={onTab} portfolio={<p>Recorded holdings</p>} history={<p>Recorded fills</p>}/></MemoryRouter>);
 expect(screen.getByRole('navigation',{name:'Portfolio sections'})).toBeInTheDocument();
 expect(screen.getByText('Recorded holdings')).toBeInTheDocument();
 expect(screen.queryByText('Solana token')).toBeNull();
 rerender(<MemoryRouter><TokenMarketView accountOnly mint="" tab="history" onTab={onTab} portfolio={<p>Recorded holdings</p>} history={<p>Recorded fills</p>}/></MemoryRouter>);
 expect(screen.getByText('Recorded fills')).toBeInTheDocument();
 expect(screen.queryByText('Recorded holdings')).toBeNull();
});
it('surfaces supplied Pulse post, confirmed creator and exact authority flags without fabricating holder analytics', () => {
  render(
    <MemoryRouter>
      <TokenMarketView
        mint={token.mint}
        tab="info"
        onTab={() => {}}
        portfolio={null}
        history={null}
      />
    </MemoryRouter>,
  );
  expect(screen.getAllByRole('link', { name: 'Tweet / post ↗' })[0]).toHaveAttribute(
    'href',
    'https://x.com/fixture/status/123',
  );
  expect(screen.getByRole('link', { name: token.creatorAddress + ' ↗' })).toHaveAttribute(
    'href',
    'https://solscan.io/account/' + token.creatorAddress,
  );
  expect(screen.getByText('Disabled')).toBeInTheDocument();
  expect(screen.getByText('Enabled')).toBeInTheDocument();
  expect(screen.getByText('Unavailable from current providers')).toBeInTheDocument();
});
it('does not carry a prior token identity or socials to an unrelated mint', () => {
  render(
    <MemoryRouter>
      <TokenMarketView
        mint="another-mint"
        tab="info"
        onTab={() => {}}
        portfolio={null}
        history={null}
      />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('link', { name: 'Tweet / post ↗' })).toBeNull();
  expect(screen.queryByText('Explicit test fixture')).toBeNull();
  expect(screen.getByText('Identity verification unavailable')).toBeInTheDocument();
});
