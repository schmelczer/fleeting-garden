import { describe, expect, it } from 'vitest';

import {
  normalizeNumberControlValue,
  normalizeRuntimeSettings,
} from './normalize-runtime-settings';
import type { GardenRuntimeSettings } from './types';

describe('normalizeNumberControlValue', () => {
  it('clamps and rounds numeric controls', () => {
    expect(
      normalizeNumberControlValue(12.6, {
        folder: 'Test',
        integer: true,
        max: 10,
        min: 0,
      })
    ).toBe(10);

    expect(
      normalizeNumberControlValue(Number.NaN, {
        folder: 'Test',
        min: 3,
      })
    ).toBe(3);
  });

  it('keeps only declared option values', () => {
    expect(
      normalizeNumberControlValue(2, {
        folder: 'Test',
        options: { off: 0, on: 2 },
      })
    ).toBe(2);

    expect(
      normalizeNumberControlValue(3, {
        folder: 'Test',
        options: { off: 0, on: 2 },
      })
    ).toBe(0);
  });
});

describe('normalizeRuntimeSettings', () => {
  it('normalizes configured runtime keys and leaves hidden keys alone', () => {
    const settings = {
      brushSize: 99,
      selectedColorIndex: 7,
    } as GardenRuntimeSettings;

    expect(
      normalizeRuntimeSettings(settings, {
        brushSize: {
          folder: 'Brush',
          max: 12,
          min: 1,
        },
      })
    ).toMatchObject({
      brushSize: 12,
      selectedColorIndex: 7,
    });
  });
});
