import type { VibePreset } from '../vibes';

export interface GardenAudioSnapshot {
  vibe: VibePreset;
  isErasing: boolean;
}

export interface GardenAudioStroke {
  vibe: VibePreset;
  from: ArrayLike<number>;
  to: ArrayLike<number>;
  canvasSize: ArrayLike<number>;
  isErasing: boolean;
  elapsedSeconds: number;
}

export interface LoadedPianoStrikeSample {
  midi: number;
  velocityLayer: number;
  buffer: AudioBuffer;
}

export interface LoadedPianoReleaseSample {
  midi: number;
  buffer: AudioBuffer;
}

export interface LoadedPianoSamples {
  releases: Array<LoadedPianoReleaseSample>;
  strikes: Array<LoadedPianoStrikeSample>;
}

export interface PianoNote {
  midi: number;
  velocity: number;
  startTime: number;
  durationSeconds: number;
  pan: number;
  role?: PianoNoteRole;
  delaySend?: number;
  lowpassHz?: number;
  sustainSeconds?: number;
}

export type PianoNoteRole =
  | 'pad'
  | 'support'
  | 'texture'
  | 'gesture'
  | 'brush'
  | 'stinger';

export interface NoiseBurst {
  startTime: number;
  durationSeconds: number;
  gain: number;
  filterHz: number;
  pan: number;
}
