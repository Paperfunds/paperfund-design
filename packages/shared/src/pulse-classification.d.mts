export const PULSE_MARKET_TTL_MS: number;
export const PULSE_PRE_MIGRATION_AGE_MS: number;
export const PULSE_PRE_MIGRATION_CAP_USD: number;
export const PULSE_MIGRATED_VOLUME_USD: number;
export function decimalMarkProduct(
  a: number | string,
  b: number | string,
  decimalShift?: number,
): number | null;
export function decimalMarkSum(values: (number | string)[]): number | null;
export function freshPulseValue(
  value: unknown,
  at: unknown,
  now: number,
  ttl?: number,
): number | null;
export function curveCapToUsd(
  capSol: unknown,
  curveAt: unknown,
  solUsd: unknown,
  fxAt: unknown,
  now?: number,
): number | null;
export function classifyPulseToken(
  token: {
    verifiedAt?: number | null;
    verificationState?: string;
    migrationVerifiedAt?: number | null;
    complete?: boolean;
    createdAt?: number | null;
    creationVerifiedAt?: number | null;
    marketCapUsd?: number | null;
    marketCapUsdAt?: number | null;
    volume24hUsd?: number | null;
    marketObservedAt?: number | null;
  },
  now?: number,
): { stage: 'new' | 'stretch' | 'migrated' | null; reason: string | null };
