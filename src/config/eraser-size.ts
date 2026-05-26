export interface CssPixelSize {
  height: number;
  width: number;
}

export const ERASER_SIZE_MIN = 24;
export const ERASER_SIZE_MAX = 480;

const ERASER_MAX_SHORT_SIDE_RATIO = 0.55;

const getNormalizedEraserSizeMax = (maxSize: number): number => {
  const safeMaxSize = Number.isFinite(maxSize) ? Math.floor(maxSize) : ERASER_SIZE_MAX;
  return Math.max(ERASER_SIZE_MIN, Math.min(ERASER_SIZE_MAX, safeMaxSize));
};

export const getElementCssPixelSize = (element: Element): CssPixelSize => {
  const rect = element.getBoundingClientRect();
  const { clientHeight = 0, clientWidth = 0 } = element as HTMLElement;
  return {
    height: rect.height || clientHeight,
    width: rect.width || clientWidth,
  };
};

export const getEraserSizeMaxForCssSize = ({ height, width }: CssPixelSize): number => {
  const shortestSide = Math.min(height, width);
  if (!Number.isFinite(shortestSide) || shortestSide <= 0) {
    return ERASER_SIZE_MAX;
  }

  return getNormalizedEraserSizeMax(
    Math.floor(shortestSide * ERASER_MAX_SHORT_SIDE_RATIO)
  );
};

export const clampEraserSize = (
  value: number,
  maxSize = ERASER_SIZE_MAX,
  fallbackSize = ERASER_SIZE_MIN
): number => {
  const max = getNormalizedEraserSizeMax(maxSize);
  const fallback = Number.isFinite(fallbackSize) ? fallbackSize : ERASER_SIZE_MIN;
  const safeValue = Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(ERASER_SIZE_MIN, Math.round(safeValue)));
};

export const getEffectiveEraserSize = (
  size: number,
  cssSize: CssPixelSize,
  fallbackSize = ERASER_SIZE_MIN
): number => clampEraserSize(size, getEraserSizeMaxForCssSize(cssSize), fallbackSize);

export const getEraserSizeRatio = (size: number, maxSize = ERASER_SIZE_MAX): number => {
  const max = getNormalizedEraserSizeMax(maxSize);
  if (max === ERASER_SIZE_MIN) {
    return 0;
  }

  return (clampEraserSize(size, max) - ERASER_SIZE_MIN) / (max - ERASER_SIZE_MIN);
};

const ERASER_SLIDER_MIN = 0;
const ERASER_SLIDER_MAX = 1;

const clampSliderRatio = (value: number): number => {
  const safeValue = Number.isFinite(value) ? value : ERASER_SLIDER_MIN;
  return Math.min(ERASER_SLIDER_MAX, Math.max(ERASER_SLIDER_MIN, safeValue));
};

export const getEraserSizeFromSliderRatio = (
  sliderRatio: number,
  maxSize = ERASER_SIZE_MAX
): number => {
  const max = getNormalizedEraserSizeMax(maxSize);
  return clampEraserSize(
    ERASER_SIZE_MIN + (max - ERASER_SIZE_MIN) * clampSliderRatio(sliderRatio) ** 2,
    max
  );
};

export const getEraserSliderRatioFromSize = (
  size: number,
  maxSize = ERASER_SIZE_MAX
): number => Math.sqrt(getEraserSizeRatio(size, maxSize));
