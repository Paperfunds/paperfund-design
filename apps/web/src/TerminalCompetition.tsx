import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { utcCountdown } from './CompetitionSummary.js';
import { isolatedCompetitionTest, productionCompetition } from './competition-mode.js';
export function TerminalCompetition() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const round = useQuery({
    queryKey: ['round'],
    queryFn: api.currentRound,
    refetchInterval: 10000,
    retry: false,
  });
  const user = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false });
  const board = useQuery({
    queryKey: ['hourly-live', undefined],
    queryFn: () => api.liveHourly(),
    refetchInterval: 10000,
    retry: false,
  });
  const current = round.data?.round,
    available =
      !board.error &&
      board.data &&
      board.data.round.id === current?.id &&
      board.data.status === 'AVAILABLE'
        ? board.data
        : null,
    me = available?.entries.find((e) => e.user_id === user.data?.user.id);
  return (
    <section className="pf-terminal-competition">
      <header>
        <h3>Hourly competition</h3>
        <Link to="/hourly">Open ↗</Link>
      </header>
      <small>
        {isolatedCompetitionTest
          ? 'TEST · NO REAL REWARDS'
          : productionCompetition
            ? 'Production competition'
            : 'Competition disconnected'}
      </small>
      <dl>
        <div>
          <dt>UTC cutoff</dt>
          <dd>
            {current
              ? utcCountdown(
                  current.endsAtExclusive,
                  round.data?.serverTime,
                  round.dataUpdatedAt,
                  now,
                )
              : 'Unavailable'}
          </dd>
        </div>
        <div>
          <dt>Your rank</dt>
          <dd>
            {!available
              ? 'Unavailable'
              : !user.data || user.error
                ? 'Competition sign-in required'
                : (me?.rank ?? 'Not ranked')}
          </dd>
        </div>
      </dl>
      <p>Practice balance and fills are separate. This ticket has no reward eligibility.</p>
    </section>
  );
}
