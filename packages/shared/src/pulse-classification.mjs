// Display discovery rules only. Never use these marks for execution, accounting or settlement.
export const PULSE_MARKET_TTL_MS = 120000;
export const PULSE_PRE_MIGRATION_AGE_MS = 3600000;
export const PULSE_PRE_MIGRATION_CAP_USD = 7000;
export const PULSE_MIGRATED_VOLUME_USD = 50000;
// Exact decimal multiplication of display inputs avoids crossing a strict threshold on binary rounding noise.
export function decimalMarkProduct(a, b, decimalShift = 0) {
  const parse = (value) => {
    const m = String(value).match(/^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
    return m
      ? { n: BigInt(m[1] + (m[2] ?? '')), e: Number(m[3] ?? 0) - (m[2]?.length ?? 0) }
      : null;
  };
  const left = parse(a),
    right = parse(b);
  if (!left || !right) return null;
  const result = Number((left.n * right.n).toString() + 'e' + (left.e + right.e - decimalShift));
  return Number.isFinite(result) && result >= 0 ? result : null;
}
export function decimalMarkSum(values) {
  const parts = values.map((value) => {
    const m = String(value).match(/^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
    return m
      ? { n: BigInt(m[1] + (m[2] ?? '')), e: Number(m[3] ?? 0) - (m[2]?.length ?? 0) }
      : null;
  });
  if (parts.some((p) => !p)) return null;
  const exponent = Math.min(0, ...parts.map((p) => p.e));
  const value = Number(
    parts.reduce((sum, p) => sum + p.n * 10n ** BigInt(p.e - exponent), 0n).toString() +
      'e' +
      exponent,
  );
  return Number.isFinite(value) ? value : null;
}
export function freshPulseValue(value, at, now, ttl = PULSE_MARKET_TTL_MS) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    typeof at === 'number' &&
    at > 0 &&
    at <= now &&
    now - at <= ttl
    ? value
    : null;
}
export function classifyPulseToken(token, now = Date.now()) {
  if (!token.verifiedAt || token.verificationState === 'rejected')
    return { stage: null, reason: 'IDENTITY_NOT_VERIFIED' };
  if (token.migrationVerifiedAt) {
    const volume = freshPulseValue(token.volume24hUsd, token.marketObservedAt, now);
    if (volume === null) return { stage: null, reason: 'MIGRATED_VOLUME_MISSING_OR_STALE' };
    return volume >= PULSE_MIGRATED_VOLUME_USD
      ? { stage: 'migrated', reason: null }
      : { stage: null, reason: 'MIGRATED_VOLUME_BELOW_50000' };
  }
  if (token.complete) return { stage: null, reason: 'MIGRATION_VERIFICATION_PENDING' };
  const cap = freshPulseValue(token.marketCapUsd, token.marketCapUsdAt, now);
  const age = token.creationVerifiedAt && token.createdAt ? now - token.createdAt : null;
  if (
    age !== null &&
    age >= 0 &&
    age < PULSE_PRE_MIGRATION_AGE_MS &&
    cap !== null &&
    cap > PULSE_PRE_MIGRATION_CAP_USD
  )
    return { stage: 'stretch', reason: null }; // Stable internal preference key; UI calls this Pre-Migration.
  return {
    stage: 'new',
    reason:
      cap === null ? 'USD_CAP_MISSING_OR_STALE' : age === null ? 'CREATION_TIME_UNVERIFIED' : null,
  };
}
export function curveCapToUsd(capSol, curveAt, solUsd, fxAt, now = Date.now()) {
  const cap = freshPulseValue(capSol, curveAt, now, 60000),
    fx = freshPulseValue(solUsd, fxAt, now);
  return cap !== null && fx !== null && fx > 0 ? decimalMarkProduct(cap, fx) : null;
}
