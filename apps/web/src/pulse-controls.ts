import type { PulseToken } from './pulse-model.js';
import { freshPulseValue } from '../../../packages/shared/src/pulse-classification.mjs';
import { tokenSocialLinks, type TokenListing } from './terminal-market.js';
/** Hold only row order during interaction. Always use freshly classified/filtered objects. */
export function interactionOrder(tokens: PulseToken[], order?: readonly string[]) {
  if (!order) return tokens;
  const indices = new Map(order.map((mint, index) => [mint, index]));
  return [...tokens].sort(
    (a, b) => (indices.get(a.mint) ?? Infinity) - (indices.get(b.mint) ?? Infinity),
  );
}
export interface ColumnControls {
  query?: string;
  sort:
    'global' | 'newest' | 'capUsd' | 'capSol' | 'volume' | 'liquidity' | 'activity' | 'progress';
  minCap: string;
  minLiquidity: string;
  minVolume: string;
  maxAge: string;
  images: boolean;
  socials: boolean;
  authorities: boolean;
}
export const defaultColumn: ColumnControls = {
  query: '',
  sort: 'global',
  minCap: '',
  minLiquidity: '',
  minVolume: '',
  maxAge: '',
  images: false,
  socials: false,
  authorities: false,
};
export function filterColumn(
  tokens: PulseToken[],
  controls: ColumnControls,
  listings: Record<string, TokenListing> | undefined,
  now: number,
  globalSort: string,
) {
  const fresh = (t: PulseToken) => {
    const l = listings?.[t.mint];
    return l && l.mint === t.mint && now - l.observedAt < 120000 ? l : null;
  };
  const minimum = (value: number | null | undefined, threshold: string) =>
    !threshold.trim() ||
    (Number.isFinite(Number(threshold)) &&
      Number(threshold) >= 0 &&
      value != null &&
      value >= Number(threshold));
  const eligible = tokens.filter((t) => {
    const d = fresh(t),
      links = tokenSocialLinks([...(t.links ?? []), ...(listings?.[t.mint]?.links ?? [])]);
    return (
      (!(controls.query ?? '').trim() ||
        [t.mint, t.name, t.symbol].some((v) =>
          v.toLowerCase().includes(controls.query!.trim().toLowerCase()),
        )) &&
      minimum(
        freshPulseValue(t.marketCapUsd, t.marketCapUsdAt, now) ?? d?.marketCapUsd,
        controls.minCap,
      ) &&
      minimum(d?.liquidityUsd, controls.minLiquidity) &&
      minimum(d?.volume24h, controls.minVolume) &&
      (!controls.maxAge.trim() ||
        (Number.isFinite(Number(controls.maxAge)) &&
          Number(controls.maxAge) >= 0 &&
          now - (t.migrationEventAt ?? t.migrationVerifiedAt ?? t.firstSeenAt) <=
            Number(controls.maxAge) * 60000)) &&
      (!controls.images || !!(t.icon || listings?.[t.mint]?.icon)) &&
      (!controls.socials || links.length > 0) &&
      (!controls.authorities ||
        (t.mintAuthorityDisabled === true && t.freezeAuthorityDisabled === true))
    );
  });
  const sort =
    controls.sort === 'global'
      ? globalSort === 'cap'
        ? 'capSol'
        : globalSort === 'progress'
          ? 'progress'
          : 'newest'
      : controls.sort;
  const value = (t: PulseToken) => {
    const d = fresh(t);
    switch (sort) {
      case 'capUsd':
        return freshPulseValue(t.marketCapUsd, t.marketCapUsdAt, now) ?? d?.marketCapUsd;
      case 'capSol':
        return t.marketCapSol;
      case 'volume':
        return d?.volume24h;
      case 'liquidity':
        return d?.liquidityUsd;
      case 'activity':
        return d?.buys5m != null && d.sells5m != null ? d.buys5m + d.sells5m : null;
      case 'progress':
        return t.progressVerifiedAt && now - t.progressVerifiedAt <= 60000
          ? t.curveProgressPct
          : null;
      default:
        return t.migrationEventAt ?? t.migrationVerifiedAt ?? t.firstSeenAt;
    }
  };
  return [...eligible].sort(
    (a, b) => (value(b) ?? -Infinity) - (value(a) ?? -Infinity) || b.lastSeenAt - a.lastSeenAt,
  );
}
