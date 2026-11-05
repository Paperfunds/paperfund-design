import { it, expect } from 'vitest';
import { matchesPracticeInput } from './practice-api.js';
import type { PracticeQuote } from './practice-types.js';
it('accepts an actual-spend BUY under the exact budget, but never a different budget or a partial SELL', () => {
  const q = { side: 'BUY', input: '9999999', requestedInput: '10000000' } as PracticeQuote;
  expect(matchesPracticeInput(q, '10000000')).toBe(true);
  expect(matchesPracticeInput(q, '10000001')).toBe(false);
  expect(matchesPracticeInput({ ...q, input: '10000001' }, '10000000')).toBe(false);
  expect(matchesPracticeInput({ ...q, input: '0' }, '10000000')).toBe(false);
  expect(matchesPracticeInput({ ...q, side: 'SELL' }, '10000000')).toBe(false);
  expect(matchesPracticeInput({ ...q, input: '10000000' }, '10000000')).toBe(true);
});
