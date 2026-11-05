import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError, errorMessage } from './api.js';
import { formatSol, shorten } from './format.js';
import type { User } from './types.js';
import {
  isolatedCompetitionTest,
  liveCompetitionTest,
  productionCompetition,
  competitionRewardUnit,
} from './competition-mode.js';

const amount = (v: string | null | undefined, unit = 'SOL') =>
  v != null && /^-?\d+$/.test(v) ? formatSol(v, 9).replace(/\sSOL$/, ' ' + unit) : 'Unavailable';
export function utcCountdown(
  end: string | undefined,
  serverTime: string | undefined,
  receivedAt: number,
  now: number,
) {
  if (
    !end ||
    !serverTime ||
    !Number.isFinite(Date.parse(end)) ||
    !Number.isFinite(Date.parse(serverTime))
  )
    return 'Unavailable';
  const left = Math.max(
    0,
    Math.floor((Date.parse(end) - (now + Date.parse(serverTime) - receivedAt)) / 1000),
  );
  if (!left) return 'Awaiting server transition';
  return [Math.floor(left / 3600), Math.floor((left % 3600) / 60), left % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}
export function CompetitionSummary({
  kind,
  user,
}: {
  kind: 'hourly' | 'daily';
  user: User | null;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const current = useQuery({
    queryKey: ['round'],
    queryFn: api.currentRound,
    refetchInterval: 4000,
    retry: false,
  });
  const day = useQuery({
    queryKey: ['competition-day'],
    queryFn: api.currentDay,
    enabled: kind === 'daily',
    refetchInterval: 8000,
    retry: false,
  });
  const live = useQuery({
    queryKey: ['hourly-live', undefined],
    queryFn: () => api.liveHourly(),
    enabled: kind === 'hourly',
    refetchInterval: 4000,
    retry: false,
  });
  const daily = useQuery({
    queryKey: ['daily'],
    queryFn: () => api.daily(),
    enabled: kind === 'daily',
    refetchInterval: 8000,
    retry: false,
  });
  const round = !current.error ? current.data?.round : null;
  const currentDay =
    (!day.error ? day.data?.competition : null) ??
    (!daily.error ? daily.data?.dailyCompetition : null);
  const period =
    kind === 'hourly'
      ? round && {
          id: round.id,
          starts_at: round.startsAt,
          ends_at_exclusive: round.endsAtExclusive,
          state: round.state,
        }
      : currentDay && {
          id: currentDay.id,
          starts_at: currentDay.startsAt,
          ends_at_exclusive: currentDay.endsAtExclusive,
          state: currentDay.state,
        };
  const id = period?.id;
  const pool = useQuery({
    queryKey: ['competition-pool', kind, id],
    enabled: !!id,
    queryFn: () => api.competitionPool(kind, id!),
    refetchInterval: 15000,
    retry: false,
  });
  const account = useQuery({
    queryKey: ['account', user?.id],
    enabled: !!user,
    queryFn: async () => {
      try {
        return await api.account();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'ROUND_ACCOUNT_NOT_FOUND') return null;
        throw e;
      }
    },
    refetchInterval: 4000,
    retry: false,
  });
  const liveBoard =
    !live.error &&
    !!live.data &&
    !!id &&
    live.data.round.id === id &&
    live.data.status === 'AVAILABLE' &&
    live.data.phase !== 'SETTLING'
      ? live.data
      : null;
  const dailyBoard = !daily.error && daily.data?.dailyCompetition.id === id ? daily.data : null;
  const entries = kind === 'hourly' ? liveBoard?.entries : dailyBoard?.entries;
  const me = user ? entries?.find((e) => e.user_id === user.id) : null;
  const mine = !account.error && account.data?.roundId === round?.id ? account.data : null;
  const funding =
    !pool.error &&
    pool.data &&
    (kind === 'hourly' ? pool.data.hourlyRoundId === id : pool.data.dailyCompetitionId === id)
      ? pool.data
      : null;
  const useDailyClock = kind === 'daily' && !day.error && !!day.data?.serverTime;
  const serverTime = useDailyClock
    ? day.data?.serverTime
    : !current.error
      ? current.data?.serverTime
      : undefined;
  const receivedAt = useDailyClock ? day.dataUpdatedAt : current.dataUpdatedAt;
  const problem = kind === 'hourly' ? current.error : currentDay ? null : day.error;
  return (
    <section className="panel pf-competition-summary" aria-label={kind + ' competition overview'}>
      <div className="pf-competition-heading">
        <strong>{kind === 'hourly' ? 'Hourly competition' : 'UTC Daily Championship'}</strong>
        <span className="badge">{period?.state ?? 'UNAVAILABLE'}</span>
      </div>
      {productionCompetition && (
        <p role="note">
          PRODUCTION COMPETITION · Reward eligibility, funding and payment verification remain
          server-authoritative.
        </p>
      )}
      {isolatedCompetitionTest && (
        <p role="note">
          ACTIVE ISOLATED TEST · NO REAL REWARDS.{' '}
          {liveCompetitionTest
            ? 'Genuine live market reads · normal UTC time. Cutoff qualification and settlement holds remain enforced.'
            : 'Market pricing uses recorded test fixtures.'}{' '}
          Allocations have no cash value; transaction signing, transfers and payout execution are
          disabled.
        </p>
      )}
      <p role="note">
        Competition accounts only. Separate Practice trades are not ranked and have no reward
        eligibility. <Link to="/trade">Open competition ticket ↗</Link>
      </p>
      {problem && <p role="alert">Competition backend unavailable: {errorMessage(problem)}</p>}
      {!problem && !period && <p>No active {kind} period supplied by the authoritative backend.</p>}
      <div className="pf-competition-metrics">
        <div>
          <small>UTC cutoff</small>
          <b>{period ? new Date(period.ends_at_exclusive).toUTCString() : 'Unavailable'}</b>
          <span aria-label={kind + ' countdown'}>
            {period
              ? utcCountdown(period.ends_at_exclusive, serverTime, receivedAt, now)
              : 'Unavailable'}
          </span>
        </div>
        <div>
          <small>{kind === 'hourly' ? 'Ranked participants' : 'Scored participants'}</small>
          <b>{entries ? entries.length : 'Unavailable'}</b>
          <span>
            {kind === 'daily'
              ? 'Finalized hourly contributions only'
              : 'Complete authoritative field; ties preserved'}
          </span>
        </div>
        <div>
          <small>
            {funding?.status === 'PROVISIONAL' ? 'Provisional allocation' : 'Recorded prize pool'} ·
            {isolatedCompetitionTest ? 'TEST units · no cash value' : 'real SOL'}
          </small>
          <b>
            {amount(
              kind === 'hourly'
                ? (funding?.finalHourlyPrizeLamports ?? funding?.provisionalNaturalHourlyLamports)
                : funding?.accumulatedLamports,
              isolatedCompetitionTest ? 'TEST units' : competitionRewardUnit,
            )}
          </b>
          <span>{funding?.status ?? 'Funding unavailable'} · allocation is not payment</span>
        </div>
        <div>
          <small>Your {kind === 'hourly' ? 'provisional' : 'cumulative'} P&amp;L · Paper SOL</small>
          <b>
            {user
              ? entries
                ? me
                  ? amount(me.score, 'Paper SOL')
                  : 'Not ranked'
                : 'Unavailable'
              : 'Sign in to competition'}
          </b>
          <span>
            {me
              ? `Rank #${me.rank}${me.tied ? ` · tie ×${me.tieGroupSize}` : ''}`
              : 'No rank is inferred from Practice balances'}
          </span>
        </div>
      </div>
      {kind === 'hourly' && (
        <div className="pf-competition-limits" aria-label="Authoritative competition limits">
          <span>
            Starting balance: <b>{amount(round?.startingPaperSolLamports, 'Paper SOL')}</b>
          </span>
          <span>
            Per BUY cap:{' '}
            <b>{round ? round.maxBuyRatioBps / 100 + '% of executable equity' : 'Unavailable'}</b>
          </span>
          <span>
            Token slots:{' '}
            <b>{round ? `${mine?.slotsUsed ?? '—'} / ${round.maxUniqueTokens}` : 'Unavailable'}</b>
          </span>
          <span>
            Competition cash: <b>{amount(mine?.paperSolLamports, 'Paper SOL')}</b>
          </span>
        </div>
      )}
      <RecordedDistribution kind={kind} id={id} />
      <small>
        Countdowns are display-only. The backend owns UTC admission, cutoff, settlement and final
        ranks.{' '}
        {kind === 'daily' &&
          'Daily scores include every finalized positive, negative and zero hourly result; no live-hour estimate is added.'}
      </small>
    </section>
  );
}

export function RecordedDistribution({
  kind,
  id,
}: {
  kind: 'hourly' | 'daily';
  id: string | undefined;
}) {
  const winners = useQuery({
    queryKey: ['competition-winners', kind, id],
    enabled: !!id,
    queryFn: () => api.competitionWinners(kind, id!),
    refetchInterval: 15000,
    retry: false,
  });
  const plan =
    !winners.error &&
    winners.data &&
    (kind === 'hourly' ? winners.data.hourlyRoundId === id : winners.data.dailyCompetitionId === id)
      ? winners.data
      : null;
  return (
    <div className="pf-recorded-distribution">
      <details>
        <summary>Recorded reward distribution · {plan?.state ?? 'unavailable'}</summary>
        <p>
          Only backend allocations are shown. Qualification, funding, payout holds and final
          on-chain verification remain separate. <Link to="/rewards">Inspect reward status ↗</Link>
        </p>
        {winners.error && (
          <p role="alert">Distribution unavailable: {errorMessage(winners.error)}</p>
        )}
        {plan ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Wallet</th>
                  <th>{isolatedCompetitionTest ? 'Allocated TEST units' : 'Allocated SOL'}</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {plan.allocations.map((a, i) => (
                  <tr key={a.walletAddress + ':' + i}>
                    <td>
                      {a.competitiveRank}
                      {a.tied ? ` (tie ×${a.tieGroupSize})` : ''}
                    </td>
                    <td title={a.walletAddress}>{shorten(a.walletAddress, 7)}</td>
                    <td>{amount(a.allocatedLamports, competitionRewardUnit)}</td>
                    <td>
                      {isolatedCompetitionTest
                        ? 'TEST allocation · unpaid'
                        : plan.state === 'VERIFIED'
                          ? 'Verified payment'
                          : 'Allocation · ' + plan.state}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>
            No matching allocation plan is available for this period. No prize amounts are
            estimated.
          </p>
        )}
      </details>
    </div>
  );
}
