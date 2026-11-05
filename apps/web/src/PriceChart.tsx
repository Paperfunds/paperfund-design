import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  type ISeriesMarkersPluginApi,
  type Time,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  loadChartPools,
  loadPriceCandles,
  type ChartInterval,
  type PriceCandle,
} from './market-ohlcv.js';
import { validMint } from './market-discovery.js';
import { tradeMarkers, type ChartExecution } from './trade-markers.js';
import { useMarketTrades, swapCandles, intervalSeconds } from './market-trades.js';
import {
  candlePatch,
  recentWindow,
  retainedWindow,
  sma20,
  type LogicalWindow,
} from './chart-render.js';

const price = (n: number) => (n >= 1 ? n.toFixed(4) : n.toPrecision(5));
export const CanvasChart = memo(function CanvasChart({
  candles,
  sma,
  identity,
  markers,
  interval,
  valueMode = 'price',
}: {
  candles: PriceCandle[];
  sma: boolean;
  identity: string;
  markers: ReturnType<typeof tradeMarkers>;
  interval: ChartInterval;
  valueMode?: 'price' | 'cap';
}) {
  const root = useRef<HTMLDivElement>(null),
    api = useRef<IChartApi | null>(null);
  const series = useRef<ReturnType<IChartApi['addSeries']> | null>(null);
  const volumeSeries = useRef<ReturnType<IChartApi['addSeries']> | null>(null);
  const averageSeries = useRef<ReturnType<IChartApi['addSeries']> | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const markerApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const previous = useRef<{
    candles: PriceCandle[];
    interval: ChartInterval;
    valueMode: string;
  } | null>(null);
  const [visible, setVisible] = useState<LogicalWindow | null>(null);
  const value = candles.find((c) => c.time === hover) ?? candles[candles.length - 1];
  useEffect(() => {
    if (!root.current) return;
    const chart = createChart(root.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#100e19' },
        textColor: '#a99fba',
        fontSize: 11,
        attributionLogo: true,
      },
      grid: { vertLines: { color: '#ffffff04' }, horzLines: { color: '#ffffff08' } },
      rightPriceScale: { borderColor: '#332540', scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: {
        borderColor: '#332540',
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 2,
        shiftVisibleRangeOnNewBar: false,
      },
      crosshair: { mode: 0 },
      handleScroll: {
        vertTouchDrag: false,
        horzTouchDrag: true,
        mouseWheel: true,
        pressedMouseMove: true,
      },
    });
    api.current = chart;
    const cs = chart.addSeries(CandlestickSeries, {
      upColor: '#65d9ac',
      downColor: '#ef7d99',
      wickUpColor: '#65d9ac',
      wickDownColor: '#ef7d99',
      borderVisible: true,
      borderUpColor: '#65d9ac',
      borderDownColor: '#ef7d99',
      wickVisible: true,
      priceFormat: { type: 'custom', formatter: price, minMove: 0.000000000001 },
    });
    series.current = cs;
    const vs = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    vs.priceScale().applyOptions({ visible: false, scaleMargins: { top: 0.82, bottom: 0 } });
    const ma = chart.addSeries(LineSeries, {
      color: '#c4a0f3',
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.current = vs;
    averageSeries.current = ma;
    markerApi.current = createSeriesMarkers(cs, []);
    chart.timeScale().subscribeVisibleLogicalRangeChange(setVisible);
    let width = root.current.clientWidth;
    const resize = new ResizeObserver(([entry]) => {
      const next = entry?.contentRect.width ?? width;
      if (next > 0 && Math.abs(next - width) > width * 0.3) {
        // Refit only the recent-following window at a breakpoint; never reset manual navigation.
        requestAnimationFrame(() => {
          if (api.current !== chart) return;
          const count = previous.current?.candles.length ?? 0;
          const range = chart.timeScale().getVisibleLogicalRange();
          if (api.current === chart && count && range && range.to >= count - 1)
            chart.timeScale().setVisibleLogicalRange(recentWindow(count, next));
        });
      }
      width = next;
    });
    resize.observe(root.current);
    chart.subscribeCrosshairMove((e) => setHover(typeof e.time === 'number' ? e.time : null));
    return () => {
      chart.remove();
      markerApi.current = null;
      resize.disconnect();
      api.current = null;
      series.current = null;
      volumeSeries.current = null;
      averageSeries.current = null;
      previous.current = null;
    };
    // Token/pool identity owns the chart; refreshed data and intervals reuse its canvas.
  }, [identity]);
  useEffect(() => {
    const chart = api.current,
      cs = series.current,
      vs = volumeSeries.current;
    if (!chart || !cs || !vs) return;
    const old = previous.current;
    const changedInterval = old?.interval !== interval || old?.valueMode !== valueMode;
    const range = chart.timeScale().getVisibleLogicalRange();
    const patch = changedInterval
      ? { reset: true, from: 0 }
      : candlePatch(old?.candles ?? [], candles);
    const rows = candles.slice(patch.from);
    const prices = rows.map((c) => ({ ...c, time: c.time as UTCTimestamp }));
    const volumes = rows.map((c) => ({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? '#65d9ac60' : '#ef7d9960',
    }));
    if (patch.reset) {
      cs.setData(prices);
      vs.setData(volumes);
    } else {
      prices.forEach((c) => cs.update(c));
      volumes.forEach((c) => vs.update(c));
    }
    averageSeries.current?.setData(
      sma ? sma20(candles).map((c) => ({ ...c, time: c.time as UTCTimestamp })) : [],
    );
    chart.timeScale().applyOptions({ secondsVisible: interval.endsWith('s') });
    if (candles.length && (changedInterval || !old?.candles.length)) {
      chart.priceScale('right').applyOptions({ autoScale: true });
      chart
        .timeScale()
        .setVisibleLogicalRange(recentWindow(candles.length, root.current?.clientWidth ?? 800));
    } else if (range && old?.candles.length && candles.length && candles !== old.candles) {
      chart.timeScale().setVisibleLogicalRange(retainedWindow(range, old.candles, candles));
    }
    previous.current = { candles, interval, valueMode };
  }, [candles, sma, interval, identity, valueMode]);
  useEffect(() => {
    markerApi.current?.setMarkers(markers.map((m) => ({ ...m, time: m.time as UTCTimestamp })));
  }, [markers, identity, sma]);
  return (
    <>
      <div className="pf-price-ohlc" aria-live="off">
        {value && (
          <>
            <span>{new Date(value.time * 1000).toISOString().slice(11, 19)} UTC</span>
            <span>
              O <b>{price(value.open)}</b>
            </span>
            <span>
              H <b>{price(value.high)}</b>
            </span>
            <span>
              L <b>{price(value.low)}</b>
            </span>
            <span>
              C{' '}
              <b className={value.close >= value.open ? 'pf-up' : 'pf-down'}>
                {price(value.close)}
              </b>
            </span>
            <span>
              Vol <b>${value.volume.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b>
            </span>
          </>
        )}
      </div>
      <div
        ref={root}
        className="pf-price-canvas"
        role="img"
        aria-label="Real USD price candles and traded volume"
        data-candles={candles.length}
        data-visible-from={visible?.from}
        data-visible-to={visible?.to}
      />
      <div className="pf-chart-navigation">
        <button
          onClick={() => {
            api.current?.priceScale('right').applyOptions({ autoScale: true });
            api.current
              ?.timeScale()
              .setVisibleLogicalRange(
                recentWindow(candles.length, root.current?.clientWidth ?? 800),
              );
          }}
        >
          Latest trades
        </button>
        <button onClick={() => api.current?.timeScale().fitContent()}>Fit all history</button>
        <span>Scroll to zoom · drag to pan · empty periods stay empty</span>
      </div>
    </>
  );
});

export function PriceChart({
  mint,
  fills = [],
  currentSupply,
  onPoolChange,
}: {
  mint: string;
  fills?: ChartExecution[];
  currentSupply?: number | undefined;
  onPoolChange?: ((pool: string) => void) | undefined;
}) {
  const accepted = validMint(mint),
    [interval, setInterval] = useState<ChartInterval>('1s'),
    [sma, setSma] = useState(false),
    [chosenPool, setChosenPool] = useState('');
  const [mode, setMode] = useState<'price' | 'cap'>('price');
  const [older, setOlder] = useState<{ key: string; candles: PriceCandle[] }>({
      key: '',
      candles: [],
    }),
    [loadingOlder, setLoadingOlder] = useState(false),
    [historyError, setHistoryError] = useState('');
  const pools = useQuery({
    queryKey: ['gecko-pools', accepted],
    enabled: !!accepted,
    queryFn: () => loadChartPools(accepted!),
    staleTime: 300000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const pool = pools.data?.find((p) => p.address === chosenPool) ?? pools.data?.[0];
  useEffect(() => {
    onPoolChange?.(pool?.address ?? '');
  }, [pool?.address, onPoolChange]);
  const key = [accepted, pool?.address, interval].join(':');
  const swaps = useMarketTrades(accepted ?? '', pool?.address ?? '');
  const subminute = interval.endsWith('s');
  const data = useQuery({
    queryKey: ['gecko-ohlcv', accepted, pool?.address, interval],
    enabled: !!accepted && !!pool && !subminute,
    queryFn: () => loadPriceCandles(accepted!, pool!, interval),
    staleTime: 60000,
    refetchInterval: 60000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const history = useMemo(
    () =>
      [
        ...new Map(
          [...(older.key === key ? older.candles : []), ...(data.data?.candles ?? [])].map((c) => [
            c.time,
            c,
          ]),
        ).values(),
      ].sort((a, b) => a.time - b.time),
    [older, key, data.data],
  );
  const observed = useMemo(() => swapCandles(swaps.data, interval), [swaps.data, interval]);
  const candles = useMemo(() => {
    const lastHistory = history.at(-1)?.time ?? 0;
    const safeAfter = swaps.data?.trades[0]?.time ?? Infinity;
    const combined = subminute
      ? observed
      : [...history, ...observed.filter((c) => c.time > lastHistory && c.time * 1000 >= safeAfter)];
    return mode === 'cap' && currentSupply && currentSupply > 0
      ? combined.map((c) => ({
          ...c,
          open: c.open * currentSupply,
          high: c.high * currentSupply,
          low: c.low * currentSupply,
          close: c.close * currentSupply,
        }))
      : combined;
  }, [history, observed, subminute, swaps.data, mode, currentSupply]);
  const error = pools.error ?? (subminute ? swaps.error : data.error);
  const markers = useMemo(
    () => tradeMarkers(fills, mint, candles, interval),
    [fills, mint, candles, interval],
  );
  const streaming =
    swaps.data?.delivery === 'helius-confirmed' && swaps.data.streamState === 'live';
  const latest = candles.at(-1);
  async function moreHistory() {
    if (!pool || !accepted || !history.length) return;
    const requestedKey = key;
    setLoadingOlder(true);
    setHistoryError('');
    try {
      const r = await loadPriceCandles(accepted, pool, interval, history[0]!.time - 1);
      setOlder({ key: requestedKey, candles: [...history, ...r.candles] });
      if (!r.candles.length) setHistoryError('No earlier traded candles returned by this pool.');
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Earlier history unavailable.');
    } finally {
      setLoadingOlder(false);
    }
  }
  return (
    <section className="pf-web-chart pf-price-chart" aria-label="Market price chart">
      <header className="pf-chart-controls">
        <div>
          <strong>
            {mode === 'cap' && currentSupply ? 'Current-supply cap / USD' : 'Price / USD'}
          </strong>
          <small className={'pf-feed-state ' + (streaming ? 'is-live' : 'is-delayed')}>
            <i aria-hidden="true" />
            {streaming ? 'Confirmed stream' : 'Delayed feed'}
          </small>
        </div>
        <div className="pf-chart-market-line">
          <strong>{latest ? '$' + price(latest.close) : '—'}</strong>
          <small>
            {swaps.data?.delivery === 'helius-confirmed'
              ? 'Helius confirmed swaps'
              : 'GeckoTerminal · delayed REST'}{' '}
            ·{' '}
            {latest
              ? new Date(latest.time * 1000).toISOString().slice(11, 19) + ' UTC'
              : 'Waiting for market data'}
          </small>
        </div>
        <div className="pf-chart-intervals" aria-label="Chart interval">
          {(Object.keys(intervalSeconds) as ChartInterval[]).map((v) => (
            <button
              key={v}
              aria-pressed={interval === v}
              onClick={() => {
                setInterval(v);
                setHistoryError('');
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <select
          aria-label="Chart value mode"
          value={mode === 'cap' && !currentSupply ? 'price' : mode}
          onChange={(e) => setMode(e.target.value as 'price' | 'cap')}
        >
          <option value="price">Price / USD</option>
          <option value="cap" disabled={!currentSupply}>
            Current-supply cap
          </option>
        </select>
        <button aria-pressed={sma} onClick={() => setSma((v) => !v)} disabled={candles.length < 20}>
          SMA 20
        </button>
        <button
          disabled={subminute || !candles.length || loadingOlder}
          onClick={() => void moreHistory()}
        >
          {loadingOlder ? 'Loading…' : 'Earlier history'}
        </button>
        {error && (
          <button
            disabled={pools.isFetching || data.isFetching || swaps.isFetching}
            onClick={() => {
              if (pool && subminute) void swaps.refetch();
              else if (pool) void data.refetch();
              else void pools.refetch();
            }}
          >
            Retry chart
          </button>
        )}
      </header>
      <div className="pf-chart-stage">
        {accepted && pool && (
          <CanvasChart
            key={accepted + ':' + pool?.address}
            candles={candles}
            markers={markers}
            sma={sma}
            identity={accepted + ':' + pool?.address}
            interval={interval}
            valueMode={mode === 'cap' && currentSupply ? 'cap' : 'price'}
          />
        )}
        {!candles.length && (
          <div className="pf-chart-empty">
            <strong>
              {!accepted
                ? 'Choose a token from Pulse'
                : pools.isFetching || (subminute ? swaps.isFetching : data.isFetching)
                  ? 'Loading real market candles…'
                  : 'Price history unavailable'}
            </strong>
            <p>
              {pools.isFetching || (subminute ? swaps.isFetching : data.isFetching)
                ? 'Fetching provider OHLCV. No candles or volume are synthesized.'
                : error instanceof Error
                  ? error.message
                  : (swaps.data?.lastError ??
                    'This mint has no indexed traded history yet. Practice quotes remain independent.')}
            </p>
          </div>
        )}
      </div>
      <div className="pf-chart-statusbar">
        <span className={streaming ? 'pf-up' : 'muted'}>
          {streaming ? '● Helius confirmed' : '◷ Delayed REST'}
        </span>
        <span>
          {candles.length} traded bars · {interval}
        </span>
        <span>
          {swaps.data?.gaps.length ?? 0} gaps · {markers.length} PAPER markers
        </span>
      </div>
      <details className="pf-chart-observations">
        <summary>
          Feed status &amp; observations
          {swaps.data?.lastError
            ? streaming
              ? ' · coverage notes'
              : ' · delayed / limited coverage'
            : ''}
        </summary>
        <div className="pf-chart-provenance">
          <span>
            {swaps.data?.trades.length ?? 0} retained swaps · {swaps.data?.gaps.length ?? 0}{' '}
            detected gaps ·{' '}
            {swaps.data?.delivery === 'helius-confirmed' && swaps.data.streamState === 'live'
              ? 'Confirmed Helius WSS → browser SSE · updates batched ≤500ms'
              : 'Delayed REST fallback ≈12s; provider indexing may add latency'}
          </span>
          {swaps.data?.trades.length ? (
            <span>
              Observed history {new Date(swaps.data.trades[0]!.time).toISOString()} →{' '}
              {new Date(swaps.data.trades.at(-1)!.time).toISOString()}
            </span>
          ) : null}
          {swaps.data?.lastError && (
            <span role="status">
              Provider note: {swaps.data.lastError}; previous observations retained.
            </span>
          )}
          {swaps.data?.delivery === 'helius-confirmed' && swaps.data.historyError && (
            <span role="status">
              Historical provider: {swaps.data.historyError}; confirmed streaming is separate.
            </span>
          )}
          {mode === 'cap' && (
            <span>
              Price × current verified mint supply. Historical circulating supply is unavailable;
              this is an indicative view.
            </span>
          )}
          <span data-testid="trade-marker-count">
            {markers.length} PAPER annotations · B = BUY / S = SELL · time only, not USD fill prices
          </span>
          {pool && (
            <>
              <span title={pool.address}>
                Pool{' '}
                <a
                  href={'https://www.geckoterminal.com/solana/pools/' + pool.address}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {pool.name} ↗
                </a>{' '}
                · {pool.dex}
              </span>
              {pools.data && pools.data.length > 1 && (
                <select
                  aria-label="Chart pool"
                  value={pool.address}
                  onChange={(e) => setChosenPool(e.target.value)}
                >
                  {pools.data.map((p) => (
                    <option value={p.address} key={p.address}>
                      {p.name} · {p.address.slice(0, 6)}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          {data.data && (
            <span>
              Fetched {new Date(data.data.fetchedAt).toLocaleTimeString()} · {candles.length}{' '}
              candles · last trade bucket{' '}
              {candles.length
                ? new Date(candles[candles.length - 1]!.time * 1000).toLocaleString()
                : '—'}{' '}
              (local time)
            </span>
          )}
          {(error || historyError) && (
            <span role="status">
              {historyError ||
                (error instanceof Error
                  ? error.message
                  : 'Refresh unavailable; showing previous data.')}
            </span>
          )}
        </div>
      </details>
      <details className="pf-chart-source">
        <summary>Chart source &amp; coverage · separate from execution</summary>
        <p>
          <a href="https://www.geckoterminal.com" target="_blank" rel="noopener noreferrer">
            GeckoTerminal
          </a>{' '}
          public API historical candles + Helius confirmed stream where supported · USD price and
          USD traded volume for the selected exact-mint pool, highest reported liquidity by default.
          One-second bars are aggregated exclusively from timestamped swaps, never interpolated from
          minute bars. The free trade endpoint returns at most300 trades per fetch; retained
          observations accumulate while open. Provider latency and missing-overlap gaps are
          explicit. Same-second ties use provider ordering, not a reconstructed block transaction
          index. Historical minute/hour/day candles refresh once a minute. Missing trade intervals
          stay empty. Early bonding curves may not be indexed; no historical data is synthesized.
          Chart prices never price Practice orders or PnL.
        </p>
        <p>
          Helius streaming currently supports verified native-SOL PumpSwap pools. Successful
          confirmed program events bind the selected mint, pool, user and vaults. Event UTC
          timestamps and provider transaction indices preserve ordering; USD conversion records a
          fresh DEX SOL/USD mark (maximum age120s). The initial handoff second and reconnect gaps
          remain incomplete, never synthesized. Unsupported pools, outages and budget limits use
          explicitly delayed GeckoTerminal fallback. Real-time display never determines execution,
          balances or settlement.
        </p>
        <p>
          Mint: <code>{accepted ?? '—'}</code>
          <br />
          Pool: <code>{pool?.address ?? 'Unindexed'}</code>
        </p>
        <p>
          TradingView Lightweight Charts™ · Copyright (с) 2025 TradingView, Inc.{' '}
          <a href="https://www.tradingview.com" target="_blank" rel="noopener noreferrer">
            TradingView
          </a>
        </p>
      </details>
    </section>
  );
}
