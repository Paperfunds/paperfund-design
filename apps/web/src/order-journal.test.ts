import { beforeEach, it, expect, vi } from 'vitest';
import { durableOrder, pendingOrder, type OrderIntent } from './order-journal.js';
const intent: OrderIntent = {
  owner: 'fixture-wallet',
  mode: 'practice',
  key: 'fixture-order-key',
  path: 'trade',
  body: { quoteId: 'fixture-quote' },
  attempts: 0,
};
beforeEach(() => {
  localStorage.clear();
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
it('clears a first explicit liquidity rejection but retains a prior uncertain attempt', async () => {
  const order: OrderIntent = {
    ...intent,
    mode: 'competition',
    path: '/api/v1/trades/sell',
    round: 'fixture-round',
    body: { mint: 'fixture-mint', quantity: '25', roundId: 'fixture-round' },
  };
  const rejection = Object.assign(new Error('No executable liquidity'), {
    status: 409,
    code: 'INSUFFICIENT_EXECUTABLE_LIQUIDITY',
  });
  await expect(
    durableOrder(order, async () => {
      throw rejection;
    }),
  ).rejects.toThrow();
  expect(pendingOrder()).toBeNull();
  await durableOrder(order, async () => {
    throw Error('lost response');
  }).catch(() => {});
  await expect(
    durableOrder(
      order,
      async () => {
        throw rejection;
      },
      true,
    ),
  ).rejects.toThrow();
  expect(pendingOrder()?.key).toBe(order.key);
});
it('persists before send and recovers a lost response after module reload with the original request', async () => {
  const failed = vi.fn(async () => {
    expect(pendingOrder()?.key).toBe(intent.key);
    throw Error('lost response');
  });
  await expect(durableOrder(intent, failed)).rejects.toThrow('lost response');
  vi.resetModules();
  const reloaded = await import('./order-journal.js');
  expect(reloaded.pendingOrder()?.body).toEqual(intent.body);
  const fill = { id: 'fixture-fill' };
  expect(await reloaded.durableOrder(reloaded.pendingOrder()!, async () => fill, true)).toEqual(
    fill,
  );
  expect(pendingOrder()).toBeNull();
});
it('blocks another token, wallet, mode or replacement key while unresolved', async () => {
  await durableOrder(intent, async () => {
    throw Error('uncertain');
  }).catch(() => {});
  for (const other of [
    { ...intent, key: 'replacement-key' },
    { ...intent, owner: 'other-wallet' },
    { ...intent, mode: 'competition' as const },
    { ...intent, body: { quoteId: 'different-token' } },
  ]) {
    const send = vi.fn();
    await expect(durableOrder(other, send, true)).rejects.toThrow('earlier order');
    expect(send).not.toHaveBeenCalled();
  }
});
it('serializes cross-component submissions and never sends a new intent after uncertainty', async () => {
  const first = durableOrder(intent, async () => {
    throw Error('uncertain');
  });
  const send = vi.fn();
  const second = durableOrder({ ...intent, key: 'second' }, send);
  await expect(first).rejects.toThrow('uncertain');
  await expect(second).rejects.toThrow('earlier order');
  expect(send).not.toHaveBeenCalled();
});
it('does not send when durable storage or browser locking is unavailable', async () => {
  const send = vi.fn();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw Error('storage denied');
  });
  await expect(durableOrder(intent, send)).rejects.toThrow('storage denied');
  expect(send).not.toHaveBeenCalled();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  await expect(durableOrder(intent, send)).rejects.toThrow('locking unavailable');
  expect(send).not.toHaveBeenCalled();
});
it('clears a first explicit rejection but retains later rejections after lost response', async () => {
  await durableOrder(intent, async () => {
    throw { status: 400, code: 'INVALID_REQUEST' };
  }).catch(() => {});
  expect(pendingOrder()).toBeNull();
  await durableOrder(intent, async () => {
    throw { status: 0 };
  }).catch(() => {});
  await durableOrder(
    intent,
    async () => {
      throw { status: 409 };
    },
    true,
  ).catch(() => {});
  expect(pendingOrder()?.attempts).toBe(2);
});
