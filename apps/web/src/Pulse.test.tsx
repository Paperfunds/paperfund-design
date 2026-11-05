// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import './test/setup.js';
import { PulsePage } from './Pulse.js';
import { stageTokens, decodePulseSnapshot } from './pulse-model.js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mint = 'BJVWrJnwMkZ5upJcQqeQ4eShsfuvcEgzxnr6jprBpump';
function Target() {
  const [query] = useSearchParams();
  return <div>Trading mint: {query.get('mint')}</div>;
}
describe('Pulse discovery to trading', () => {
  it('reveals rows beyond 100 and independently searches a column without hiding migrated tokens', async () => {
    localStorage.clear();
    const now = Date.now(),
      alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const tokens = Array.from({ length: 105 }, (_, i) => ({
      mint: '1'.repeat(30) + alphabet[Math.floor(i / 58)] + alphabet[i % 58],
      name: 'Recorded UI fixture ' + i,
      symbol: 'TEST' + i,
      source: 'pumpportal',
      stage: 'new',
      verifiedAt: now,
      firstSeenAt: now - i - 1,
      lastSeenAt: now - i,
      creatorAddress: mint,
      curveVariant: 'MAYHEM',
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              String(url).includes('/snapshot')
                ? {
                    status: 'live',
                    receivedAt: now,
                    tokens: [
                      ...tokens,
                      {
                        ...tokens[0],
                        mint,
                        symbol: 'MIGRATED',
                        migrationVerifiedAt: now,
                        volume24hUsd: 50000,
                        marketObservedAt: now,
                        stage: 'migrated',
                      },
                    ],
                  }
                : {},
            ),
          ),
      ),
    );
    vi.stubGlobal(
      'EventSource',
      class {
        addEventListener() {}
        close() {}
      },
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <PulsePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const launches = screen.getByRole('region', { name: 'New Pairs' }),
      migrated = screen.getByRole('region', { name: 'Migrated' });
    await waitFor(() => expect(launches.querySelectorAll('.pf-pulse-token')).toHaveLength(100));
    expect(within(launches).getByText('105')).toBeVisible();
    await userEvent.click(within(launches).getByRole('button', { name: /Show 50 more/ }));
    expect(launches.querySelectorAll('.pf-pulse-token')).toHaveLength(105);
    expect(within(launches).getAllByText('MAYHEM')).toHaveLength(105);
    expect(within(launches).getAllByText('Activity not indexed')).toHaveLength(105);
    await userEvent.click(screen.getByLabelText('Filters for New Pairs'));
    await userEvent.type(screen.getByLabelText('New Pairs search'), 'TEST104');
    expect(launches.querySelectorAll('.pf-pulse-token')).toHaveLength(1);
    expect(within(launches).getByText('TEST104')).toBeVisible();
    expect(within(migrated).getByText('MIGRATED')).toBeVisible();
    expect(within(launches).getByRole('link', { name: /Dev/ })).toHaveAttribute(
      'href',
      'https://solscan.io/account/' + mint,
    );
    localStorage.clear();
  });
  it('explains hidden observations and moves verified rows automatically on SSE without a reload', async () => {
    const now = Date.now();
    const pending = {
      status: 'live',
      receivedAt: now,
      lastEventAt: now,
      tokens: [],
      rpcHealth: 'unavailable',
      diagnostics: {
        tracked: 2,
        pending: 1,
        rejected: 1,
        verified: 0,
        displayed: 0,
        migrationPending: 0,
        progressUnavailable: 0,
        reasons: { ACCOUNT_IDENTITY: 1 },
        lastRpcError: {
          code: 'RPC_HTTP_403',
          detail: 'A maximum of 10 accounts is allowed.',
          at: now,
        },
      },
    };
    let resolveInitial!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveInitial = resolve;
          }),
      ),
    );
    class Source {
      static current: Source;
      onopen: (() => void) | null = null;
      onerror = null;
      listener!: (event: MessageEvent<string>) => void;
      constructor() {
        Source.current = this;
      }
      addEventListener(_name: string, listener: (event: MessageEvent<string>) => void) {
        this.listener = listener;
      }
      close() {}
      snapshot(value: unknown) {
        this.listener(new MessageEvent('snapshot', { data: JSON.stringify(value) }));
      }
    }
    vi.stubGlobal('EventSource', Source);
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <PulsePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const source = Source.current;
    act(() => {
      source.onopen?.();
      source.snapshot(pending);
    });
    expect(screen.getByLabelText('Pulse pipeline status')).toHaveTextContent(
      'Verification pending 1',
    );
    expect(screen.getByLabelText('Pulse pipeline status')).toHaveTextContent(
      'maximum of 10 accounts',
    );
    expect(screen.getByText(/real provider observations await chain verification/)).toBeVisible();
    const token = {
      mint,
      name: 'SSE fixture',
      symbol: 'STREAM',
      stage: 'new',
      source: 'pumpportal',
      firstSeenAt: now,
      lastSeenAt: now,
      verifiedAt: now,
      curveProgressPct: 0,
    };
    const update = (extra: object, offset: number) => ({
      ...pending,
      receivedAt: now + offset,
      rpcHealth: 'available',
      diagnostics: { ...pending.diagnostics, pending: 0, verified: 1, displayed: 1 },
      tokens: [{ ...token, ...extra }],
    });
    act(() => source.snapshot(update({}, 1)));
    expect(
      within(screen.getByRole('region', { name: 'New Pairs' })).getByText('STREAM'),
    ).toBeVisible();
    // A slow initial GET must not erase a newer SSE snapshot.
    await act(async () => resolveInitial(new Response(JSON.stringify(pending))));
    expect(screen.getByText('STREAM')).toBeVisible();
    act(() =>
      source.snapshot(
        update(
          {
            progressVerifiedAt: now,
            curveProgressPct: 95,
            marketCapUsd: 7000.01,
            marketCapUsdAt: now,
            createdAt: now - 1000,
            creationVerifiedAt: now,
          },
          2,
        ),
      ),
    );
    expect(
      within(screen.getByRole('region', { name: 'Pre-Migration' })).getByText('STREAM'),
    ).toBeVisible();
    expect(
      within(screen.getByRole('region', { name: 'New Pairs' })).queryByText('STREAM'),
    ).toBeNull();
    act(() =>
      source.snapshot(
        update({ migrationVerifiedAt: now + 3, volume24hUsd: 50000, marketObservedAt: now }, 3),
      ),
    );
    const migrated = screen.getByRole('region', { name: 'Migrated' });
    expect(within(migrated).getByText('STREAM')).toBeVisible();
    expect(within(migrated).getByText('✓ Migration verified')).toBeVisible();
    act(() =>
      source.snapshot(
        update({ migrationVerifiedAt: now + 3, volume24hUsd: 49999.99, marketObservedAt: now }, 4),
      ),
    );
    expect(screen.queryByText('STREAM')).toBeNull();
    act(() =>
      source.snapshot(
        update({ migrationVerifiedAt: now + 3, volume24hUsd: 50000, marketObservedAt: now }, 5),
      ),
    );
    expect(within(migrated).getByText('STREAM')).toBeVisible();
    await userEvent.click(within(migrated).getByRole('button', { name: 'Watch STREAM' }));
    await userEvent.click(screen.getByRole('button', { name: /Watchlist/ }));
    expect(within(migrated).getByText('STREAM')).toBeVisible();
    await userEvent.type(screen.getByRole('searchbox'), 'unmatched');
    expect(screen.queryByText('STREAM')).toBeNull();
    expect(screen.getAllByText('No tokens match these filters.')).toHaveLength(3);
    expect(screen.getByLabelText('Pulse pipeline status')).toHaveTextContent('Displayed 0');
  });
  it('opens a pasted mint outside the feed without inventing a discovery row', async () => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    );
    vi.stubGlobal(
      'EventSource',
      class {
        addEventListener() {}
        close() {}
      },
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/pulse']}>
          <Routes>
            <Route path="/pulse" element={<PulsePage />} />
            <Route path="/practice" element={<Target />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const search = screen.getByRole('searchbox');
    await userEvent.type(search, 'not-a-mint');
    expect(screen.queryByRole('link', { name: 'Open token' })).toBeNull();
    await userEvent.clear(search);
    await userEvent.type(search, mint);
    expect(document.querySelectorAll('.pf-pulse-token')).toHaveLength(0);
    await userEvent.click(screen.getByRole('link', { name: 'Open token' }));
    expect(screen.getByText('Trading mint: ' + mint)).toBeVisible();
    localStorage.clear();
  });
  it('renders genuine-source metadata as text and deep-links the exact mint', async () => {
    const now = Date.now();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              status: 'live',
              receivedAt: now,
              lastEventAt: now,
              provider: 'PumpPortal',
              rpcHealth: 'available',
              tokens: [
                {
                  mint,
                  name: '<b>Token</b>',
                  symbol: 'COIN',
                  source: 'pumpportal',
                  stage: 'stretch',
                  verifiedAt: now,
                  progressVerifiedAt: now,
                  curveProgressPct: 95,
                  firstSeenAt: now,
                  lastSeenAt: now,
                  marketCapSol: 500,
                  marketCapUsd: 8000,
                  marketCapUsdAt: now,
                  createdAt: now - 1000,
                  creationVerifiedAt: now,
                },
              ],
            }),
          ),
      ),
    );
    class Source {
      addEventListener() {}
      close() {}
      onopen = null;
      onerror = null;
    }
    vi.stubGlobal('EventSource', Source);
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/pulse']}>
          <Routes>
            <Route path="/pulse" element={<PulsePage />} />
            <Route path="/practice" element={<Target />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const stretch = screen.getByRole('region', { name: 'Pre-Migration' });
    await waitFor(() => expect(within(stretch).getByText('COIN')).toBeVisible());
    expect(within(stretch).getByText('<b>Token</b>')).toBeVisible();
    expect(within(stretch).getByText('95.0%')).toBeVisible();
    await userEvent.click(within(stretch).getByRole('link', { name: /Inspect & paper trade/ }));
    expect(screen.getByText('Trading mint: ' + mint)).toBeVisible();
  });
  it('removes expired USD cap from Pre-Migration even when browser SSE is disconnected', () => {
    const t = 100000;
    const s = decodePulseSnapshot({
      status: 'disconnected',
      receivedAt: t,
      tokens: [
        {
          mint,
          name: 'Coin',
          symbol: 'C',
          source: 'pumpportal',
          stage: 'stretch',
          verifiedAt: t,
          progressVerifiedAt: t,
          createdAt: t,
          creationVerifiedAt: t,
          marketCapUsd: 8000,
          marketCapUsdAt: t,
          curveProgressPct: 95,
          firstSeenAt: t,
          lastSeenAt: t,
        },
      ],
    });
    expect(stageTokens(s, 'stretch', '', t + 1000)).toHaveLength(1);
    expect(stageTokens(s, 'stretch', '', t + 120001)).toHaveLength(0);
  });
});
