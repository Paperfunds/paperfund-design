// @vitest-environment jsdom
import { expect, it, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useOrderPending } from './use-order-pending.js';
function Ticket() {
  const pending = useOrderPending();
  return <button disabled={pending}>Submit simulated order</button>;
}
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it('blocks every ticket through both journal and cross-tab changes, then unlocks only after clearing', () => {
  localStorage.clear();
  render(<Ticket />);
  expect(screen.getByRole('button')).toBeEnabled();
  act(() => {
    localStorage.setItem('pf.unresolved-order.v1', 'even-malformed-intents-must-hold');
    window.dispatchEvent(new Event('paperfund:order-journal'));
  });
  expect(screen.getByRole('button')).toBeDisabled();
  act(() => {
    localStorage.removeItem('pf.unresolved-order.v1');
    window.dispatchEvent(new StorageEvent('storage'));
  });
  expect(screen.getByRole('button')).toBeEnabled();
});
