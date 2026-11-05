// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WebsiteMarketPicker } from './WebsiteMarkets.js';
import { searchPublicPairs } from './market-discovery.js';
vi.mock('./market-discovery.js', async (original) => ({
  ...(await original<typeof import('./market-discovery.js')>()),
  searchPublicPairs: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('supports dismissing and reopening search results with keyboard focus and selection', async () => {
  const mint = 'So11111111111111111111111111111111111111112';
  vi.mocked(searchPublicPairs).mockResolvedValue([
    { baseToken: { address: mint, symbol: 'FIXTURE', name: 'Explicit UI fixture' } },
  ]);
  const select = vi.fn(),
    user = userEvent.setup();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WebsiteMarketPicker selectedMint="" onSelect={select} />
    </QueryClientProvider>,
  );
  const input = screen.getByRole('textbox');
  await user.type(input, 'fixture');
  const result = await screen.findByRole('button', { name: /Explicit UI fixture/ });
  expect(input).toHaveAttribute('aria-expanded', 'true');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('button', { name: /Explicit UI fixture/ })).toBeNull();
  await user.tab();
  await user.tab({ shift: true });
  await user.click(await screen.findByRole('button', { name: /Explicit UI fixture/ }));
  expect(select).toHaveBeenCalledWith(mint);
  expect(screen.queryByRole('button', { name: /Explicit UI fixture/ })).toBeNull();
  expect(result).not.toBeInTheDocument();
});
