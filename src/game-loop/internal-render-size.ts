const MEGAPIXEL = 1_000_000;

export interface InternalRenderSizeOptions {
  clientHeight: number;
  clientWidth: number;
  maxTextureDimension: number;
  targetAreaMegapixels: number;
}

export interface InternalRenderSize {
  height: number;
  width: number;
}

const getSafeInternalRenderAreaMegapixels = (targetAreaMegapixels: number): number =>
  Number.isFinite(targetAreaMegapixels) && targetAreaMegapixels > 0
    ? targetAreaMegapixels
    : 1;

export const getInternalRenderSize = ({
  clientHeight,
  clientWidth,
  maxTextureDimension,
  targetAreaMegapixels,
}: InternalRenderSizeOptions): InternalRenderSize => {
  const safeClientWidth = Math.max(1, clientWidth);
  const safeClientHeight = Math.max(1, clientHeight);
  const safeMaxTextureDimension =
    Number.isFinite(maxTextureDimension) && maxTextureDimension > 0
      ? Math.floor(maxTextureDimension)
      : Number.POSITIVE_INFINITY;
  const targetArea =
    getSafeInternalRenderAreaMegapixels(targetAreaMegapixels) * MEGAPIXEL;
  const areaScale = Math.sqrt(targetArea / (safeClientWidth * safeClientHeight));
  const dimensionScale = Math.min(
    areaScale,
    safeMaxTextureDimension / safeClientWidth,
    safeMaxTextureDimension / safeClientHeight
  );

  return {
    height: Math.max(1, Math.round(safeClientHeight * dimensionScale)),
    width: Math.max(1, Math.round(safeClientWidth * dimensionScale)),
  };
};
