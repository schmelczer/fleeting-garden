import { describe, expect, it } from 'vitest';

import { hsl } from './hsl';

describe('hsl', () => {
  it('produces pure red at hue 0', () => {
    const [r, g, b] = hsl(0, 100, 50);
    expect(r).toBeCloseTo(1);
    expect(g).toBeCloseTo(0);
    expect(b).toBeCloseTo(0);
  });
  it('produces pure green at hue 120', () => {
    const [r, g, b] = hsl(120, 100, 50);
    expect(r).toBeCloseTo(0);
    expect(g).toBeCloseTo(1);
    expect(b).toBeCloseTo(0);
  });
  it('produces pure blue at hue 240', () => {
    const [r, g, b] = hsl(240, 100, 50);
    expect(r).toBeCloseTo(0);
    expect(g).toBeCloseTo(0);
    expect(b).toBeCloseTo(1);
  });
  it('produces gray at saturation 0', () => {
    const [r, g, b] = hsl(180, 0, 50);
    expect(r).toBeCloseTo(0.5);
    expect(g).toBeCloseTo(0.5);
    expect(b).toBeCloseTo(0.5);
  });
  it('produces black at lightness 0', () => {
    const [r, g, b] = hsl(0, 100, 0);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });
  it('produces white at lightness 100', () => {
    const [r, g, b] = hsl(0, 100, 100);
    expect(r).toBeCloseTo(1);
    expect(g).toBeCloseTo(1);
    expect(b).toBeCloseTo(1);
  });
});
