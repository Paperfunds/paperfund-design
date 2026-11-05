import { useState } from 'react';
import { buyPresets } from './PulseBuy.js';

export function TradePresets({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect(value: string): void;
}) {
  const [values, setValues] = useState<string[]>(() => {
    try {
      return (
        buyPresets(JSON.parse(localStorage.getItem('pf.pulse.buy-presets') ?? 'null')) ?? [
          '0.01',
          '0.1',
          '0.5',
        ]
      );
    } catch {
      return ['0.01', '0.1', '0.5'];
    }
  });
  const [draft, setDraft] = useState(values),
    [error, setError] = useState('');
  return (
    <div className="pf-trade-presets">
      <div className="pf-ticket-presets">
        {values.map((v) => (
          <button key={v} disabled={disabled} onClick={() => onSelect(v)}>
            {v} Paper SOL
          </button>
        ))}
      </div>
      <details>
        <summary>Customize buy presets</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!buyPresets(draft)) {
              setError('Use three different positive amounts, with at most nine decimals.');
              return;
            }
            setValues(draft);
            setError('');
            try {
              localStorage.setItem('pf.pulse.buy-presets', JSON.stringify(draft));
            } catch {
              /* Preferences are optional. */
            }
            e.currentTarget.closest('details')?.removeAttribute('open');
          }}
        >
          <small>Shared with Pulse · Paper SOL</small>
          {draft.map((v, i) => (
            <input
              key={i}
              aria-label={'Trade buy preset ' + (i + 1)}
              value={v}
              inputMode="decimal"
              maxLength={24}
              disabled={disabled}
              onChange={(e) => setDraft((d) => d.map((n, j) => (i === j ? e.target.value : n)))}
            />
          ))}
          <button disabled={disabled}>Save buy presets</button>
          {error && <p role="alert">{error}</p>}
        </form>
      </details>
    </div>
  );
}
