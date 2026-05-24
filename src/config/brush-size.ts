export const BRUSH_SIZE_BASELINE_RENDER_AREA_MEGAPIXELS = 7.3;

const getSafeRenderAreaMegapixels = (renderAreaMegapixels: number): number =>
  Number.isFinite(renderAreaMegapixels) && renderAreaMegapixels > 0
    ? renderAreaMegapixels
    : BRUSH_SIZE_BASELINE_RENDER_AREA_MEGAPIXELS;

export const getBrushRenderQualityScale = (renderAreaMegapixels: number): number =>
  Math.sqrt(
    getSafeRenderAreaMegapixels(renderAreaMegapixels) /
      BRUSH_SIZE_BASELINE_RENDER_AREA_MEGAPIXELS
  );

export const getRenderQualityBrushSize = (
  brushSize: number,
  renderAreaMegapixels: number
): number =>
  Math.max(0, Number.isFinite(brushSize) ? brushSize : 0) *
  getBrushRenderQualityScale(renderAreaMegapixels);
