import { INTERNAL_RENDER_AREA_MEGAPIXEL_LIMITS } from './runtime-setting-bounds';
import type { GardenDefaultSettings } from './types';

// Mirrors the historical render-scale cap so the default render area stays
// roughly equivalent to native rendering on high-DPR phones without the
// pipeline applying its own clamp. The slider can override freely.
const DEFAULT_DEVICE_PIXEL_RATIO_CAP = 2;

const computeDefaultInternalRenderAreaMegapixels = (): number => {
  const rawDpr =
    typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
      ? window.devicePixelRatio
      : 1;
  const dpr = Math.min(Math.max(rawDpr, 1), DEFAULT_DEVICE_PIXEL_RATIO_CAP);
  const cssWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const cssHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const cssMegapixels = (Math.max(cssWidth, 1) * Math.max(cssHeight, 1)) / 1_000_000;
  return Math.min(
    INTERNAL_RENDER_AREA_MEGAPIXEL_LIMITS.max,
    Math.max(INTERNAL_RENDER_AREA_MEGAPIXEL_LIMITS.min, dpr * dpr * cssMegapixels)
  );
};

export const defaultSettings: GardenDefaultSettings = {
  selectedColorIndex: 0,

  introNearDistanceMin: 28,
  introNearDistanceInner: 4,
  introNearSensorOffsetMultiplier: 0.75,
  introTargetAngleBlend: 0.2,
  introProgressCutoff: 0.999,
  introTurnRateMultiplier: 3.4,
  introRandomTurnMultiplier: 0.18,
  introStepStopDistance: 0.5,
  randomTimeScale: 0.34816,

  diffusionRateTrails: 0.22,
  diffusionDecayRateDivisor: 1000,
  diffusionNeighborDivisor: 8,
  brushEffectDuration: 8,

  brushCurveResolution: 12,
  brushCurveMinBrushRadius: 1,
  brushCurveMinSegmentSpacing: 4,
  brushCurveMirrorResolutionExponent: 0.5,
  brushCurveSegmentBrushRadiusRatio: 0.65,
  brushSmoothingMinSampleDistance: 0.5,

  brushDiscardThreshold: 0.02,
  brushGrainNoiseScale: 22,
  brushGrainNoiseOffsetX: 0.31,
  brushGrainNoiseOffsetY: 0.67,
  brushGrainMinStrength: 0.45,
  brushGrainMaxStrength: 1,

  eraserClearBlue: 0,
  eraserClearGreen: 0,
  eraserClearRed: 0,
  eraserLineDistanceEpsilon: 0.0001,
  eraserMaskAlphaThreshold: 0.5,
  eraserMaskErasedValue: 0,

  adaptiveCapInitial: 1_000_000,
  adaptiveCapMin: 50_000,
  internalRenderAreaMegapixels: computeDefaultInternalRenderAreaMegapixels(),
  maxAgentCount: 1_500_000,

  renderTraceNormalizationFloor: 1,
  renderBrushColorBase: 1.2,
  renderBrushColorStrengthMultiplier: 1.6,
};
