// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TerminalCompetition } from './TerminalCompetition.js';
const { state } = vi.hoisted(() => ({ state: { boardRound: 'round-a', boardError: false } }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === 'round'
      ? {
          data: {
            round: { id: 'round-a', endsAtExclusive: '2026-11-04T03:00:00Z' },
            serverTime: '2026-11-04T02:00:00Z',
          },
          dataUpdatedAt: Date.now(),
        }
      : queryKey[0] === 'me'
        ? { data: { user: { id: 'user-a' } } }
        : {
            error: state.boardError,
            data: {
              status: 'AVAILABLE',
              round: { id: state.boardRound },
              entries: [{ user_id: 'user-a', rank: 3 }],
            },
          },
}));
afterEach(() => {
  cleanup();
  state.boardRound = 'round-a';
  state.boardError = false;
});
it('shows only the matching authoritative competition rank and keeps Practice ineligible', () => {
  render(
    <MemoryRouter>
      <TerminalCompetition />
    </MemoryRouter>,
  );
  expect(screen.getByText('3')).toBeInTheDocument();
  expect(screen.getByText(/This ticket has no reward eligibility/)).toBeInTheDocument();
});
it.each(['stale-round', 'provider-error'])(
  'does not misrepresent %s as a personal rank',
  (reason) => {
    if (reason === 'stale-round') state.boardRound = 'previous-round';
    else state.boardError = true;
    render(
      <MemoryRouter>
        <TerminalCompetition />
      </MemoryRouter>,
    );
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('3')).toBeNull();
  },
);
