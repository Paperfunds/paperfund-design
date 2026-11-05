import { defaultColumn, type ColumnControls } from './pulse-controls.js';
export function PulseColumnControls({
  title,
  value,
  onChange,
}: {
  title: string;
  value: ColumnControls;
  onChange(value: ColumnControls): void;
}) {
  const count = Object.keys(defaultColumn).filter(
    (k) =>
      (value[k as keyof ColumnControls] ?? defaultColumn[k as keyof ColumnControls]) !==
      defaultColumn[k as keyof ColumnControls],
  ).length;
  return (
    <details className="pf-column-controls">
      <summary aria-label={'Filters for ' + title}>
        ⚙ <span>{count ? `${count} active` : 'Filters'}</span>
      </summary>
      <div className="pf-column-options">
        <strong>{title} controls</strong>
        <label>
          Sort
          <select
            aria-label={title + ' sort'}
            value={value.sort}
            onChange={(e) => onChange({ ...value, sort: e.target.value as ColumnControls['sort'] })}
          >
            {[
              ['global', 'Use global sort'],
              ['newest', 'Newest observed'],
              ['capUsd', 'Market cap · USD'],
              ['capSol', 'Curve market cap · SOL'],
              ['volume', '24h volume · USD'],
              ['liquidity', 'Liquidity · USD'],
              ['activity', '5m transactions'],
              ['progress', 'Verified curve progress'],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search this column
          <input
            aria-label={title + ' search'}
            value={value.query ?? ''}
            maxLength={80}
            placeholder="Name, symbol or contract"
            onChange={(e) => onChange({ ...value, query: e.target.value })}
          />
        </label>
        {(
          [
            ['minCap', 'Minimum MC · USD'],
            ['minLiquidity', 'Minimum liquidity · USD'],
            ['minVolume', 'Minimum 24h volume · USD'],
            ['maxAge', 'Maximum observed age · min'],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              aria-label={title + ' ' + label}
              type="number"
              inputMode="decimal"
              min="0"
              value={value[key]}
              placeholder="Any"
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            />
          </label>
        ))}
        {(
          [
            ['images', 'Has image metadata'],
            ['socials', 'Has listed social / website'],
            ['authorities', 'Mint & freeze authorities disabled'],
          ] as const
        ).map(([key, label]) => (
          <label className="pf-filter-check" key={key}>
            <input
              type="checkbox"
              checked={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
        <small>
          Unknown values do not pass numeric or authority filters. Identity checks are not safety
          endorsements.
        </small>
        <button className="pf-control" onClick={() => onChange({ ...defaultColumn })}>
          Reset {title}
        </button>
      </div>
    </details>
  );
}
