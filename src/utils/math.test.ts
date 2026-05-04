import { describe, expect, it } from 'vitest';

import { clamp, clamp01 } from './clamp';
import { exponentialDecay } from './exponential-decay';
import { mix } from './mix';

describe('clamp', () => {
  it('returns value when within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('clamps below to lower bound', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });
  it('clamps above to upper bound', () => {
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe('clamp01', () => {
  it('passes through values in [0, 1]', () => {
    expect(clamp01(0.25)).toBe(0.25);
  });
  it('clamps negatives to 0', () => {
    expect(clamp01(-1)).toBe(0);
  });
  it('clamps above 1 to 1', () => {
    expect(clamp01(2)).toBe(1);
  });
});

describe('mix', () => {
  it('returns from at q=0', () => {
    expect(mix(10, 20, 0)).toBe(10);
  });
  it('returns to at q=1', () => {
    expect(mix(10, 20, 1)).toBe(20);
  });
  it('interpolates at q=0.5', () => {
    expect(mix(10, 20, 0.5)).toBe(15);
  });
  it('extrapolates outside [0, 1]', () => {
    expect(mix(0, 10, 2)).toBe(20);
    expect(mix(0, 10, -1)).toBe(-10);
  });
});

describe('exponentialDecay', () => {
  it('returns nextValue when bias is 1', () => {
    expect(exponentialDecay({ accumulator: 0, nextValue: 10, biasOfNextValue: 1 })).toBe(
      10
    );
  });
  it('returns accumulator when bias is 0', () => {
    expect(exponentialDecay({ accumulator: 5, nextValue: 10, biasOfNextValue: 0 })).toBe(
      5
    );
  });
  it('blends with given bias', () => {
    expect(
      exponentialDecay({ accumulator: 0, nextValue: 10, biasOfNextValue: 0.25 })
    ).toBe(2.5);
  });
});
