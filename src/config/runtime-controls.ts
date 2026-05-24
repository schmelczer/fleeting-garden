import { colorInteractionControl } from './color-interactions';
import { INTERNAL_RENDER_AREA_MEGAPIXEL_LIMITS } from './runtime-setting-bounds';
import type { GardenAppConfig } from './types';

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;
const formatRadiansAsDegrees = (value: number): string =>
  `${Math.round((value * 180) / Math.PI)} deg`;
const formatCompactNumber = (value: number): string => {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return `${value}`;
};

export const runtimeControls: GardenAppConfig['runtimeSettings']['controls'] = {
  color1ToColor1: colorInteractionControl('Color 1 Follows Color 1'),
  color1ToColor2: colorInteractionControl('Color 1 Follows Color 2'),
  color1ToColor3: colorInteractionControl('Color 1 Follows Color 3'),
  color2ToColor1: colorInteractionControl('Color 2 Follows Color 1'),
  color2ToColor2: colorInteractionControl('Color 2 Follows Color 2'),
  color2ToColor3: colorInteractionControl('Color 2 Follows Color 3'),
  color3ToColor1: colorInteractionControl('Color 3 Follows Color 1'),
  color3ToColor2: colorInteractionControl('Color 3 Follows Color 2'),
  color3ToColor3: colorInteractionControl('Color 3 Follows Color 3'),

  brushSize: {
    folder: 'Brush',
    label: 'Brush Size',
    min: 1,
    max: 36,
    step: 0.25,
  },
  spawnPerPixel: {
    folder: 'Brush',
    label: 'Density',
    min: 0.01,
    max: 0.38,
    step: 0.001,
  },
  strokeAngleJitterRadians: {
    folder: 'Brush',
    format: formatRadiansAsDegrees,
    label: 'Spawn Spread',
    min: 0,
    max: Math.PI,
    step: 0.01,
  },
  sensorOffsetDistance: {
    folder: 'Movement',
    label: 'Sensor Reach',
    min: 0,
    max: 200,
    step: 1,
  },
  sensorOffsetAngle: {
    folder: 'Movement',
    label: 'Sensor Angle',
    min: 0,
    max: 180,
    step: 1,
  },
  moveSpeed: {
    folder: 'Movement',
    label: 'Travel Speed',
    min: 10,
    max: 250,
    step: 1,
  },
  turnSpeed: {
    folder: 'Movement',
    label: 'Turning Speed',
    min: 1,
    max: 200,
    step: 1,
  },
  forwardRotationScale: {
    folder: 'Movement',
    format: formatPercent,
    label: 'Forward Focus',
    min: 0,
    max: 1,
    step: 0.01,
  },
  turnWhenLost: {
    folder: 'Movement',
    label: 'Wander Turn',
    min: 0,
    max: Math.PI * 2,
    step: 0.01,
  },
  individualTrailWeight: {
    folder: 'Movement',
    label: 'Trail Strength',
    min: 0,
    max: 1,
    step: 0.001,
  },
  diffusionRateTrails: {
    folder: 'Movement',
    label: 'Diffusion Rate',
    min: 0.01,
    max: 1,
    step: 0.01,
  },
  decayRateTrails: {
    folder: 'Movement',
    label: 'Trail Fade',
    min: 800,
    max: 1000,
    step: 1,
  },

  clarity: {
    folder: 'Look',
    inverted: true,
    label: 'Sharpness',
    min: 0.00001,
    max: 1,
    step: 0.001,
  },
  backgroundGrainStrength: {
    folder: 'Look',
    label: 'Background Grain',
    min: 0,
    max: 0.12,
    step: 0.001,
  },

  maxAgentCount: {
    folder: 'Performance',
    format: formatCompactNumber,
    integer: true,
    label: 'Population Limit',
    min: 0,
    step: 10_000,
  },
  internalRenderAreaMegapixels: {
    folder: 'Performance',
    label: 'Render Quality (MP)',
    min: INTERNAL_RENDER_AREA_MEGAPIXEL_LIMITS.min,
    max: INTERNAL_RENDER_AREA_MEGAPIXEL_LIMITS.max,
    step: 0.1,
  },
};
