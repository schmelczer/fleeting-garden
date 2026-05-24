import {
  appConfig,
  normalizeRuntimeSettings,
  type GardenRuntimeSettings,
} from './config';
import { writeBrowserStorage } from './utils/browser-storage';
import { getInitialVibe, type VibePreset } from './vibes';

const preservedRuntimeSettingKeys = [
  'eraserSize',
  'adaptiveCapInitial',
  'adaptiveCapMin',
  'internalRenderAreaMegapixels',
  'maxAgentCount',
  'mirrorSegmentCount',
] satisfies ReadonlyArray<keyof GardenRuntimeSettings>;

const cloneRgbColor = <T extends [number, number, number]>(color: T): T =>
  [...color] as T;

const cloneVibeAudio = (audio: VibePreset['audio']): VibePreset['audio'] => ({
  ...audio,
  ...(audio.scale ? { scale: [...audio.scale] } : {}),
  ...(audio.progression
    ? { progression: audio.progression.map((chord) => ({ ...chord })) }
    : {}),
});

const cloneVibePreset = (vibe: VibePreset): VibePreset => ({
  ...vibe,
  colors: vibe.colors.map(cloneRgbColor) as VibePreset['colors'],
  backgroundColor: cloneRgbColor(vibe.backgroundColor),
  settings: { ...vibe.settings },
  audio: cloneVibeAudio(vibe.audio),
});

const buildSettings = (vibe: VibePreset): GardenRuntimeSettings =>
  normalizeRuntimeSettings(
    {
      ...appConfig.defaultSettings,
      eraserSize: appConfig.toolbar.eraser.default,
      mirrorSegmentCount: appConfig.toolbar.mirror.default,
      ...vibe.settings,
    },
    appConfig.runtimeSettings.controls
  );

export let activeVibe = cloneVibePreset(getInitialVibe());

export const settings: GardenRuntimeSettings = {
  ...buildSettings(activeVibe),
};

export const rememberActiveVibeSelection = (): void => {
  writeBrowserStorage(appConfig.storage.vibeKey, activeVibe.id);
};

export const applyVibeSettings = (vibe: VibePreset) => {
  activeVibe = cloneVibePreset(vibe);
  const nextSettings = buildSettings(activeVibe);
  preservedRuntimeSettingKeys.forEach((key) => {
    nextSettings[key] = settings[key];
  });
  nextSettings.selectedColorIndex = Math.min(
    settings.selectedColorIndex,
    activeVibe.colors.length - 1
  );

  Object.assign(
    settings,
    normalizeRuntimeSettings(nextSettings, appConfig.runtimeSettings.controls)
  );

  rememberActiveVibeSelection();

  return activeVibe;
};
