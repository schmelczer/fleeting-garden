import { beforeEach, describe, expect, it } from 'vitest';

import { Random } from './random';

describe('Random', () => {
  beforeEach(() => {
    Random.seed = 42;
  });

  it('produces values in [0, 1)', () => {
    for (let i = 0; i < 1000; i++) {
      const v = Random.getRandom();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic for the same seed', () => {
    Random.seed = 42;
    const a = Array.from({ length: 8 }, () => Random.getRandom());
    Random.seed = 42;
    const b = Array.from({ length: 8 }, () => Random.getRandom());
    expect(a).toEqual(b);
  });

  it('produces different sequences for different seeds', () => {
    Random.seed = 1;
    const a = Array.from({ length: 4 }, () => Random.getRandom());
    Random.seed = 2;
    const b = Array.from({ length: 4 }, () => Random.getRandom());
    expect(a).not.toEqual(b);
  });

  it('randomBetween stays within [from, to)', () => {
    for (let i = 0; i < 1000; i++) {
      const v = Random.randomBetween(-10, 10);
      expect(v).toBeGreaterThanOrEqual(-10);
      expect(v).toBeLessThan(10);
    }
  });
});
