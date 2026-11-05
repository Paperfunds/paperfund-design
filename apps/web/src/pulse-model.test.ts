import { describe, expect, it } from 'vitest';
import {
  decodePulseSnapshot,
  decodePulseToken,
  pulseApiPath,
  hydratePulsePages,
  stageTokens,
  tokenAge,
} from './pulse-model.js';

const mint = '8NuGjbo1ZcUL3iVCy1hQHJeEABSK6V2D1xpRpHbVpump';
const record = {
  mint,
  name: '<b>New</b>',
  symbol: 'PUMP',
  stage: 'new',
  firstSeenAt: 1793440000000,
  lastSeenAt: 1793440001000,
  source: 'pumpportal',
  marketCapSol: 12,
  verifiedAt: 1793440000000,
  curveProgressPct: null,
};
describe('public launch feed safety', () => {
  it('deduplicates mint identity while preserving separate same-name contracts and hydrates later pages', async () => {
    const time = record.lastSeenAt,
      other = '4z2U17CxAFoL9zD1iH47P9tHkfxYZ91kFN5QYqVbU5pB';
    const snapshot = decodePulseSnapshot({
      status: 'live',
      receivedAt: time,
      nextCursor: mint,
      tokens: [record, { ...record, marketCapSol: 99 }],
    })!;
    expect(snapshot.tokens).toHaveLength(1);
    expect(snapshot.tokens[0]?.marketCapSol).toBe(99);
    const loaded = await hydratePulsePages(snapshot, async (cursor) => {
      expect(cursor).toBe(mint);
      return { status: 'live', receivedAt: time, tokens: [{ ...record, mint: other }] };
    });
    expect(loaded.tokens).toHaveLength(2);
    expect(stageTokens(loaded, 'new', '', time)).toHaveLength(2);
    expect(loaded.nextCursor).toBeNull();
    await expect(
      hydratePulsePages(snapshot, async () => ({
        status: 'live',
        receivedAt: time,
        nextCursor: mint,
        tokens: [],
      })),
    ).rejects.toThrow('CURSOR_REPEATED');
  });
  it('excludes stale or below-threshold migrations entirely and recomputes the exact age boundary without a new event', () => {
    const time = record.lastSeenAt;
    const state = (token: object) =>
      decodePulseSnapshot({ status: 'live', receivedAt: time, tokens: [{ ...record, ...token }] })!;
    const near = state({
      createdAt: time - 3599999,
      creationVerifiedAt: time,
      marketCapUsd: 7000.01,
      marketCapUsdAt: time,
    });
    expect(stageTokens(near, 'stretch', '', time)).toHaveLength(1);
    expect(stageTokens(near, 'stretch', '', time + 1)).toHaveLength(0);
    expect(stageTokens(near, 'new', '', time + 1)).toHaveLength(1);
    for (const volume24hUsd of [null, 49999.99]) {
      const s = state({ migrationVerifiedAt: time, volume24hUsd, marketObservedAt: time });
      for (const stage of ['new', 'stretch', 'migrated'] as const)
        expect(stageTokens(s, stage, '', time)).toHaveLength(0);
    }
    const s = state({ migrationVerifiedAt: time, volume24hUsd: 50000, marketObservedAt: time });
    expect(stageTokens(s, 'migrated', '', time)).toHaveLength(1);
    expect(stageTokens(s, 'migrated', '', time + 120001)).toHaveLength(0);
  });
  it('rejects fake or malformed mints and invalid lifecycle events', () => {
    expect(decodePulseToken({ ...record, mint: 'https://bad.site' })).toBeNull();
    expect(decodePulseToken({ ...record, stage: 'paid' })).toBeNull();
    expect(decodePulseToken({ ...record, source: 'axiom' })).toBeNull();
    expect(decodePulseToken({ ...record, curveProgressPct: 100000 })?.curveProgressPct).toBeNull();
    expect(decodePulseToken({ ...record, lastSeenAt: 1 })).toBeNull();
  });
  it('keeps harmless text content but never makes it HTML', () => {
    expect(decodePulseToken(record)?.name).toBe('<b>New</b>');
  });
  it('does not invent tokens or replace unavailable data with fake records', () => {
    expect(
      decodePulseSnapshot({ status: 'disabled', receivedAt: 1793440000000, tokens: [] })?.tokens,
    ).toEqual([]);
    expect(
      decodePulseSnapshot({ status: 'live', receivedAt: 1793440000000, tokens: [record] })?.tokens,
    ).toHaveLength(1);
    expect(
      decodePulseSnapshot({ status: 'fake', receivedAt: 1793440000000, tokens: [] }),
    ).toBeNull();
  });
  it('groups actual lifecycle events without inventing Pre-Migration data', () => {
    const data = decodePulseSnapshot({
      status: 'live',
      receivedAt: 1793440000000,
      tokens: [
        record,
        {
          ...record,
          stage: 'migrated',
          migrationVerifiedAt: 1793440000000,
          volume24hUsd: 50000,
          marketObservedAt: 1793440000000,
          mint: '4z2U17CxAFoL9zD1iH47P9tHkfxYZ91kFN5QYqVbU5pB',
        },
      ],
    })!;
    expect(stageTokens(data, 'new', '', 1793440000000).map((x) => x.mint)).toEqual([mint]);
    expect(stageTokens(data, 'stretch', '', 1793440000000)).toEqual([]);
    expect(stageTokens(data, 'migrated', '', 1793440000000)).toHaveLength(1);
  });
  it('routes only to the same-origin read-only feed', () => {
    expect(pulseApiPath('events')).toBe('/pulse-feed/events');
    expect(tokenAge(1793440000000, 1793440069000)).toBe('1m');
  });
  it('moves the same mint between stages only with fresh USD rules and verified migration', () => {
    const time = 1793440001000;
    const launch = decodePulseSnapshot({ status: 'live', receivedAt: time, tokens: [record] })!;
    expect(stageTokens(launch, 'new', '', time)).toHaveLength(1);
    const near = decodePulseSnapshot({
      status: 'live',
      receivedAt: time,
      tokens: [
        {
          ...record,
          progressVerifiedAt: time,
          curveProgressPct: 95,
          createdAt: time,
          creationVerifiedAt: time,
          marketCapUsd: 8000,
          marketCapUsdAt: time,
        },
      ],
    })!;
    expect(stageTokens(near, 'new', '', time)).toHaveLength(0);
    expect(stageTokens(near, 'stretch', '', time)).toHaveLength(1);
    const migrated = decodePulseSnapshot({
      status: 'live',
      receivedAt: time + 2000,
      tokens: [
        {
          ...record,
          progressVerifiedAt: time,
          curveProgressPct: 95,
          createdAt: time,
          creationVerifiedAt: time,
          marketCapUsd: 8000,
          marketCapUsdAt: time,
          migrationVerifiedAt: time + 2000,
          volume24hUsd: 50000,
          marketObservedAt: time + 2000,
        },
      ],
    })!;
    expect(stageTokens(migrated, 'stretch', '', time + 2000)).toHaveLength(0);
    expect(stageTokens(migrated, 'migrated', '', time + 2000).map((t) => t.mint)).toEqual([mint]);
  });
});
