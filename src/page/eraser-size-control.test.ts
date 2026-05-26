import { describe, expect, it } from 'vitest';

import {
  ERASER_SIZE_MAX,
  ERASER_SIZE_MIN,
  getEffectiveEraserSize,
  getEraserSizeFromSliderRatio,
  getEraserSizeMaxForCssSize,
  getEraserSliderRatioFromSize,
} from '../config/eraser-size';

describe('eraser size slider mapping', () => {
  it('maps slider position quadratically to eraser size', () => {
    expect(getEraserSizeFromSliderRatio(0)).toBe(ERASER_SIZE_MIN);
    expect(getEraserSizeFromSliderRatio(0.5)).toBe(
      ERASER_SIZE_MIN + (ERASER_SIZE_MAX - ERASER_SIZE_MIN) * 0.25
    );
    expect(getEraserSizeFromSliderRatio(1)).toBe(ERASER_SIZE_MAX);
  });

  it('maps eraser size back to the inverse slider position', () => {
    const quarterRangeSize = ERASER_SIZE_MIN + (ERASER_SIZE_MAX - ERASER_SIZE_MIN) * 0.25;

    expect(getEraserSliderRatioFromSize(ERASER_SIZE_MIN)).toBe(0);
    expect(getEraserSliderRatioFromSize(quarterRangeSize)).toBe(0.5);
    expect(getEraserSliderRatioFromSize(ERASER_SIZE_MAX)).toBe(1);
  });

  it('uses a responsive max size on small canvases', () => {
    const mobileMax = getEraserSizeMaxForCssSize({ height: 640, width: 390 });

    expect(mobileMax).toBeLessThan(ERASER_SIZE_MAX);
    expect(getEraserSizeFromSliderRatio(1, mobileMax)).toBe(mobileMax);
    expect(getEraserSliderRatioFromSize(ERASER_SIZE_MAX, mobileMax)).toBe(1);
    expect(getEffectiveEraserSize(ERASER_SIZE_MAX, { height: 640, width: 390 })).toBe(
      mobileMax
    );
  });
});
