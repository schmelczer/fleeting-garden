import type { PianoNoteRole } from './garden-audio-types';

export const DEFAULT_AUDIO_VOLUME = 0.5;
export const SILENT_AUDIO_GAIN = 0.0001;

type GardenAudioChordQuality = 'major' | 'minor' | 'sus2' | 'sus4';

export interface GardenAudioChord {
  rootOffset: number;
  quality: GardenAudioChordQuality;
}

export interface GardenAudioVibeSettings {
  idleIntensity: number;
  bpm: number;
  rampUpIntensity: number;
  rampUpTime: number;
  noteLength: number;
  notePitchOffset: number;
  brightness: number;
  scale?: Array<number>;
  progression?: Array<GardenAudioChord>;
}

export interface GardenAudioVibeProfile extends GardenAudioVibeSettings {
  rootMidi: number;
  scale: Array<number>;
  progression: Array<GardenAudioChord>;
}

export const defaultGardenAudioVibeSettings: GardenAudioVibeSettings = {
  idleIntensity: 0.08,
  bpm: 74,
  rampUpIntensity: 0.85,
  rampUpTime: 0.08,
  noteLength: 0.42,
  notePitchOffset: 0,
  brightness: 1,
};

export const createGardenAudioConfig = () => ({
  masterVolume: DEFAULT_AUDIO_VOLUME,
  fadeInSeconds: 0.45,
  updateRampSeconds: 0.08,
  delay: {
    timeBeats: 0.5,
    timeMinSeconds: 0.18,
    timeMaxSeconds: 0.72,
    feedback: 0.12,
    wetGain: 0.044,
    erasingActivity: 0.12,
    activityFeedbackWeight: 0.08,
    feedbackMax: 0.32,
    feedbackMin: 0.04,
    outputActivityWeight: 0.5,
    outputBase: 0.65,
    outputActivityDuck: 0.28,
    timeRampSeconds: 0.12,
  },
  piano: {
    maxVoices: 24,
    gain: 0.48,
    sustainSeconds: 0.42,
    sustainLevel: 0.26,
    releaseSeconds: 0.34,
    lowpassHz: 7000,
    gainAttackSeconds: 0.006,
    lowpassMaxHz: 12000,
    lowpassMinHz: 1400,
    sustainBase: 0.45,
    sustainVelocityRange: 0.55,
  },
  rhythm: {
    idleIntensity: defaultGardenAudioVibeSettings.idleIntensity,
    bpm: defaultGardenAudioVibeSettings.bpm,
    stepsPerBeat: 4,
    stepsPerBar: 16,
    sparseActivity: 0.055,
  },
  eraser: {
    minIntervalSeconds: 0.12,
    noiseGain: 0.028,
    filterMinHz: 650,
    filterMaxHz: 3600,
    durationSeconds: 0.08,
    pan: 0,
    pianoActivity: 0,
  },
  energy: {
    decaySeconds: 0.9,
    releaseSeconds: 1.15,
    strokeDecaySeconds: 0.32,
  },
  graph: {
    pianoBusGains: {
      pad: 0.86,
      support: 0.94,
      texture: 0.88,
      gesture: 1,
      brush: 0.9,
      stinger: 0.92,
    } satisfies Record<PianoNoteRole, number>,
    pianoBusActivityDucking: {
      pad: 0.42,
      support: 0.18,
      texture: -0.06,
      gesture: 0,
      brush: -0.08,
      stinger: 0,
    } satisfies Record<PianoNoteRole, number>,
    noiseBusGain: 0.72,
  },
  input: {
    fullActivitySpeed: 0.86,
    activityNoiseFloorSpeed: 0.025,
    activityCurve: 0.74,
    activitySoftCeiling: 0.96,
    activityAttackSeconds: 0.055,
    activityReleaseSeconds: 0.2,
    minAudibleDistance: 0.0025,
    manicActivityThreshold: 0.9,
    manicReleaseThreshold: 0.76,
    maniaSmoothingSeconds: 0.12,
  },
});

export type GardenAudioConfig = ReturnType<typeof createGardenAudioConfig>;
