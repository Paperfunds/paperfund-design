// Explicit environment selection; never merge Practice and authoritative competition balances.
export const competitionTrading = import.meta.env.VITE_TRADING_ACCOUNT === 'competition';
export function tradeUrl(mint: string, amount?: string) {
  return (
    (competitionTrading ? '/trade' : '/practice') +
    '?mint=' +
    encodeURIComponent(mint) +
    (amount ? '&amount=' + encodeURIComponent(amount) : '')
  );
}
