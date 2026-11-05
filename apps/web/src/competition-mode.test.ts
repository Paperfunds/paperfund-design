import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it('labels isolated allocations as test units without cash value', async () => {
  vi.stubEnv('VITE_COMPETITION_MODE', 'isolated-test');
  const mode = await import('./competition-mode.js');
  expect(mode.isolatedCompetitionTest).toBe(true);
  expect(mode.productionCompetition).toBe(false);
  expect(mode.competitionRewardUnit).toBe('TEST units · no cash value');
});
it('requires an explicit production build label', async () => {
  vi.stubEnv('VITE_COMPETITION_MODE', 'production');
  const mode = await import('./competition-mode.js');
  expect(mode.productionCompetition).toBe(true);
  expect(mode.isolatedCompetitionTest).toBe(false);
});
it('labels live-market test mode only inside an explicitly isolated build', async () => {
  vi.stubEnv('VITE_COMPETITION_MODE', 'isolated-test');
  vi.stubEnv('VITE_LIVE_COMPETITION_TEST', 'true');
  expect((await import('./competition-mode.js')).liveCompetitionTest).toBe(true);
  vi.resetModules();
  vi.stubEnv('VITE_COMPETITION_MODE', 'production');
  expect((await import('./competition-mode.js')).liveCompetitionTest).toBe(false);
});
it('does not infer production authority from an unknown mode', async () => {
  vi.stubEnv('VITE_COMPETITION_MODE', '');
  const mode = await import('./competition-mode.js');
  expect(mode.productionCompetition).toBe(false);
  expect(mode.isolatedCompetitionTest).toBe(false);
});
