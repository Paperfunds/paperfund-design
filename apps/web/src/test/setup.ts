import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { beforeEach, afterEach, vi } from 'vitest';

// jsdom has no Web Locks implementation. Model Chrome's serialized exclusive lock.
beforeEach(() => {
  let tail = Promise.resolve();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, work: () => Promise<unknown>) => {
        const next = tail.then(work);
        tail = next.then(
          () => {},
          () => {},
        );
        return next;
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  delete window.solana;
  delete window.phantom;
});
