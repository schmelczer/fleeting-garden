import type {
  GardenAudioConfig,
  GardenAudioVibeSettings,
} from '../audio/garden-audio-config';
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

type RuntimeSettingControlConfig = Partial<
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

type GardenDefaultSettings = Omit<
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

export interface GardenAppConfig {
  audio: GardenAudioConfig;
  analytics: {
    autoCapturePageviews: boolean;
    domain: string;
    endpoint: string;
    logging: boolean;
  };
  deltaTime: {
    maxDeltaTimeSeconds: number;
    minDeltaTimeSeconds: number;
  };
  exportSnapshot: {
    bytesPerPixel: number;
    filenameExtension: string;
    filenamePrefix: string;
    filenameSuffix: string;
    mimeType: string;
    rowAlignmentBytes: number;
  };
  menuHider: {
    bottomRevealDistancePx: number;
    desktopMediaQuery: string;
    hideDelayMs: number;
  };
  pipelines: {
    common: {
      noiseChannelSeeds: [number, number, number, number];
      noiseClearValue: GPUColor;
      noiseDrawInstanceCount: number;
      noiseDrawVertexCount: number;
      noiseHashMultiplier: number;
      noiseHashX: number;
      noiseHashY: number;
      noiseTextureFormat: GPUTextureFormat;
      noiseTextureSize: number;
    };
    brush: {
      maxLineCount: number;
    };
    diffusion: {
      minDiffusionRate: number;
    };
    eraser: {
      maxTextureLineCount: number;
    };
  };
  defaultSettings: GardenDefaultSettings;
  runtimeSettings: {
    controls: RuntimeSettingControlConfig;
  };
  simulation: {
    brushEffectFramesPerSecond: number;
    clearColor: GPUColor;
    initialAgentCount: number;
    sourceActiveFramesAfterWrite: number;
    intro: {
      angleJitterRadians: number;
      angleEaseEnd: number;
      angleEaseStart: number;
      circleMaxSideRatio: number;
      circleMinSideRatio: number;
      drawHintDelayMs: number;
      durationSeconds: number;
      entryJitterSideRatio: number;
      fontScaleDown: number;
      fontFamily: string;
      initialFontHeightRatio: number;
      initialFontWidthRatio: number;
      letterSpacingEm: number;
      maskAlphaThreshold: number;
      maskGradientThreshold: number;
      maskMaxPixels: number;
      maskSampleDensity: number;
      maxHeightRatio: number;
      maxWidthRatio: number;
      minEntryJitterPx: number;
      minFontSizePx: number;
      minTargetJitterPx: number;
      pathEasing: 'easeOutQuad' | 'linear';
      pathProgressEpsilon: number;
      radialJitterRatio: number;
      radialStartEpsilon: number;
      resizeMinimumRemainingSeconds: number;
      resizeSettleMs: number;
      targetDelayDistanceMultiplier: number;
      targetDelayMax: number;
      targetDelayRandomMultiplier: number;
      targetJitterSideRatio: number;
      title: string;
      titleColorCutLetters: [number, number];
      titleRadiusMultiplier: number;
      titleStrokeWidthMinPx: number;
      titleStrokeWidthRatio: number;
      verticalAnchor: number;
    };
    introMoveSpeed: number;
    stroke: {
      densityMultiplier: number;
      maxAgentCount: number;
    };
  };
  storage: {
    audioMutedKey: string;
    audioVolumeKey: string;
    vibeKey: string;
  };
  toolbar: {
    eraser: {
      controlScaleMax: number;
      controlScaleMin: number;
      default: number;
      max: number;
      min: number;
      step: number;
    };
    mirror: {
      default: number;
      fallbackSegmentName: string;
      max: number;
      min: number;
      names: Record<number, string>;
      offLabel: string;
      step: number;
    };
    contrast: {
      backgroundOpacityMax: number;
      brightLuminanceThreshold: number;
      brightWeight: number;
      bytesPerSample: number;
      contrastOffset: number;
      linearChannelBreakpoint: number;
      linearChannelDivisor: number;
      linearChannelGamma: number;
      linearChannelOffset: number;
      linearChannelScale: number;
      lowContrastThreshold: number;
      lowContrastWeight: number;
      luminanceBase: number;
      luminanceBlueWeight: number;
      luminanceGreenWeight: number;
      luminanceRange: number;
      luminanceRedWeight: number;
      sampleColumns: number;
      sampleIntervalMs: number;
      sampleRows: number;
      whiteContrastNumerator: number;
    };
    volume: {
      default: number;
      max: number;
      min: number;
      step: number;
    };
  };
  tuningPane: {
    showFpsOverlay: boolean;
    startHidden: boolean;
    title: string;
  };
  vibes: {
    defaultVibeId: VibeId;
    presets: Array<VibePreset>;
  };
}
