import { useEffect, useState } from 'react';
import {
  decodePulseSnapshot,
  hydratePulsePages,
  pulseApiPath,
  type PulseSnapshot,
} from './pulse-model.js';

// A screen subscribes once; every row receives the same snapshot. EventSource reconnects
// without page reloads. The existing feed still owns the single provider WebSocket.
export function usePulseFeed() {
  const [snapshot, setSnapshot] = useState<PulseSnapshot | null>(null);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const [online, setOnline] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    let disposed = false;
    let lastReceivedAt = 0,
      lastAcceptedAt = 0;
    let publishedAt = 0,
      hydrating = false,
      pending: PulseSnapshot | null = null;
    let serverClock = { server: Date.now(), local: Date.now() };
    const publish = (decoded: PulseSnapshot) => {
      if (disposed || decoded.receivedAt < publishedAt) return;
      publishedAt = decoded.receivedAt;
      lastReceivedAt = Math.max(lastReceivedAt, decoded.receivedAt);
      lastAcceptedAt = Date.now();
      serverClock = { server: decoded.receivedAt, local: lastAcceptedAt };
      setNow(decoded.receivedAt);
      setPaginationError(null);
      setSnapshot(decoded);
    };
    const hydrate = async (decoded: PulseSnapshot) => {
      hydrating = true;
      try {
        publish(
          await hydratePulsePages(decoded, async (cursor) => {
            const response = await fetch(
              pulseApiPath('snapshot') + '?after=' + encodeURIComponent(cursor),
              { credentials: 'omit', signal: AbortSignal.timeout(7000) },
            );
            if (!response.ok) throw Error('PULSE_PAGINATION_HTTP_' + response.status);
            return response.json();
          }),
        );
      } catch {
        if (!disposed)
          setPaginationError('Discovery pagination delayed; retaining the last complete snapshot.');
      } finally {
        hydrating = false;
        const next = pending;
        pending = null;
        if (next && !disposed) void hydrate(next);
      }
    };
    const accept = (value: unknown) => {
      const decoded = decodePulseSnapshot(value);
      if (!disposed && decoded && decoded.receivedAt >= lastReceivedAt) {
        lastReceivedAt = decoded.receivedAt;
        if (decoded.nextCursor) {
          if (hydrating) pending = decoded;
          else void hydrate(decoded);
        } else publish(decoded);
      }
    };
    void fetch(pulseApiPath('snapshot'), {
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    })
      .then(async (r) => {
        if (r.ok) accept(await r.json());
      })
      .catch(() => {});
    const timer = window.setInterval(
      () => setNow(serverClock.server + Math.max(0, Date.now() - serverClock.local)),
      1000,
    );
    if (typeof EventSource === 'undefined') {
      const polling = window.setInterval(() => {
        void fetch(pulseApiPath('snapshot'), { credentials: 'omit' })
          .then(async (r) => {
            if (r.ok) accept(await r.json());
          })
          .catch(() => {});
      }, 15000);
      return () => {
        disposed = true;
        window.clearInterval(timer);
        window.clearInterval(polling);
      };
    }
    const source = new EventSource(pulseApiPath('events'), { withCredentials: false });
    // EventSource can remain open while a proxy stops forwarding. Reconcile with a
    // bounded snapshot read after 30s of silence; never require a page refresh.
    const reconcile = window.setInterval(() => {
      if (Date.now() - lastAcceptedAt < 30000) return;
      void fetch(pulseApiPath('snapshot'), { credentials: 'omit' })
        .then(async (r) => {
          if (r.ok) accept(await r.json());
        })
        .catch(() => {});
    }, 15000);
    source.addEventListener('snapshot', (event: Event) => {
      try {
        accept(JSON.parse((event as MessageEvent<string>).data));
      } catch {
        /* malformed event ignored */
      }
    });
    source.onopen = () => setOnline(true);
    source.onerror = () => setOnline(false);
    return () => {
      disposed = true;
      source.close();
      window.clearInterval(reconcile);
      window.clearInterval(timer);
    };
  }, []);
  const stale = !!snapshot?.lastEventAt && now - snapshot.lastEventAt > 90000;
  return {
    snapshot,
    now,
    online,
    paginationError,
    healthy: snapshot?.status === 'live' && online && !stale,
    label: stale
      ? 'Feed stale'
      : snapshot?.status === 'live' && online
        ? 'Live provider feed'
        : 'Feed not connected',
  };
}
