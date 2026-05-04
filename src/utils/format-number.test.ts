import { describe, expect, it } from 'vitest';

import { formatNumber } from './format-number';

describe('formatNumber', () => {
  it('renders integers without decimals', () => {
    expect(formatNumber(42)).toBe('42 ');
  });
  it('renders fractional values with two decimals', () => {
    expect(formatNumber(3.14159)).toBe('3.14 ');
  });
  it('renders thousands compactly', () => {
    expect(formatNumber(2500)).toBe('2.5 thousand ');
  });
  it('renders millions compactly', () => {
    expect(formatNumber(1_500_000)).toBe('1.5 million ');
  });
  it('appends the unit when provided', () => {
    expect(formatNumber(5, 'agents')).toBe('5 agents');
    expect(formatNumber(2_000_000, 'agents')).toBe('2.0 million agents');
  });
});
