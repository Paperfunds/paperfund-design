import { useState } from 'react';
import { tokenImageCandidates } from './token-image.js';
export function ContractAddress({ mint, compact = false }: { mint: string; compact?: boolean }) {
  const [state, setState] = useState('Copy contract');
  return (
    <span className="pf-contract">
      <code title={mint}>{compact ? mint.slice(0, 4) + '…' + mint.slice(-4) : mint}</code>
      <button
        type="button"
        aria-label={'Copy contract ' + mint}
        title={state}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(mint);
            setState('Copied');
          } catch {
            setState('Copy unavailable; select the address');
          }
        }}
      >
        {state === 'Copied' ? '✓' : '⧉'}
      </button>
    </span>
  );
}
export function TokenAvatar({
  symbol,
  icon,
  fallbackIcon,
}: {
  symbol: string;
  icon?: string | null | undefined;
  fallbackIcon?: string | null | undefined;
}) {
  const candidates = tokenImageCandidates(icon, fallbackIcon);
  return <AvatarImage key={candidates.join('|')} symbol={symbol} candidates={candidates} />;
}
function AvatarImage({ symbol, candidates }: { symbol: string; candidates: string[] }) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const current = candidates[index];
  const initials =
    Array.from(symbol.replace(/[^\p{L}\p{N}]/gu, ''))
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'PF';
  return (
    <span
      className="pf-pulse-avatar"
      data-image-state={loaded ? 'loaded' : current ? 'loading' : 'fallback'}
      title={
        loaded
          ? 'Token metadata image; artwork/ownership is not endorsed'
          : 'Metadata image unavailable'
      }
    >
      <span aria-hidden="true">{initials}</span>
      {current && (
        <img
          key={current}
          src={current}
          alt=""
          loading="lazy"
          decoding="async"
          width={44}
          height={44}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setIndex((value) => value + 1);
          }}
        />
      )}
    </span>
  );
}
