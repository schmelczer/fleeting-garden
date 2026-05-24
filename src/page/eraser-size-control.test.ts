import { describe, expect, it } from 'vitest';

import { appConfig } from '../config';
import {
  getEraserSizeFromSliderRatio,
  getEraserSliderRatioFromSize,
} from './eraser-size-control';

describe('eraser size slider mapping', () => {
  it('maps slider position quadratically to eraser size', () => {
    const { max, min } = appConfig.toolbar.eraser;

    expect(getEraserSizeFromSliderRatio(0)).toBe(min);
    expect(getEraserSizeFromSliderRatio(0.5)).toBe(min + (max - min) * 0.25);
    expect(getEraserSizeFromSliderRatio(1)).toBe(max);
  });

  it('maps eraser size back to the inverse slider position', () => {
    const { max, min } = appConfig.toolbar.eraser;
    const quarterRangeSize = min + (max - min) * 0.25;

    expect(getEraserSliderRatioFromSize(min)).toBe(0);
    expect(getEraserSliderRatioFromSize(quarterRangeSize)).toBe(0.5);
    expect(getEraserSliderRatioFromSize(max)).toBe(1);
  });
});
