# Paperfund designer handoff

This package contains the current local React frontend and browser contracts, independent of the incomplete pushed branch. It is a design preview with clearly labeled synthetic fixtures. Authentication, order submission and real rewards are disabled. No production services, RPC credentials, wallet, PostgreSQL or Redis are required.

Use Node 22 or newer and npm 10 or newer. From this package root:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5230/pulse and http://127.0.0.1:5230/trade?mint=AxPzkSJKU3ACqZu7qpq8ov29g4BENZBM4SAZwUUUFo8M . `/practice` is separate from `/trade`. Other routes include `/hourly`, `/daily`, `/history`, `/rewards`, `/rules`, `/privacy` and `/support`. Deep links work through Vite's SPA fallback. The port is strict to prevent accidentally opening another local application.

`npm run build`, `npm run typecheck` and `npm test` validate the export. `npm run preview` serves the built assets with the same local fixtures. `.env.example` contains public local values only; defaults work without copying it. Never put Helius keys, DB URLs, signer material or production settings in a VITE variable.

## Components and styling

`apps/web/src/App.tsx` owns routing, account UI and the competition Trade composition. `Practice.tsx` owns the separate Practice page. `Pulse.tsx`, `PulseColumnControls.tsx`, `pulse-model.ts` and `use-pulse.ts` own discovery. `TokenMarketView.tsx`, `WebsiteMarkets.tsx`, `PriceChart.tsx` and `TerminalAnalytics.tsx` own informational market views. `CompetitionPulseBuy`, `CompetitionSummary`, `OrderRecovery`, `TradePresets` and the order-journal modules connect existing account behavior. Chart execution markers derive from persisted fills through `trade-markers.ts`.

`main.tsx` records the actual CSS import order. Global foundations are `styles`, `redesign`, `paperfund-brand` and `paperfund-night`; route and component layers follow, ending with `trade-workspace.css`. Prefer small component classes and preserve existing theme variables and focus states. Keep the approved dark purple identity; this task grants no new design approval.

Review at 1600px desktop, 768px tablet and 390px mobile. Preserve the dominant chart, collapsible/mobile ticket, horizontal analytics tabs, independent Pulse columns/search/filter/load-more, long addresses, empty histories, unavailable chart/metadata, retained stale observations, reconnect, disabled buttons, long errors and keyboard focus. Empty and unavailable are distinct from zero. The fixture middleware accepts `?state=unavailable` on fixture endpoints for outage work; changing fixture data is safe and isolated.

The default account fixture is empty. Add `&fixture=position` to the Trade URL for a synthetic open competition position and loss state, or `&fixture=unavailable` for an API outage state. These are display fixtures; order requests remain blocked in every state. Fixture market data intentionally differs from genuine live evidence, which is excluded from this designer package.

## Contracts and integration

Browser API types and exact amount formatting live in `packages/shared/src/browser.ts`, `apps/web/src/types.ts` and `practice-types.ts`. Account amounts, token quantities and P&L are integer strings; use BigInt helpers, never floating point for financial state. `api.ts` centralizes cookie-authenticated `/api/v1` requests, error envelopes, quotes, recovery and idempotency. `practice-api.ts` uses `/practice-api` and its own account. Do not merge these balances or change BUY/SELL, confirmation, slippage, quote binding, idempotency, uncertainty holds or execution markers during styling.

Market contracts: `/pulse-feed/snapshot` and named `snapshot` SSE `/pulse-feed/events` contain display discovery. `/pulse-feed/terminal/events?mint=&pool=` carries validated selected-pool swap snapshots/deltas; `market-trades.ts` owns one shared query/stream per client and pool, canonical order, deduplication, 1s candle projection and observed traders. `/terminal/holders?mint=` contains an atomic largest-account SAMPLE. `uniqueHolderCount` is null, not an inferred count. Developer relationships require an exact verified on-chain creator field. External trader P&L/cost basis is unavailable.

`MarketSyncStatus.tsx` and `market-synchronization.ts` expose independent chart/trade/holder/developer freshness. Observed price/volume/change describe a retained selected-pool sample; indexed rolling 24h numbers remain separately sourced. Use these helpers when integrating the data work into the final header. Never replace missing data with zero or label a fixture as live mainnet.

`designer-entry.ts`, `designer/transport.ts`, `designer/fixtures.mjs` and `designer/vite.config.ts` are export-only preview wiring. They intercept provider reads locally, reject all mutations and make no proxy to protected services. Do not import this wiring into production. A visible fixture banner is mandatory. Tests may use their own mocks; fixture values prove layout, not live data, trading correctness or financial qualification.

Submit a patch/PR containing frontend components, styles/assets and any agreed browser-contract additions. Coordinate App, Practice, chart, token-market composition, ticket and marker changes with the active Trade implementer before merging. Keep backend execution, financial controls, public routing and operator files outside the design scope.

The original repository/worktree branch includes financial implementation and its historical commits. Share only this reviewed frontend export with its generated lockfile and SOURCE_MANIFEST, using a separate repository without inherited history after explicit owner publication approval. Do not push or make any repository public under this task.
