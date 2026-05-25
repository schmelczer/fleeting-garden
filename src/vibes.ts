import { defaultVibeId } from './config';
import { VibeId, type VibePreset } from './config/types';
import { readBrowserStorage } from './utils/browser-storage';
import { getVibeById, VIBE_PRESETS } from './vibe-registry';
import { getCurrentUriVibeId, getVibeIdFromUri } from './vibe-uri';

export { VibeId };
export { getVibeById, VIBE_PRESETS };
export type { VibePreset };

export const VIBE_STORAGE_KEY = 'fleeting-garden:vibe';

const VIBE_IDS = new Set<VibeId>(VIBE_PRESETS.map((vibe) => vibe.id));

const isVibeId = (value: unknown): value is VibeId =>
  typeof value === 'string' && VIBE_IDS.has(value as VibeId);

export const getInitialVibe = (): VibePreset => {
  const uriVibeId = getCurrentUriVibeId();
  const storedVibeId = readBrowserStorage(VIBE_STORAGE_KEY);
  const storedOrLegacyVibeId = isVibeId(storedVibeId)
    ? storedVibeId
    : getVibeIdFromUri(`?vibe=${encodeURIComponent(storedVibeId ?? '')}`);
  const initialVibeId = uriVibeId ?? storedOrLegacyVibeId ?? defaultVibeId;

  return getVibeById(initialVibeId) ?? VIBE_PRESETS[0];
};
