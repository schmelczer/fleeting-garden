import { appConfig } from './config';
import type { VibeId, VibePreset } from './config/types';

export const VIBE_PRESETS: Array<VibePreset> = appConfig.vibes.presets;

export const getVibeById = (vibeId: VibeId): VibePreset | undefined =>
  VIBE_PRESETS.find((vibe) => vibe.id === vibeId);
