// Display-only image sources. Bounded alternatives; no proxy or additional metadata service.
export function tokenImageCandidates(...values: (string | null | undefined)[]): string[] {
  const candidates = new Set<string>();
  for (const value of values) {
    if (!value || value.length > 2048) continue;
    try {
      const url = new URL(
        value.startsWith('ipfs://')
          ? 'https://ipfs.io/ipfs/' + value.slice(7).replace(/^ipfs\//, '')
          : value,
      );
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        /^(localhost|127\.|0\.|10\.|192\.168\.|\[::1\])/i.test(url.hostname)
      )
        continue;
      const gateway =
        ['ipfs.io', 'ipfs.filebase.io', 'gateway.pinata.cloud', 'pump.mypinata.cloud'].includes(
          url.hostname,
        ) && url.pathname.startsWith('/ipfs/');
      if (gateway) {
        const healthy = new URL(url);
        healthy.hostname = 'ipfs.filebase.io';
        candidates.add(healthy.href);
        candidates.add(url.href);
        const alternate = new URL(url);
        alternate.hostname = url.hostname === 'ipfs.io' ? 'gateway.pinata.cloud' : 'ipfs.io';
        candidates.add(alternate.href);
      } else candidates.add(url.href);
    } catch {
      /* Missing or malformed metadata uses the monogram. */
    }
  }
  return [...candidates].slice(0, 4);
}
