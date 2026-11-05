import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { pulseApiPath } from './pulse-model.js';
import { validMint } from './market-discovery.js';
import type { PriceCandle, ChartInterval } from './market-ohlcv.js';
export interface MarketSwap {
  id: string;
  mint: string;
  pool: string;
  time: number;
  slot: number;
  sourceOrder: number;
  signature: string;
  wallet: string;
  side: 'BUY' | 'SELL';
  priceUsd: number;
  quantity: number;
  volumeUsd: number;
  receivedAt?: number;
  fxObservedAt?: number;
}
export interface SwapFeed {
  mint: string;
  pool: string;
  trades: MarketSwap[];
  gaps: { from: number; to: number }[];
  checkedAt: number;
  status: string;
  lastError: string | null;
  source: string;
  delivery?: string;
  streamState?: string;
  cutover?: number | null;
  emittedAt?: number;
  historyError?: string | null;
}
export const intervalSeconds: Record<ChartInterval, number> = {
  '1s': 1,
  '3s': 3,
  '5s': 5,
  '15s': 15,
  '30s': 30,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};
export const terminalPath = (kind: 'trades' | 'holders' | 'events') =>
  pulseApiPath('snapshot').replace(/snapshot$/, 'terminal/' + kind);
export function decodeSwapFeed(body: unknown, mint: string, pool: string): SwapFeed {
  const b = body as Partial<SwapFeed>;
  if (b.mint !== mint || b.pool !== pool || !Array.isArray(b.trades) || b.trades.length > 6000)
    throw Error('Market trade identity mismatch');
  const trades = [
    ...new Map(
      b.trades
        .filter(
          (t) =>
            t.mint === mint &&
            t.pool === pool &&
            typeof t.id === 'string' &&
            t.id.length <= 240 &&
            validMint(t.wallet) &&
            Number.isSafeInteger(t.time) &&
            t.time > 0 &&
            t.time < Date.now() + 5000 &&
            Number.isSafeInteger(t.slot) &&
            Number.isFinite(t.sourceOrder) &&
            [t.priceUsd, t.quantity, t.volumeUsd].every((n) => Number.isFinite(n) && n > 0) &&
            ['BUY', 'SELL'].includes(t.side) &&
            typeof t.signature === 'string' &&
            /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(t.signature),
        )
        .map((t) => [t.id, t]),
    ).values(),
  ].sort(
    (a, b) =>
      a.time - b.time ||
      a.slot - b.slot ||
      a.sourceOrder - b.sourceOrder ||
      a.id.localeCompare(b.id),
  );
  return {
    mint,
    pool,
    trades,
    gaps: Array.isArray(b.gaps)
      ? b.gaps
          .filter((g) => Number.isFinite(g.from) && Number.isFinite(g.to) && g.to >= g.from)
          .slice(-50)
      : [],
    checkedAt: typeof b.checkedAt === 'number' ? b.checkedAt : 0,
    status: b.status === 'available' ? 'available' : 'unavailable',
    lastError: typeof b.lastError === 'string' ? b.lastError.slice(0, 160) : null,
    delivery: b.delivery === 'helius-confirmed' ? 'helius-confirmed' : 'rest-delayed',
    streamState: typeof b.streamState === 'string' ? b.streamState.slice(0, 60) : 'not-configured',
    cutover: typeof b.cutover === 'number' ? b.cutover : null,
    emittedAt: typeof b.emittedAt === 'number' ? b.emittedAt : 0,
    historyError: typeof b.historyError === 'string' ? b.historyError.slice(0, 160) : null,
    source:
      b.delivery === 'helius-confirmed'
        ? 'Helius confirmed swaps × sourced SOL/USD'
        : 'GeckoTerminal timestamped swaps',
  };
}
const streamClients = new WeakMap<
  QueryClient,
  Map<string, { refs: number; source: EventSource; dispose: () => void; healthy: () => boolean }>
