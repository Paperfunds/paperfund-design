/**
 * Public, display-only Pulse events. No market prices here are authoritative paper quotes.
 * This feed has its own read-only service and must never share financial signer privileges.
 */
import { classifyPulseToken } from '../../../packages/shared/src/pulse-classification.mjs';
import type { TokenListing } from './terminal-market.js';
export type PulseStage = 'new' | 'stretch' | 'migrated';
export type PulseStatus = 'disabled' | 'connecting' | 'live' | 'disconnected';

export interface PulseToken {
  mint: string;
  name: string;
  symbol: string;
  stage: PulseStage | null;
  complete?: boolean;
  createdAt?: number | null;
  creationVerifiedAt?: number | null;
  marketCapUsdAt?: number | null;
  volume24hUsd?: number | null;
  marketObservedAt?: number | null;
  marketData?: TokenListing | null;
  marketStatus?: string;
  creationTimeStatus?: string;
  classificationReason?: string;
  mintSupplyRaw?: string | null;
  decimals?: number | null;
  firstSeenAt: number;
  lastSeenAt: number;
  source: 'pumpportal';
  marketCapSol: number | null;
  marketCapUsd?: number | null;
  marketCapSource?: string;
  marketCapAt?: number | null;
  curveProgressPct: number | null;
  icon?: string | null;
  progressVerifiedAt?: number | null;
  verifiedAt?: number | null;
  migrationVerifiedAt?: number | null;
  links?: { label: string; url: string }[];
  description?: string;
  metadataSource?: string | null;
  metadataStatus?: string;
  creatorAddress?: string | null;
  mintAuthorityDisabled?: boolean | null;
  freezeAuthorityDisabled?: boolean | null;
  tokenProgram?: string | null;
  curveVariant?: string | null;
  discoverySource?: string;
  migrationEventAt?: number | null;
}

export interface PulseSnapshot {
  status: PulseStatus;
  lastEventAt: number | null;
  receivedAt: number;
  provider: string;
  coverage: string;
  tokens: PulseToken[];
  rpcHealth?: string;
  diagnostics?: PulseDiagnostics;
  nextCursor?: string | null;
}
export interface PulseDiagnostics {
  tracked: number;
  verified: number;
  pending: number;
  rejected: number;
  displayed: number;
  migrationPending: number;
  progressUnavailable: number;
  reasons: Record<string, number>;
  lastRpcError: { code: string; detail: string; at: number } | null;
  exclusions?: Record<string, number>;
  creationTimePending?: number;
  marketError?: string | null;
}
function decodeDiagnostics(value: unknown): PulseDiagnostics | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const d = value as Record<string, unknown>;
  const count = (key: string) => numberInRange(d[key], 0, Number.MAX_SAFE_INTEGER) ?? 0;
  const reasons: Record<string, number> = {};
  if (d.reasons && typeof d.reasons === 'object' && !Array.isArray(d.reasons))
    for (const [key, n] of Object.entries(d.reasons).slice(0, 20))
      if (/^[A-Z0-9_]{1,80}$/.test(key) && numberInRange(n, 0, 1000) !== null)
        reasons[key] = n as number;
  const error =
    d.lastRpcError && typeof d.lastRpcError === 'object'
      ? (d.lastRpcError as Record<string, unknown>)
      : null;
  return {
    tracked: count('tracked'),
    verified: count('verified'),
    pending: count('pending'),
    rejected: count('rejected'),
    displayed: count('displayed'),
    migrationPending: count('migrationPending'),
    progressUnavailable: count('progressUnavailable'),
    reasons,
    creationTimePending: count('creationTimePending'),
    marketError:
      d.market && typeof d.market === 'object'
        ? text((d.market as Record<string, unknown>).lastError, 100) || null
        : null,
    exclusions:
      d.exclusions && typeof d.exclusions === 'object'
        ? (Object.fromEntries(
            Object.entries(d.exclusions).filter(
              ([k, v]) =>
                /^[A-Z0-9_]+$/.test(k) &&
                typeof v === 'number' &&
                Number.isSafeInteger(v) &&
                v >= 0,
            ),
          ) as Record<string, number>)
        : {},
    lastRpcError: error
      ? {
          code: text(error.code, 80),
          detail: text(error.detail, 240),
          at: numberInRange(error.at, 1, 9999999999999) ?? 0,
        }
      : null,
  };
}

