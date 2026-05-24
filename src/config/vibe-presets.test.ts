import { describe, expect, it } from 'vitest';

import { runtimeControls } from './runtime-controls';
import { vibePresets } from './vibe-presets';

const FINAL_VIBE_NAMES = [
  'Aurora Mycelium Copy',
  'Velvet Observatory Copy',
  'Lichen Signal',
  'Tidepool Lantern',
  'Paper Lantern Fog',
  'Chrome Pollen',
];

const BLENDED_BRUSH_SIZE_MIN = 17;
const BLENDED_CLARITY_MAX = 0.56;
const SOFT_PARTICLE_BRUSH_SIZE_MAX = 5;
const SOFT_PARTICLE_CLARITY_MAX = 0.2;

// Performance guardrails — bumping any of these is an explicit perf trade-off.
const MAX_SPAWN_PER_PIXEL = runtimeControls.spawnPerPixel?.max ?? 0.38;
const MAX_BRUSH_SIZE = runtimeControls.brushSize?.max ?? 36;
const HIGH_DENSITY_SPAWN_THRESHOLD = 0.28;
const HIGH_DENSITY_DECAY_LIMIT = 940;
const HIGH_DENSITY_BRUSH_SIZE_LIMIT = 14;
const HIGH_DENSITY_TRAIL_WEIGHT_LIMIT = 0.055;

describe('vibePresets', () => {
  it('keeps the classic preset set distinct', () => {
    expect(vibePresets.map((preset) => preset.name)).toEqual(FINAL_VIBE_NAMES);

    const ids = vibePresets.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(vibePresets.length);
  });

  it('includes both blended and visibly particulate styles', () => {
    const blendedNames = vibePresets
      .filter(
        (preset) =>
          preset.settings.brushSize >= BLENDED_BRUSH_SIZE_MIN &&
          preset.settings.clarity <= BLENDED_CLARITY_MAX
      )
      .map((preset) => preset.name);
    const softParticleNames = vibePresets
      .filter(
        (preset) =>
          preset.settings.brushSize <= SOFT_PARTICLE_BRUSH_SIZE_MAX &&
          preset.settings.clarity <= SOFT_PARTICLE_CLARITY_MAX
      )
      .map((preset) => preset.name);

    expect(blendedNames).toEqual(['Tidepool Lantern']);
    expect(softParticleNames).toEqual(['Chrome Pollen']);
  });

  it('stays inside interactive performance guardrails', () => {
    const violations = vibePresets.flatMap((preset) => {
      const { name, settings } = preset;
      const presetViolations: Array<string> = [];

      if (settings.spawnPerPixel > MAX_SPAWN_PER_PIXEL) {
        presetViolations.push(`${name} density exceeds ${MAX_SPAWN_PER_PIXEL}`);
      }
      if (settings.brushSize > MAX_BRUSH_SIZE) {
        presetViolations.push(`${name} brush size exceeds ${MAX_BRUSH_SIZE}`);
      }
      if (
        settings.spawnPerPixel >= HIGH_DENSITY_SPAWN_THRESHOLD &&
        (settings.decayRateTrails > HIGH_DENSITY_DECAY_LIMIT ||
          settings.brushSize > HIGH_DENSITY_BRUSH_SIZE_LIMIT ||
          settings.individualTrailWeight > HIGH_DENSITY_TRAIL_WEIGHT_LIMIT)
      ) {
        presetViolations.push(`${name} combines high density with too much persistence`);
      }

      return presetViolations;
    });

    expect(violations).toEqual([]);
  });
});
