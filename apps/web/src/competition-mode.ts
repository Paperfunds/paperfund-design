// Presentation only. Admission and financial authority always remain server-side.
export const isolatedCompetitionTest = import.meta.env.VITE_COMPETITION_MODE === 'isolated-test';
export const productionCompetition = import.meta.env.VITE_COMPETITION_MODE === 'production';
export const liveCompetitionTest =
  isolatedCompetitionTest && import.meta.env.VITE_LIVE_COMPETITION_TEST === 'true';
export const competitionRewardUnit = isolatedCompetitionTest ? 'TEST units · no cash value' : 'SOL';