export const SOLANA_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function numberInRange(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
}
function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
export function isPulseStage(v: unknown): v is PulseStage {
  return v === 'new' || v === 'stretch' || v === 'migrated';
}
function decodePulseMarket(value: unknown, mint: string): TokenListing | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (
    v.mint !== mint ||
    v.source !== 'DEX_SCREENER' ||
    typeof v.pair !== 'string' ||
    !SOLANA_MINT.test(v.pair)
  )
    return null;
  const links = Array.isArray(v.links)
    ? v.links
        .flatMap((l: unknown) => {
          if (!l || typeof l !== 'object') return [];
          const p = l as Record<string, unknown>;
          return typeof p.url === 'string' && p.url.startsWith('https://') && p.url.length <= 1024
            ? [{ label: text(p.label, 32), url: p.url }]
            : [];
        })
        .slice(0, 6)
    : [];
  return {
    mint,
    pair: v.pair,
    dex: text(v.dex, 32),
    name: text(v.name, 64),
    symbol: text(v.symbol, 24),
    priceUsd: numberInRange(v.priceUsd, 0, 1e18),
    marketCapUsd: numberInRange(v.marketCapUsd, 0, 1e18),
    liquidityUsd: numberInRange(v.liquidityUsd, 0, 1e18),
    volume24h: numberInRange(v.volume24h, 0, 1e18),
    change5m: numberInRange(v.change5m, -100, 1e15),
    buys5m: numberInRange(v.buys5m, 0, 1e15),
    sells5m: numberInRange(v.sells5m, 0, 1e15),
    icon: typeof v.icon === 'string' && v.icon.startsWith('https://') ? v.icon : null,
    links,
    observedAt: numberInRange(v.observedAt, 1, 9999999999999) ?? 0,
  };
}
export function decodePulseToken(value: unknown): PulseToken | null {
  if (!value || typeof value !== 'object') return null;
  const token = value as Record<string, unknown>;
  if (
    typeof token.mint !== 'string' ||
    !SOLANA_MINT.test(token.mint) ||
    !(token.stage === null || isPulseStage(token.stage)) ||
    token.source !== 'pumpportal'
  )
    return null;
  const firstSeenAt = numberInRange(token.firstSeenAt, 1, 9999999999999);
  const lastSeenAt = numberInRange(token.lastSeenAt, 1, 9999999999999);
  if (firstSeenAt === null || lastSeenAt === null || lastSeenAt < firstSeenAt) return null;
  return {
    mint: token.mint,
    name: text(token.name, 64) || 'Unnamed token',
    symbol: text(token.symbol, 24) || '—',
    stage: token.stage,
    complete: token.complete === true,
    createdAt: numberInRange(token.createdAt, 1, 9999999999999),
    creationVerifiedAt: numberInRange(token.creationVerifiedAt, 1, 9999999999999),
    marketCapUsdAt: numberInRange(token.marketCapUsdAt, 1, 9999999999999),
    volume24hUsd: numberInRange(token.volume24hUsd, 0, 1e18),
    marketObservedAt: numberInRange(token.marketObservedAt, 1, 9999999999999),
    marketStatus: text(token.marketStatus, 80),
    creationTimeStatus: text(token.creationTimeStatus, 80),
    classificationReason: text(token.classificationReason, 80),
    mintSupplyRaw:
      typeof token.mintSupplyRaw === 'string' && /^\d{1,24}$/.test(token.mintSupplyRaw)
        ? token.mintSupplyRaw
        : null,
    decimals: numberInRange(token.decimals, 0, 18),
    marketData: decodePulseMarket(token.marketData, token.mint),
    firstSeenAt,
    lastSeenAt,
    source: 'pumpportal',
    marketCapSol: numberInRange(token.marketCapSol, 0, 1e15),
    marketCapUsd: numberInRange(token.marketCapUsd, 0, 1e15),
    marketCapSource: text(token.marketCapSource, 64),
    marketCapAt: numberInRange(token.marketCapAt, 1, 9999999999999),
    curveProgressPct: numberInRange(token.curveProgressPct, 0, 100),
    icon:
      typeof token.icon === 'string' && /^https:\/\//.test(token.icon) && token.icon.length <= 1024
        ? token.icon
        : null,
    progressVerifiedAt: numberInRange(token.progressVerifiedAt, 1, 9999999999999),
    verifiedAt: numberInRange(token.verifiedAt, 1, 9999999999999),
    migrationVerifiedAt: numberInRange(token.migrationVerifiedAt, 1, 9999999999999),
    links: Array.isArray(token.links)
      ? token.links
          .slice(0, 6)
          .flatMap((v) =>
            v &&
            typeof v.label === 'string' &&
            typeof v.url === 'string' &&
            /^https:\/\//.test(v.url) &&
            v.url.length <= 1024
              ? [{ label: v.label.slice(0, 32), url: v.url }]
              : [],
          )
      : [],
    description: text(token.description, 300),
    metadataSource:
      typeof token.metadataSource === 'string' && /^https:\/\//.test(token.metadataSource)
        ? text(token.metadataSource, 1024)
        : null,
    metadataStatus: text(token.metadataStatus, 80),
    creatorAddress:
      typeof token.creatorAddress === 'string' && SOLANA_MINT.test(token.creatorAddress)
        ? token.creatorAddress
        : null,
    mintAuthorityDisabled:
      typeof token.mintAuthorityDisabled === 'boolean' ? token.mintAuthorityDisabled : null,
    freezeAuthorityDisabled:
      typeof token.freezeAuthorityDisabled === 'boolean' ? token.freezeAuthorityDisabled : null,
    tokenProgram: text(token.tokenProgram, 44) || null,
    curveVariant: text(token.curveVariant, 32) || null,
    discoverySource: text(token.discoverySource, 32),
    migrationEventAt: numberInRange(token.migrationEventAt, 1, 9999999999999),
  };
}
export function decodePulseSnapshot(value: unknown): PulseSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.tokens) || obj.tokens.length > 1500) return null;
  const status = obj.status;
  if (
    status !== 'disabled' &&
    status !== 'connecting' &&
    status !== 'live' &&
    status !== 'disconnected'
  )
    return null;
  const receivedAt = numberInRange(obj.receivedAt, 1, 9999999999999);
  if (receivedAt === null) return null;
  const tokens = [
    ...new Map(
      obj.tokens
        .map(decodePulseToken)
        .filter((x): x is PulseToken => x !== null)
        .map((t) => [t.mint, t]),
    ).values(),
  ];
  return {
    status,
    receivedAt,
    lastEventAt: numberInRange(obj.lastEventAt, 1, 9999999999999),
    provider: text(obj.provider, 72) || 'Unknown',
    coverage: text(obj.coverage, 120) || 'Provider coverage unavailable',
    tokens,
    nextCursor:
      typeof obj.nextCursor === 'string' && SOLANA_MINT.test(obj.nextCursor)
        ? obj.nextCursor
        : null,
    rpcHealth: text(obj.rpcHealth, 24),
    ...(decodeDiagnostics(obj.diagnostics)
      ? { diagnostics: decodeDiagnostics(obj.diagnostics)! }
      : {}),
  };
}
export function stageTokens(
  snapshot: PulseSnapshot | null,
  stage: PulseStage,
  query = '',
  now = Date.now(),
  limit = 100,
): PulseToken[] {
  const term = query.trim().toLowerCase();
  return (snapshot?.tokens ?? [])
    .filter((token) => {
      const actualStage = classifyPulseToken(token, now).stage;
      return (
        actualStage === stage &&
        (!term ||
          token.mint.toLowerCase().includes(term) ||
          token.name.toLowerCase().includes(term) ||
          token.symbol.toLowerCase().includes(term))
      );
    })
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, Math.max(0, limit));
}
export async function hydratePulsePages(
  initial: PulseSnapshot,
  readPage: (cursor: string) => Promise<unknown>,
): Promise<PulseSnapshot> {
  const rows = new Map(initial.tokens.map((t) => [t.mint, t])),
    seen = new Set<string>();
  let cursor = initial.nextCursor;
  let receivedAt = initial.receivedAt;
  while (cursor) {
    if (seen.has(cursor)) throw Error('PULSE_PAGINATION_CURSOR_REPEATED');
    seen.add(cursor);
    const page = decodePulseSnapshot(await readPage(cursor));
    if (!page) throw Error('PULSE_PAGINATION_INVALID_RESPONSE');
    receivedAt = Math.max(receivedAt, page.receivedAt);
    for (const token of page.tokens) rows.set(token.mint, token);
    cursor = page.nextCursor;
  }
  return { ...initial, receivedAt, tokens: [...rows.values()], nextCursor: null };
}
export function tokenAge(time: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 60) return seconds + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
  return Math.floor(seconds / 3600) + 'h';
}
/** Strict same-origin endpoint by default; no third-party browser keys. */
export function pulseApiPath(path: 'snapshot' | 'events'): string {
  if (
    import.meta.env.DEV &&
    typeof location !== 'undefined' &&
    location.hostname === '127.0.0.1' &&
    location.port === '5208'
  )
    return 'http://127.0.0.1:3359/pulse-feed/' + path;
  return '/pulse-feed/' + path;
}
