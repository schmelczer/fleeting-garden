import { describe, expect, it } from 'vitest';

import {
  BRUSH_SIZE_BASELINE_RENDER_AREA_MEGAPIXELS,
  getBrushRenderQualityScale,
  getRenderQualityBrushSize,
} from './brush-size';

describe('render-quality brush sizing', () => {
  it('keeps brush sizes unchanged at the 7.3 MP baseline', () => {
    expect(
      getRenderQualityBrushSize(21, BRUSH_SIZE_BASELINE_RENDER_AREA_MEGAPIXELS)
    ).toBe(21);
  });

  it('scales linear brush size with the square root of render area', () => {
    const doubledLinearQuality = BRUSH_SIZE_BASELINE_RENDER_AREA_MEGAPIXELS * 4;

    expect(getBrushRenderQualityScale(doubledLinearQuality)).toBe(2);
    expect(getRenderQualityBrushSize(9.75, doubledLinearQuality)).toBe(19.5);
  });

  it('falls back to baseline scaling for invalid render areas', () => {
    expect(getBrushRenderQualityScale(0)).toBe(1);
    expect(getRenderQualityBrushSize(6.5, Number.NaN)).toBe(6.5);
  });
});
