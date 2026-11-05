import { validMint } from './market-discovery.js';

export type ChartPool = {
  address: string;
  base: string;
  quote: string;
  name: string;
  dex: string;
  liquidity: number;
};
export type PriceCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type ChartInterval =
  '1s' | '3s' | '5s' | '15s' | '30s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
type Resource = {
  id?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id?: string } }>;
};
const BASE = 'https://api.geckoterminal.com/api/v2/networks/solana';
// Public API documents ~10 requests/minute. Bound this browser to eight, including failures.
let requests: number[] = [],
  cooldown = 0;
async function publicGet(path: string) {
  const now = Date.now();
  requests = requests.filter((t) => now - t < 60000);
  if (now < cooldown || requests.length >= 8)
    throw Error('Chart request limit reached. Wait one minute before retrying.');
  requests.push(now);
  let r: Response;
  try {
    r = await fetch(BASE + path, {
      credentials: 'omit',
      headers: { Accept: 'application/json;version=20230203' },
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    // Browsers may hide a throttled response behind a CORS/network error.
    cooldown = now + 60000;
    throw Error('Chart provider unreachable or rate-limited. Try again in one minute.');
  }
  if (r.status === 429) {
    cooldown = now + 60000;
    throw Error('GeckoTerminal rate limit. Chart refresh paused for one minute.');
  }
  if (!r.ok)
    throw Error(
      r.status === 404
        ? 'This token or pool is not indexed by GeckoTerminal yet.'
        : 'GeckoTerminal chart data is unavailable.',
    );
  return r.json();
}
export function decodeChartPools(body: unknown, mint: string): ChartPool[] {
  if (!validMint(mint)) return [];
  const data = (body as { data?: Resource[] })?.data;
  if (!Array.isArray(data)) return [];
  return data
    .flatMap((p) => {
      const a = p.attributes,
        base = p.relationships?.base_token?.data?.id?.replace(/^solana_/, ''),
        quote = p.relationships?.quote_token?.data?.id?.replace(/^solana_/, '');
      if (
        !a ||
        typeof a.address !== 'string' ||
        !validMint(a.address) ||
        p.id !== 'solana_' + a.address ||
        !base ||
        !quote ||
        !validMint(base) ||
        !validMint(quote) ||
        (base !== mint && quote !== mint)
      )
        return [];
      const liquidity = Number(a.reserve_in_usd);
      return [
        {
          address: a.address,
          base,
          quote,
          name: String(a.name ?? 'Solana pool'),
          dex: p.relationships?.dex?.data?.id ?? 'unreported',
          liquidity: Number.isFinite(liquidity) && liquidity >= 0 ? liquidity : 0,
        },
      ];
    })
    .sort((a, b) => b.liquidity - a.liquidity);
}
export function decodePriceCandles(body: unknown, mint: string, pool: ChartPool): PriceCandle[] {
  const b = body as {
    meta?: { base?: { address?: string }; quote?: { address?: string } };
    data?: { attributes?: { ohlcv_list?: unknown[] } };
  };
  if (
    !validMint(mint) ||
    (mint !== pool.base && mint !== pool.quote) ||
    b?.meta?.base?.address !== pool.base ||
    b.meta?.quote?.address !== pool.quote
  )
    throw Error('Chart token/pool identity mismatch.');
  const list = b.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list)) throw Error('Invalid chart response.');
  const unique = new Map<number, PriceCandle>();
  for (const row of list) {
    if (
      !Array.isArray(row) ||
      row.length !== 6 ||
      !row.every((v) => typeof v === 'number' && Number.isFinite(v))
    )
      continue;
    const [time, open, high, low, close, volume] = row as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    if (
      !Number.isSafeInteger(time) ||
      time <= 0 ||
      time > Date.now() / 1000 + 60 ||
      Math.min(open, high, low, close) <= 0 ||
      volume < 0 ||
      high < Math.max(open, close) ||
      low > Math.min(open, close) ||
      high < low
    )
      continue;
    unique.set(time, { time, open, high, low, close, volume });
  }
  return [...unique.values()].sort((a, b) => a.time - b.time);
}
export async function loadChartPools(mint: string) {
  if (!validMint(mint)) throw Error('Invalid Solana mint.');
  return decodeChartPools(await publicGet('/tokens/' + mint + '/pools'), mint);
}
export async function loadPriceCandles(
  mint: string,
  pool: ChartPool,
  interval: ChartInterval,
  before?: number,
) {
  if (!validMint(mint) || !validMint(pool.address) || (mint !== pool.base && mint !== pool.quote))
    throw Error('Invalid chart identity.');
  const [timeframe, aggregate] = interval.endsWith('s')
    ? ['second', interval.slice(0, -1)]
    : interval === '1h' || interval === '4h'
      ? ['hour', interval.slice(0, -1)]
      : interval === '1d'
        ? ['day', '1']
        : ['minute', interval.slice(0, -1)];
  const q = new URLSearchParams({
    aggregate: aggregate!,
    limit: '400',
    currency: 'usd',
    token: mint,
    include_empty_intervals: 'false',
  });
  if (before && Number.isSafeInteger(before)) q.set('before_timestamp', String(before));
  const body = await publicGet('/pools/' + pool.address + '/ohlcv/' + timeframe + '?' + q);
  return { candles: decodePriceCandles(body, mint, pool), fetchedAt: Date.now() };
}
