// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CanvasChart } from './PriceChart.js';
const mock = vi.hoisted(() => {
  let range: { from: number; to: number } | null = null;
  let onRange: (r: { from: number; to: number }) => void = () => {};
  const scale = {
    applyOptions: vi.fn(),
    getVisibleLogicalRange: vi.fn(() => range),
    setVisibleLogicalRange: vi.fn((r: { from: number; to: number }) => {
      range = r;
      onRange(r);
    }),
    subscribeVisibleLogicalRangeChange: vi.fn((fn) => {
      onRange = fn;
    }),
    fitContent: vi.fn(),
  };
  const makeSeries = () => ({
    setData: vi.fn(),
    update: vi.fn(),
    priceScale: () => ({ applyOptions: vi.fn() }),
  });
  const candles = makeSeries(),
    volume = makeSeries(),
    average = makeSeries();
  const right = { applyOptions: vi.fn() };
  const chart = {
    timeScale: () => scale,
    priceScale: () => right,
    addSeries: vi
      .fn()
      .mockReturnValueOnce(candles)
      .mockReturnValueOnce(volume)
      .mockReturnValueOnce(average),
    subscribeCrosshairMove: vi.fn(),
    remove: vi.fn(),
  };
  return {
    chart,
    scale,
    candles,
    volume,
    right,
    create: vi.fn(() => chart),
    markers: vi.fn(),
    setRange: (r: { from: number; to: number }) => {
      range = r;
    },
  };
});
vi.mock('lightweight-charts', () => ({
  createChart: mock.create,
  CandlestickSeries: {},
  HistogramSeries: {},
  LineSeries: {},
  ColorType: { Solid: 'solid' },
  createSeriesMarkers: () => ({ setMarkers: mock.markers }),
}));
afterEach(cleanup);
it('reuses its canvas, patches live prices/volume, preserves manual viewport and explicitly returns to latest', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const candles = Array.from({ length: 300 }, (_, i) => ({
    time: i + 1,
    open: i + 1,
    high: i + 2,
    low: i,
    close: i + 1,
    volume: 10,
  }));
  const props = {
    candles,
    interval: '1s' as const,
    identity: 'explicit-test-pool',
    sma: false,
    markers: [],
  };
  const { rerender } = render(<CanvasChart {...props} />);
  expect(mock.scale.fitContent).not.toHaveBeenCalled();
  expect(mock.scale.setVisibleLogicalRange.mock.calls[0]![0].from).toBeGreaterThan(150);
  mock.setRange({ from: 30, to: 60 });
  const updated = [...candles, { ...candles[299]!, time: 301, close: 302, volume: 20 }];
  rerender(<CanvasChart {...props} candles={updated} />);
  expect(mock.candles.setData).toHaveBeenCalledTimes(1);
  expect(mock.candles.update).toHaveBeenLastCalledWith(
    expect.objectContaining({ time: 301, close: 302 }),
  );
  expect(mock.volume.update).toHaveBeenLastCalledWith(
    expect.objectContaining({ time: 301, value: 20 }),
  );
  expect(mock.scale.getVisibleLogicalRange()).toEqual({ from: 30, to: 60 });
  expect(mock.right.applyOptions).toHaveBeenCalledTimes(1); // A live bar must not override manual price scaling.
  rerender(<CanvasChart {...props} candles={updated} interval="5s" />);
  expect(mock.create).toHaveBeenCalledTimes(1);
  expect(mock.candles.setData).toHaveBeenCalledTimes(2);
  rerender(<CanvasChart {...props} candles={[]} interval="1m" />);
  rerender(<CanvasChart {...props} candles={updated} interval="1m" />);
  expect(mock.create).toHaveBeenCalledTimes(1);
  rerender(<CanvasChart {...props} candles={updated} interval="1m" valueMode="cap" />);
  expect(mock.right.applyOptions).toHaveBeenLastCalledWith({ autoScale: true });
  fireEvent.click(screen.getByRole('button', { name: 'Latest trades' }));
  expect(mock.scale.getVisibleLogicalRange()!.to).toBe(305);
  expect(mock.right.applyOptions).toHaveBeenLastCalledWith({ autoScale: true });
  fireEvent.click(screen.getByRole('button', { name: 'Fit all history' }));
  expect(mock.scale.fitContent).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});
