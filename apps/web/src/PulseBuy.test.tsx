import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PulseBuyDialog, PulseBuyToolbar, usePulseBuy, buyPresets } from './PulseBuy.js';
import {
  practiceApi,
  PracticeError,
  type PracticeAccount,
  type PracticeQuote,
} from './practice-api.js';
import { signInPractice } from './practice-auth.js';
vi.mock('./practice-auth.js', () => ({ signInPractice: vi.fn() }));
const mint = 'So11111111111111111111111111111111111111112';
const other = 'BJVWrJnwMkZ5upJcQqeQ4eShsfuvcEgzxnr6jprBpump';
const account: PracticeAccount = {
  mode: 'PRACTICE',
  rewardEligible: false,
  wallet: other,
  cash: '10000000000',
  positions: [],
  trades: [],
};
const quote = (): PracticeQuote => ({
  id: 'fixture-quote',
  mint,
  side: 'BUY',
  input: '10000000',
  output: '1000000',
  minimumOutput: '990000',
  fee: '1000',
  decimals: 6,
  protocol: 'TEST_FIXTURE',
  slot: '1',
  expires: Date.now() + 15000,
});
const fill = {
  id: 'fixture-fill',
  mint,
  side: 'BUY' as const,
  input: '10000000',
  output: '1000000',
  fee: '1000',
  decimals: 6,
  protocol: 'TEST_FIXTURE',
  at: Date.now(),
  realizedPnl: '0',
};
function Harness() {
  const buy = usePulseBuy();
  return (
    <>
      <PulseBuyToolbar buy={buy} />
      <button onClick={() => buy.choose(mint, 'FIXTURE', '0.01')}>Choose fixture</button>
      <button onClick={() => buy.choose(other, 'OTHER', '0.1')}>Choose another</button>
      <PulseBuyDialog buy={buy} />
    </>
  );
}
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => vi.restoreAllMocks());
async function signed() {
  vi.spyOn(practiceApi, 'account').mockResolvedValue(account);
  show();
  await screen.findByText(/10 Paper SOL/);
}
describe('Pulse quick PAPER BUY uses the existing backend', () => {
  it('previews the exact integer amount and confirms only with the server quote ID', async () => {
    const pricing = vi.spyOn(practiceApi, 'quote').mockResolvedValue(quote());
    const trade = vi.spyOn(practiceApi, 'trade').mockResolvedValue(fill);
    await signed();
    const user = userEvent.setup();
    await user.click(screen.getByText('Choose fixture'));
    await screen.findByRole('button', { name: 'Confirm PAPER BUY' });
    expect(pricing).toHaveBeenCalledWith(mint, 'BUY', '10000000', 100);
    expect(trade).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm PAPER BUY' }));
    await screen.findByText(/PAPER BUY filled/);
    expect(trade).toHaveBeenCalledWith('fixture-quote', expect.any(String));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/SOL Paper SOL/)).toBeNull();
  });
  it('retains the same idempotency intent after response loss and blocks a second token order', async () => {
    const pricing = vi.spyOn(practiceApi, 'quote').mockResolvedValue(quote());
    const trade = vi
      .spyOn(practiceApi, 'trade')
      .mockRejectedValueOnce(new PracticeError('NETWORK_UNCERTAIN', 'Interrupted', 0))
      .mockResolvedValue(fill);
    await signed();
    const user = userEvent.setup();
    await user.click(screen.getByText('Choose fixture'));
    await user.click(await screen.findByRole('button', { name: 'Confirm PAPER BUY' }));
    const retry = await screen.findByRole('button', { name: 'Retry same PAPER order' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.click(screen.getByText('Choose another'));
    expect(pricing).toHaveBeenCalledTimes(1);
    await user.click(retry);
    await screen.findByText(/PAPER BUY filled/);
    expect(trade.mock.calls[0]).toEqual(trade.mock.calls[1]);
  });
  it('does not duplicate an in-flight click', async () => {
    vi.spyOn(practiceApi, 'quote').mockResolvedValue(quote());
    let finish!: (v: typeof fill) => void;
    const trade = vi.spyOn(practiceApi, 'trade').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await signed();
    await userEvent.click(screen.getByText('Choose fixture'));
    const button = await screen.findByRole('button', { name: 'Confirm PAPER BUY' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(trade).toHaveBeenCalledTimes(1));
    finish(fill);
    await screen.findByText(/PAPER BUY filled/);
  });
  it('refuses mismatched or already-expired quote responses', async () => {
    const trade = vi.spyOn(practiceApi, 'trade');
    vi.spyOn(practiceApi, 'quote').mockResolvedValue({ ...quote(), mint: other });
    await signed();
    await userEvent.click(screen.getByText('Choose fixture'));
    await screen.findByText(/quote does not match/);
    expect(screen.queryByRole('button', { name: 'Confirm PAPER BUY' })).toBeNull();
    expect(trade).not.toHaveBeenCalled();
  });
  it('requires an authenticated Practice account before reading a quote', async () => {
    vi.spyOn(practiceApi, 'account').mockRejectedValue(
      new PracticeError('PRACTICE_SIGN_IN_REQUIRED', 'Sign in', 401),
    );
    const pricing = vi.spyOn(practiceApi, 'quote');
    show();
    await userEvent.click(screen.getByText('Choose fixture'));
    await screen.findByRole('button', { name: 'Sign in to Practice' });
    expect(pricing).not.toHaveBeenCalled();
  });
  it('rejects invalid preset preferences instead of submitting malformed amounts', () => {
    expect(buyPresets(['0.01', '0.1', '0.5'])).toEqual(['0.01', '0.1', '0.5']);
    for (const v of [
      ['0', '1', '2'],
      ['0.1', '0.10', '1'],
      ['NaN', '1', '2'],
      ['0.0000000001', '1', '2'],
      ['1', '2'],
    ])
      expect(buyPresets(v)).toBeNull();
  });
  it('stores configured presets and preserves the supported slippage choices', async () => {
    await signed();
    const user = userEvent.setup();
    await user.click(screen.getByText(/Buy presets/));
    await user.clear(screen.getByLabelText('Paper buy preset 1'));
    await user.type(screen.getByLabelText('Paper buy preset 1'), '0.02');
    await user.selectOptions(screen.getByLabelText('Pulse buy slippage'), '300');
    await user.click(screen.getByRole('button', { name: 'Save presets' }));
    expect(JSON.parse(localStorage.getItem('pf.pulse.buy-presets')!)[0]).toBe('0.02');
  });
  it('clears an uncertain intent only when the backend proves the quote expired without a committed result', async () => {
    vi.spyOn(practiceApi, 'quote').mockResolvedValue(quote());
    vi.spyOn(practiceApi, 'trade')
      .mockRejectedValueOnce(new PracticeError('NETWORK_UNCERTAIN', 'Interrupted', 0))
      .mockRejectedValueOnce(new PracticeError('QUOTE_EXPIRED', 'Expired without prior fill', 409));
    await signed();
    await userEvent.click(screen.getByText('Choose fixture'));
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm PAPER BUY' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Retry same PAPER order' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Retry same PAPER order' })).toBeNull();
  });
  it('reauthenticates via the shared normal wallet sign-in function', async () => {
    const a = vi
      .spyOn(practiceApi, 'account')
      .mockRejectedValueOnce(new PracticeError('PRACTICE_SIGN_IN_REQUIRED', 'Sign in', 401))
      .mockResolvedValue(account);
    vi.mocked(signInPractice).mockResolvedValue({ wallet: account.wallet });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Connect Practice wallet' }));
    await screen.findByText(/10 Paper SOL/);
    expect(signInPractice).toHaveBeenCalled();
    expect(a.mock.calls.length).toBeGreaterThan(1);
  });
});
