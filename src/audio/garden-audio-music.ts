import type { VibePreset } from '../vibes';
import type { GardenAudioChord, GardenAudioVibeProfile } from './garden-audio-config';

export const PITCH_SEMITONES_PER_OCTAVE = 12;

const DEFAULT_PROGRESSION: ReadonlyArray<GardenAudioChord> = [
  { rootOffset: 0, quality: 'major' },
  { rootOffset: 9, quality: 'minor' },
  { rootOffset: 5, quality: 'major' },
  { rootOffset: 7, quality: 'major' },
];

const DEFAULT_ROOT_MIDI = 57;
const DEFAULT_SCALE: ReadonlyArray<number> = [0, 2, 4, 7, 9];

const getProfileScale = (vibe: VibePreset): Array<number> => {
  const scale = vibe.audio.scale?.length ? vibe.audio.scale : DEFAULT_SCALE;
  return [...scale];
};

const getProfileProgression = (vibe: VibePreset): Array<GardenAudioChord> =>
  (vibe.audio.progression?.length ? vibe.audio.progression : DEFAULT_PROGRESSION).map(
    (chord) => ({ ...chord })
  );

export const getVibeProfile = (vibe: VibePreset): GardenAudioVibeProfile => {
  return {
    ...vibe.audio,
    rootMidi: DEFAULT_ROOT_MIDI + vibe.audio.notePitchOffset,
    scale: getProfileScale(vibe),
    progression: getProfileProgression(vibe),
  };
};