>();
export function applySwapDelta(
  previous: SwapFeed | undefined,
  body: unknown,
  mint: string,
  pool: string,
): SwapFeed {
  if (!body || typeof body !== 'object') throw Error('Invalid swap stream payload');
  const b = body as SwapFeed & { full?: boolean };
  if (!Array.isArray(b.trades) || b.trades.length > 6000)
    throw Error('Invalid swap stream payload');
  const decoded = decodeSwapFeed(b, mint, pool);
  if (previous?.emittedAt && decoded.emittedAt && decoded.emittedAt < previous.emittedAt) return previous;
  const base = b.full || previous?.delivery !== decoded.delivery ? [] : (previous?.trades ?? []);
  const merged = [...new Map([...base, ...decoded.trades].map((t) => [t.id, t])).values()]
    .sort(
      (a, b) =>
        a.time - b.time ||
        a.slot - b.slot ||
        a.sourceOrder - b.sourceOrder ||
        a.id.localeCompare(b.id),
    )
    .slice(-6000);
  return { ...decoded, trades: merged };
}
export function useMarketTrades(mint: string, pool: string) {
  const client = useQueryClient();
  useEffect(() => {
    if (!validMint(mint) || !validMint(pool) || typeof EventSource === 'undefined') return;
    let clients = streamClients.get(client);
    if (!clients) {
      clients = new Map();
      streamClients.set(client, clients);
    }
    const key = mint + ':' + pool,
      queryKey = ['terminal-swaps', mint, pool];
    let entry = clients.get(key);
    if (!entry) {
      const url = terminalPath('events') + '?' + new URLSearchParams({ mint, pool });
      let source = new EventSource(url);
      let lastMessageAt = Date.now(),
        interrupted = false,
        disposed = false,
        attempts = 0,
        retry: number | undefined;
      const markInterrupted = (message: string) => {
        if (interrupted) return;
        interrupted = true;
        client.setQueryData<SwapFeed>(queryKey, (old) =>
          old ? { ...old, streamState: 'reconnecting', lastError: message } : old,
        );
        void client.invalidateQueries({ queryKey });
      };
      const attach = (target: EventSource) => {
        target.onmessage = (e) => {
          if (disposed || target !== source) return;
          try {
            const body: unknown = JSON.parse(e.data);
            client.setQueryData<SwapFeed>(queryKey, (old) => applySwapDelta(old, body, mint, pool));
            lastMessageAt = Date.now();
            interrupted = false;
            attempts = 0;
          } catch {
            /* Retain the last validated snapshot. */
          }
        };
        target.onerror = () => {
          if (disposed || target !== source) return;
          markInterrupted('Browser stream disconnected; reconnecting with delayed REST fallback.');
          // Native EventSource retries CONNECTING; CLOSED responses need a bounded replacement.
          if (target.readyState === 2 && retry === undefined && navigator.onLine !== false) {
            retry = window.setTimeout(restart, Math.min(30000, 2000 * 2 ** attempts++));
          }
        };
        target.addEventListener('unavailable', () => {
          if (!disposed && target === source)
            markInterrupted('Server stream unavailable; retained observations are not live.');
        });
      };
      const restart = () => {
        window.clearTimeout(retry);
        retry = undefined;
        if (disposed || navigator.onLine === false) return;
        source.close();
        source = new EventSource(url);
        lastMessageAt = Date.now();
        if (entry) entry.source = source;
        attach(source);
      };
      const offline = () => {
        window.clearTimeout(retry);
        retry = undefined;
        source.close();
        markInterrupted('Browser is offline; retained observations are not live.');
      };
      const online = () => {
        restart();
        void client.invalidateQueries({ queryKey });
      };
      const watchdog = window.setInterval(() => {
        if (Date.now() - lastMessageAt > 15000) {
          markInterrupted(
            'Stream heartbeat is stale; retained observations are not live. Reconnecting with delayed REST fallback.',
          );
          if (retry === undefined) restart();
        }
      }, 3000);
      window.addEventListener('offline', offline);
      window.addEventListener('online', online);
      entry = {
        refs: 0,
        source,
        healthy: () => !interrupted && Date.now() - lastMessageAt <= 15000,
        dispose: () => {
          disposed = true;
          window.clearTimeout(retry);
          window.clearInterval(watchdog);
          window.removeEventListener('offline', offline);
          window.removeEventListener('online', online);
        },
      };
      clients.set(key, entry);
      attach(source);
    }
    entry.refs++;
    return () => {
      if (--entry.refs === 0) {
        entry.source.close();
        entry.dispose();
        clients.delete(key);
      }
    };
  }, [client, mint, pool]);
  return useQuery({
    queryKey: ['terminal-swaps', mint, pool],
    enabled: !!validMint(mint) && !!validMint(pool),
    queryFn: async () => {
      const queryKey = ['terminal-swaps', mint, pool];
      const requestedVersion = client.getQueryState(queryKey)?.dataUpdateCount ?? 0;
      const r = await fetch(terminalPath('trades') + '?' + new URLSearchParams({ mint, pool }), {
        credentials: 'omit',
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw Error('Trade feed HTTP ' + r.status);
      const data = decodeSwapFeed(await r.json(), mint, pool);
      const latest = client.getQueryData<SwapFeed>(queryKey);
      // A REST read started before an SSE update must not roll that update back.
      if (latest && (client.getQueryState(queryKey)?.dataUpdateCount ?? 0) > requestedVersion) return latest;
      const stream = streamClients.get(client)?.get(mint + ':' + pool);
      return data.delivery === 'helius-confirmed' && stream && !stream.healthy()
        ? {
            ...data,
            streamState: 'reconnecting',
            lastError: 'Browser stream is disconnected or stale; using delayed HTTP snapshots.',
          }
        : data;
    },
    refetchInterval: (query) =>
      query.state.data?.delivery === 'helius-confirmed' && query.state.data?.streamState === 'live'
        ? false
        : 12000,
    staleTime: 10000,
    gcTime: 180000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
export function swapCandles(feed: SwapFeed | undefined, interval: ChartInterval): PriceCandle[] {
  const seconds = intervalSeconds[interval],
    bars = new Map<number, PriceCandle>();
  if (!feed) return [];
  for (const t of feed.trades) {
    const time = Math.floor(t.time / 1000 / seconds) * seconds;
    if (feed.gaps.some((g) => g.from < (time + seconds) * 1000 && g.to >= time * 1000)) continue;
    const c = bars.get(time);
    if (c) {
      c.high = Math.max(c.high, t.priceUsd);
      c.low = Math.min(c.low, t.priceUsd);
      c.close = t.priceUsd;
      c.volume += t.volumeUsd;
    } else
      bars.set(time, {
        time,
        open: t.priceUsd,
        high: t.priceUsd,
        low: t.priceUsd,
        close: t.priceUsd,
        volume: t.volumeUsd,
      });
  }
  // The oldest retained bucket may be truncated by the provider's last-300 limit or our ring buffer.
  const result = [...bars.values()].sort((a, b) => a.time - b.time);
  return result.slice(1);
}
export function observedTraders(trades: MarketSwap[], since: number) {
  const rows = new Map<
    string,
    { wallet: string; buysUsd: number; sellsUsd: number; netTokens: number; count: number }
  >();
  for (const t of trades.filter((t) => t.time >= since)) {
    const row = rows.get(t.wallet) ?? {
      wallet: t.wallet,
      buysUsd: 0,
      sellsUsd: 0,
      netTokens: 0,
      count: 0,
    };
    if (t.side === 'BUY') {
      row.buysUsd += t.volumeUsd;
      row.netTokens += t.quantity;
    } else {
      row.sellsUsd += t.volumeUsd;
      row.netTokens -= t.quantity;
    }
    row.count++;
    rows.set(t.wallet, row);
  }
  return [...rows.values()]
    .sort((a, b) => b.buysUsd + b.sellsUsd - a.buysUsd - a.sellsUsd)
    .slice(0, 50);
}
