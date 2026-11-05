import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchPublicPairs, validMint } from './market-discovery.js';
import type { ChartExecution } from './trade-markers.js';

export function WebsiteMarketPicker({
  selectedMint,
  onSelect,
}: {
  selectedMint: string;
  onSelect(mint: string): void;
}) {
  const [term, setTerm] = useState(selectedMint);
  const [debounced, setDebounced] = useState('');
  const [error, setError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => setTerm(selectedMint), [selectedMint]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [term]);
  const mintQuery = Boolean(validMint(debounced));
  const search = useQuery({
    queryKey: ['public-token-search', debounced],
    queryFn: () => searchPublicPairs(debounced),
    enabled: debounced.length >= 3 && !mintQuery,
    retry: false,
    staleTime: 60_000,
  });
  const uniqueTokens = new Set<string>();
  const results = (search.data ?? [])
    .filter((pair) => {
      const mint = pair.baseToken?.address;
      if (!mint || !validMint(mint) || uniqueTokens.has(mint)) return false;
      uniqueTokens.add(mint);
      return true;
    })
    .slice(0, 6);
  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const mint = validMint(term);
    if (!mint) {
      setError('Enter a valid Solana token address, or choose a token from the search results.');
      return;
    }
    setError('');
    setSearchOpen(false);
    onSelect(mint);
  }
  return (
    <section
      className="pf-website-picker"
      aria-label="Find a token to paper trade"
      onFocusCapture={() => setSearchOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setSearchOpen(false);
      }}
    >
      <div className="pf-website-picker-heading">
        <div>
          <span className="eyebrow">LIVE MARKET DISCOVERY</span>
          <h2>Find a token. Trade with Paper SOL.</h2>
        </div>
        <span className="pf-web-label">No extension required</span>
      </div>
      <form className="pf-web-search" onSubmit={handleSearch}>
        <label htmlFor="pf-web-mint-search" className="sr-only">
          Token symbol, name or mint address
        </label>
        <input
          id="pf-web-mint-search"
          autoComplete="off"
          aria-expanded={searchOpen && results.length > 0 && !mintQuery}
          aria-controls="pf-token-search-results"
          aria-describedby="pf-token-search-status"
          aria-invalid={!!error}
          value={term}
          maxLength={80}
          onChange={(event) => {
            setTerm(event.target.value);
            setSearchOpen(true);
            setError('');
          }}
          placeholder="Search token name, symbol, or paste CA"
        />
        <button type="submit" className="button primary" disabled={!term.trim()}>
          Open token
        </button>
      </form>
      {error && (
        <p role="alert" className="pf-web-picker-alert">
          {error}
        </p>
      )}
      <p
        id="pf-token-search-status"
        className="pf-web-picker-note pf-web-search-status"
        role="status"
      >
        {search.isFetching
          ? 'Searching public Solana market listings…'
          : search.isError
            ? 'External search unavailable. Paste a mint address to trade directly.'
            : debounced.length >= 3 && !mintQuery && search.isSuccess && results.length === 0
              ? 'No indexed matches. You can still paste a token mint directly.'
              : '\u00a0'}
      </p>
      {searchOpen && results.length > 0 && !mintQuery && (
        <div
          id="pf-token-search-results"
          className="pf-web-search-results"
          aria-label="External token search results"
        >
          {results.map((pair) => (
            <button
              key={pair.baseToken!.address}
              type="button"
              onClick={() => {
                setTerm(pair.baseToken!.address!);
                setError('');
                setSearchOpen(false);
                onSelect(pair.baseToken!.address!);
              }}
            >
              <span>
                <strong>{pair.baseToken?.symbol || 'Token'}</strong>{' '}
                <small>{pair.baseToken?.name || 'Solana market'}</small>
              </span>
              <small className="pf-web-result-mint">
                {pair.baseToken?.address?.slice(0, 5)}…{pair.baseToken?.address?.slice(-5)}
              </small>
            </button>
          ))}
        </div>
      )}
      <p className="pf-web-picker-note">
        Search and charts are external market information, not execution quotes. Paperfund
        independently verifies the mint and prices each trade.
      </p>
    </section>
  );
}

const MarketPriceChart = lazy(() =>
  import('./PriceChart.js').then((m) => ({ default: m.PriceChart })),
);
export function WebsiteMarketChart({
  mint,
  fills = [],
  currentSupply,
  onPoolChange,
}: {
  mint: string;
  fills?: ChartExecution[];
  currentSupply?: number | undefined;
  onPoolChange?: ((pool: string) => void) | undefined;
}) {
  return (
    <Suspense fallback={<div className="pf-chart-empty">Loading market chart…</div>}>
      <MarketPriceChart
        mint={mint}
        fills={fills}
        currentSupply={currentSupply}
        onPoolChange={onPoolChange}
      />
    </Suspense>
  );
}
