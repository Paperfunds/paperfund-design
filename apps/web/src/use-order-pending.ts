import { useSyncExternalStore } from 'react';
// The journal is already authoritative for browser submission serialization. Reflect its hold in
// every ticket, including other tabs; malformed/unreadable storage must also disable replacements.
function snapshot() {
  try {
    return !!localStorage.getItem('pf.unresolved-order.v1');
  } catch {
    return true;
  }
}
function subscribe(changed: () => void) {
  window.addEventListener('paperfund:order-journal', changed);
  window.addEventListener('storage', changed);
  return () => {
    window.removeEventListener('paperfund:order-journal', changed);
    window.removeEventListener('storage', changed);
  };
}
export function useOrderPending() {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
