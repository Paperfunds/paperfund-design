// Installed only by designer-entry.ts in the sanitized export. Never imported by production main.
const original = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href);
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  if (method !== 'GET' && method !== 'HEAD') return Promise.resolve(Response.json({ error: { code: 'DESIGN_ONLY', message: 'Designer preview: authentication and order execution disabled.' } }, { status: 403 }));
  if (url.origin !== location.origin) {
    if (['api.dexscreener.com', 'api.geckoterminal.com'].includes(url.hostname))
      return original('/__designer/provider?path=' + encodeURIComponent(url.pathname + url.search));
    // Even if an owner accidentally adds a production API origin, it cannot receive a request.
    return Promise.resolve(Response.json({ error: { code: 'DESIGN_ONLY', message: 'External access disabled.' } }, { status: 503 }));
  }
  const state = new URLSearchParams(location.search).get('fixture');
  if (state && ['position', 'unavailable'].includes(state)) {
    url.searchParams.set('__state', state);
    return original(input instanceof Request ? new Request(url, input) : url, init);
  }
  return original(input, init);
};
const style = document.createElement('style');
style.textContent = 'html{padding-top:30px}#designer-notice{position:fixed;z-index:2147483647;top:0;left:0;right:0;height:30px;background:#f6d365;color:#17131f;font:600 12px/30px sans-serif;text-align:center}';
document.head.append(style);
const notice = document.createElement('div'); notice.id = 'designer-notice'; notice.textContent = 'SYNTHETIC PREVIEW · AUTH / TRADING DISABLED'; document.body.append(notice);
