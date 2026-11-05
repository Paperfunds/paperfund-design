export interface PracticePosition {
  mint: string;
  quantity: string;
  basis: string;
  decimals: number;
}
export interface PracticeFill {
  id: string;
  mint: string;
  side: 'BUY' | 'SELL';
  input: string;
  output: string;
  fee: string;
  decimals: number;
  at: number;
  realizedPnl: string;
  protocol: string;
}
export interface PracticeAccount {
  mode: 'PRACTICE';
  rewardEligible: false;
  wallet: string;
  cash: string;
  positions: PracticePosition[];
  trades: PracticeFill[];
}
export interface PracticeQuote {
  id: string;
  mint: string;
  side: 'BUY' | 'SELL';
  requestedInput?: string;
  input: string;
  output: string;
  fee: string;
  decimals: number;
  minimumOutput: string;
  expires: number;
  protocol: string;
  slot: string;
}
