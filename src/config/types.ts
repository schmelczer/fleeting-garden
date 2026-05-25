import type { GardenAudioVibeSettings } from '../audio/garden-audio-config';
import type { AgentSettings } from '../pipelines/agents/agent-pipeline';
import type { BrushSettings } from '../pipelines/brush/brush-pipeline';
import type { DiffusionSettings } from '../pipelines/diffusion/diffusion-pipeline';
import type { RenderSettings } from '../pipelines/render/render-pipeline';
import type { RgbColor } from '../utils/rgb-color';

export interface NumberControlConfig {
  format?: (value: number) => string;
  folder: string;
  integer?: boolean;
  inverted?: boolean;
  label?: string;
  max?: number;
  min?: number;
  options?: Record<string, number>;
  step?: number;
}

export type GardenRuntimeSettings = {
  adaptiveCapInitial: number;
  adaptiveCapMin: number;
  backgroundGrainStrength: number;
  brushCurveResolution: number;
  brushCurveMinBrushRadius: number;
  brushCurveMinSegmentSpacing: number;
  brushCurveMirrorResolutionExponent: number;
  brushCurveSegmentBrushRadiusRatio: number;
  brushEffectDuration: number;
  brushSmoothingMinSampleDistance: number;
  eraserClearAlpha: number;
  eraserClearBlue: number;
  eraserClearGreen: number;
  eraserClearRed: number;
  eraserLineDistanceEpsilon: number;
  eraserMaskAlphaThreshold: number;
  eraserSize: number;
  internalRenderAreaMegapixels: number;
  mirrorSegmentCount: number;
  maxAgentCount: number;
  selectedColorIndex: number;
  spawnPerPixel: number;
  strokeAngleJitterRadians: number;
} & AgentSettings &
  BrushSettings &
  DiffusionSettings &
  RenderSettings;

export type RuntimeSettingControlConfig = Partial<
  Record<keyof GardenRuntimeSettings, NumberControlConfig>
>;

export type GardenVibeSettings = Pick<
  GardenRuntimeSettings,
  | 'backgroundGrainStrength'
  | 'brushSize'
  | 'clarity'
  | 'color1ToColor1'
  | 'color1ToColor2'
  | 'color1ToColor3'
  | 'color2ToColor1'
  | 'color2ToColor2'
  | 'color2ToColor3'
  | 'color3ToColor1'
  | 'color3ToColor2'
  | 'color3ToColor3'
  | 'decayRateTrails'
  | 'forwardRotationScale'
  | 'individualTrailWeight'
  | 'moveSpeed'
  | 'sensorOffsetAngle'
  | 'sensorOffsetDistance'
  | 'spawnPerPixel'
  | 'strokeAngleJitterRadians'
  | 'turnSpeed'
  | 'turnWhenLost'
>;

export type GardenDefaultSettings = Omit<
  GardenRuntimeSettings,
  keyof GardenVibeSettings | 'eraserSize' | 'mirrorSegmentCount'
>;

export enum VibeId {
  AuroraMycelium = 'aurora-mycelium',
  VelvetObservatory = 'velvet-observatory',
  LichenSignal = 'lichen-signal',
  TidepoolLantern = 'tidepool-lantern',
  PaperLanternFog = 'paper-lantern-fog',
  ChromePollen = 'chrome-pollen',
}

export interface VibePreset {
  id: VibeId;
  name: string;
  colors: [RgbColor, RgbColor, RgbColor];
  backgroundColor: RgbColor;
  settings: GardenVibeSettings;
  audio: GardenAudioVibeSettings;
}
