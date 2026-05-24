import {
  createGardenAudioConfig,
  DEFAULT_AUDIO_VOLUME,
} from './audio/garden-audio-config';
import { defaultSettings } from './config/default-settings';
import { runtimeControls } from './config/runtime-controls';
import type { GardenAppConfig } from './config/types';
import { defaultVibeId, vibePresets } from './config/vibe-presets';

export {
  normalizeNumberControlValue,
  normalizeRuntimeSettings,
} from './config/normalize-runtime-settings';

export type {
  GardenAppConfig,
  GardenRuntimeSettings,
  NumberControlConfig,
} from './config/types';

export const appConfig = {
  audio: createGardenAudioConfig(),
  analytics: {
    autoCapturePageviews: true,
    domain: 'schmelczer.dev/fleeting',
    endpoint: 'https://stats.schmelczer.dev/status',
    logging: import.meta.env.DEV,
  },
  deltaTime: {
    maxDeltaTimeSeconds: 1 / 30,
    minDeltaTimeSeconds: 1 / 240,
  },
  exportSnapshot: {
    bytesPerPixel: 4,
    filenameExtension: 'png',
    filenamePrefix: 'fleeting-garden',
    filenameSuffix: '-snapshot',
    mimeType: 'image/png',
    rowAlignmentBytes: 256,
  },
  menuHider: {
    bottomRevealDistancePx: 96,
    desktopMediaQuery: '(min-width: 600px) and (hover: hover) and (pointer: fine)',
    hideDelayMs: 3000,
  },
  pipelines: {
    common: {
      noiseChannelSeeds: [0, 1, 2, 3],
      noiseClearValue: { r: 1, g: 1, b: 1, a: 1 },
      noiseDrawInstanceCount: 1,
      noiseDrawVertexCount: 3,
      noiseHashMultiplier: 43758.5453123,
      noiseHashX: 12.9898,
      noiseHashY: 78.233,
      noiseTextureFormat: 'r8unorm',
      noiseTextureSize: 2048,
    },
    brush: {
      maxLineCount: 240,
    },
    diffusion: {
      minDiffusionRate: 0.000001,
    },
    eraser: {
      maxTextureLineCount: 384,
    },
  },
  defaultSettings,
  runtimeSettings: {
    controls: runtimeControls,
  },
  simulation: {
    brushEffectFramesPerSecond: 60,
    clearColor: { r: 0, g: 0, b: 0, a: 0 },
    initialAgentCount: 180_000,
    // How long the source map continues to be diffused after a brush stroke ends.
    // 600 frames at ~60 FPS ≈ 10 seconds.
    sourceActiveFramesAfterWrite: 600,
    intro: {
      angleJitterRadians: Math.PI * 0.08,
      angleEaseEnd: 1,
      angleEaseStart: 0.6,
      circleMaxSideRatio: 0.46,
      circleMinSideRatio: 0.32,
      drawHintDelayMs: 3000,
      durationSeconds: 4,
      entryJitterSideRatio: 0.035,
      fontScaleDown: 0.94,
      fontFamily: '"Open Sans", sans-serif',
      initialFontHeightRatio: 0.28,
      initialFontWidthRatio: 0.19,
      letterSpacingEm: 0.07,
      maskAlphaThreshold: 32,
      maskGradientThreshold: 8,
      maskMaxPixels: 1_000_000,
      maskSampleDensity: 540,
      maxHeightRatio: 0.25,
      maxWidthRatio: 0.76,
      minEntryJitterPx: 6,
      minFontSizePx: 18,
      minTargetJitterPx: 1,
      pathEasing: 'easeOutQuad',
      pathProgressEpsilon: 0.001,
      radialJitterRatio: 0.35,
      radialStartEpsilon: 0.001,
      resizeMinimumRemainingSeconds: 1.4,
      resizeSettleMs: 120,
      targetDelayDistanceMultiplier: 0.12,
      targetDelayMax: 0.22,
      targetDelayRandomMultiplier: 0.06,
      targetJitterSideRatio: 0.0035,
      title: 'Fleeting',
      titleColorCutLetters: [2, 5],
      titleRadiusMultiplier: 1.55,
      titleStrokeWidthMinPx: 6,
      titleStrokeWidthRatio: 0.11,
      verticalAnchor: 0.47,
    },
    introMoveSpeed: 280,
    stroke: {
      densityMultiplier: 110,
      maxAgentCount: 2_400,
    },
  },
  storage: {
    audioMutedKey: 'fleeting-garden:audio-muted',
    audioVolumeKey: 'fleeting-garden:audio-volume',
    vibeKey: 'fleeting-garden:vibe',
  },
  toolbar: {
    eraser: {
      controlScaleMax: 1.34,
      controlScaleMin: 0.74,
      default: 96,
      max: 480,
      min: 24,
      step: 1,
    },
    mirror: {
      default: 8,
      fallbackSegmentName: 'slices',
      max: 12,
      min: 1,
      names: {
        2: 'halves',
        3: 'thirds',
        4: 'quarters',
        5: 'fifths',
        6: 'sixths',
        7: 'sevenths',
        8: 'eighths',
        9: 'ninths',
        10: 'tenths',
        11: 'elevenths',
        12: 'twelfths',
      },
      offLabel: 'Mirror off',
      step: 1,
    },
    contrast: {
      backgroundOpacityMax: 0.82,
      brightLuminanceThreshold: 0.32,
      brightWeight: 0.65,
      bytesPerSample: 4,
      contrastOffset: 0.05,
      linearChannelBreakpoint: 0.03928,
      linearChannelDivisor: 12.92,
      linearChannelGamma: 2.4,
      linearChannelOffset: 0.055,
      linearChannelScale: 1.055,
      lowContrastThreshold: 3,
      lowContrastWeight: 1.8,
      luminanceBase: 0.11,
      luminanceBlueWeight: 0.0722,
      luminanceGreenWeight: 0.7152,
      luminanceRange: 0.28,
      luminanceRedWeight: 0.2126,
      sampleColumns: 13,
      sampleIntervalMs: 300,
      sampleRows: 7,
      whiteContrastNumerator: 1.05,
    },
    volume: {
      default: DEFAULT_AUDIO_VOLUME,
      max: 1,
      min: 0,
      step: 0.01,
    },
  },
  tuningPane: {
    showFpsOverlay: import.meta.env.DEV,
    startHidden: true,
    title: 'Garden Settings',
  },
  vibes: {
    defaultVibeId,
    presets: vibePresets,
  },
} satisfies GardenAppConfig;
