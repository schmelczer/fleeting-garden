export interface GardenAudioRegister {
  midiMin: number;
  midiMax: number;
  preferredMidi: number;
  pan: number;
}

export interface GardenAudioStylePool extends GardenAudioRegister {
  scaleDegrees: Array<number>;
}

interface GardenAudioStyleVoice {
  scaleDegreeOffset: number;
  velocityMultiplier: number;
  panOffset: number;
}

interface GenerativePianoTuning {
  stylePools: [GardenAudioStylePool, GardenAudioStylePool, GardenAudioStylePool];
  padRegisters: [GardenAudioRegister, GardenAudioRegister, GardenAudioRegister];
  vibeChangeStinger: {
    velocities: [number, number, number];
    pans: [number, number, number];
    delaySends: [number, number, number];
    lowpassExpression: number;
    noteDurationSeconds: number;
    spacingSeconds: number;
  };
  releaseResolution: {
    durationSeconds: number;
    fadeAfterSeconds: number;
    velocities: [number, number, number];
    delaySend: number;
    lowpassExpression: number;
    strumSeconds: number;
  };
  highActivityExtra: {
    barOffset: number;
    expressionMultiplier: number;
  };
  padChord: {
    velocities: [number, number, number];
    expressionVelocityWeight: number;
    delaySend: number;
    lowpassExpressionWeight: number;
  };
  supportNote: {
    velocityBase: number;
    velocityExpressionWeight: number;
    durationBaseSeconds: number;
    durationExpressionSeconds: number;
    delaySendBase: number;
    delaySendExpressionWeight: number;
    lowpassExpressionWeight: number;
    expressionThreshold: number;
    offsetsByStyle: [Array<number>, Array<number>, Array<number>];
  };
  textureNote: {
    velocityBase: number;
    velocityExpressionWeight: number;
    durationBaseSeconds: number;
    durationExpressionSeconds: number;
    delaySendBase: number;
    delaySendExpressionWeight: number;
    idleExpressionThreshold: number;
    mediumExpressionThreshold: number;
    intenseSpacing: number;
    idlePhase: number;
  };
  gestureAccent: {
    rotationStrengthMultiplier: number;
    quantizeStepLookahead: number;
    velocityBase: number;
    velocityStrengthWeight: number;
    durationBaseSeconds: number;
    durationStrengthSeconds: number;
    delaySend: number;
  };
  touchNote: {
    velocityBase: number;
    velocityStrengthWeight: number;
    durationBaseSeconds: number;
    durationStrengthSeconds: number;
    delaySend: number;
    lowpassBaseExpression: number;
    lowpassStrengthWeight: number;
  };
  brushPhrase: {
    initialMotifOffset: number;
    energyDecaySeconds: number;
    maniaDecaySeconds: number;
    layerIntensityBase: number;
    layerIntensityManiaWeight: number;
    frameActivityWeight: number;
    frameManiaWeight: number;
  };
  brushStream: {
    inferredManiaThreshold: number;
    inferredManiaRange: number;
    registerManiaShift: number;
    chordToneEverySteps: number;
    durationBaseSeconds: number;
    durationIntensitySeconds: number;
    durationManiaSeconds: number;
    durationMinSeconds: number;
    durationMaxSeconds: number;
    delaySendBase: number;
    delaySendIntensityWeight: number;
    delaySendManiaWeight: number;
    delaySendMin: number;
    delaySendMax: number;
    velocityBase: number;
    velocityIntensityWeight: number;
    lowpassBaseExpression: number;
    lowpassIntensityWeight: number;
    lowpassManiaWeight: number;
    intenseThreshold: number;
    activeThreshold: number;
  };
  brushStreamEcho: {
    maniaThreshold: number;
    stepModulo: number;
    stepRemainder: number;
    intensityThreshold: number;
    octaveSemitones: number;
    maxMidi: number;
    velocityBase: number;
    velocityIntensityWeight: number;
    durationMinSeconds: number;
    durationScale: number;
    panScale: number;
    delaySendMin: number;
    delaySendScale: number;
    lowpassBaseExpression: number;
    lowpassManiaWeight: number;
  };
  brushMotif: {
    highThreshold: number;
    mediumThreshold: number;
    highOffset: number;
    mediumOffset: number;
    lowOffset: number;
  };
  registerBias: {
    maniaShiftSemitones: number;
    midiMin: number;
    midiMaxForMin: number;
    minimumSpan: number;
    midiMax: number;
  };
  candidateOctaveSearch: {
    min: number;
    max: number;
  };
  stereoWidth: {
    idle: number;
    active: number;
    intense: number;
    intenseThreshold: number;
  };
  stylePanOffsetScale: number;
  lowpass: {
    midiBase: number;
    midiRange: number;
    midiLiftHz: number;
    expressionBase: number;
    expressionWeight: number;
  };
  styleRotationBars: number;
  chordBars: number;
  supportBarSpacing: number;
  supportBarOffset: number;
  idleTextureBarSpacing: number;
  mediumTextureBarSpacing: number;
  textureBeat: number;
  highActivityExtraBeat: number;
  highActivityExtraThreshold: number;
  noteScorePreferenceWeight: number;
  noteScoreRegisterWeight: number;
  noteScoreChordToneWeight: number;
  noteScoreRepeatPenalty: number;
  gestureAccentMinIntervalSeconds: number;
  strokeAccentMinSteps: number;
  strokeAccentThreshold: number;
  maxBrushPhraseLayers: number;
  maxBrushStreamNotesPerBar: number;
  brushLayerBaseSeconds: number;
  brushLayerEnergySeconds: number;
  brushLayerMinIntensity: number;
  brushStreamIdleIntervalBeats: number;
  brushStreamActiveIntervalBeats: number;
  brushStreamIntenseIntervalBeats: number;
  brushMotifMaxSteps: number;
  brushMotifCanonDelaySeconds: number;
  padDurationBarScale: number;
}

export const generativePianoTuning: GenerativePianoTuning = {
  stylePools: [
    {
      midiMin: 48,
      midiMax: 67,
      preferredMidi: 55,
      pan: -0.18,
      scaleDegrees: [0, 1, 2, 4],
    },
    {
      midiMin: 55,
      midiMax: 74,
      preferredMidi: 63,
      pan: 0,
      scaleDegrees: [1, 2, 3, 5],
    },
    {
      midiMin: 62,
      midiMax: 78,
      preferredMidi: 70,
      pan: 0.18,
      scaleDegrees: [2, 3, 4, 6],
    },
  ],
  padRegisters: [
    {
      midiMin: 40,
      midiMax: 55,
      preferredMidi: 48,
      pan: -0.12,
    },
    {
      midiMin: 48,
      midiMax: 64,
      preferredMidi: 55,
      pan: 0.08,
    },
    {
      midiMin: 58,
      midiMax: 76,
      preferredMidi: 67,
      pan: 0.2,
    },
  ],
  vibeChangeStinger: {
    velocities: [0.1, 0.085, 0.07],
    pans: [-0.16, 0, 0.16],
    delaySends: [0.012, 0.014, 0.016],
    lowpassExpression: 0.35,
    noteDurationSeconds: 1.1,
    spacingSeconds: 0.08,
  },
  releaseResolution: {
    durationSeconds: 3.4,
    fadeAfterSeconds: 2.4,
    velocities: [0.064, 0.05, 0.038],
    delaySend: 0.018,
    lowpassExpression: 0.34,
    strumSeconds: 0.055,
  },
  highActivityExtra: {
    barOffset: 1,
    expressionMultiplier: 0.9,
  },
  padChord: {
    velocities: [0.046, 0.036, 0.029],
    expressionVelocityWeight: 0.018,
    delaySend: 0.008,
    lowpassExpressionWeight: 0.24,
  },
  supportNote: {
    velocityBase: 0.105,
    velocityExpressionWeight: 0.07,
    durationBaseSeconds: 1.35,
    durationExpressionSeconds: 0.4,
    delaySendBase: 0.016,
    delaySendExpressionWeight: 0.006,
    lowpassExpressionWeight: 0.7,
    expressionThreshold: 0.55,
    offsetsByStyle: [
      [0, 2, 12],
      [1, 2, 0, 12],
      [2, 12, 3, 13],
    ],
  },
  textureNote: {
    velocityBase: 0.09,
    velocityExpressionWeight: 0.08,
    durationBaseSeconds: 0.62,
    durationExpressionSeconds: 0.24,
    delaySendBase: 0.016,
    delaySendExpressionWeight: 0.006,
    idleExpressionThreshold: 0.35,
    mediumExpressionThreshold: 0.7,
    intenseSpacing: 1,
    idlePhase: 1,
  },
  gestureAccent: {
    rotationStrengthMultiplier: 3,
    quantizeStepLookahead: 1,
    velocityBase: 0.12,
    velocityStrengthWeight: 0.09,
    durationBaseSeconds: 0.48,
    durationStrengthSeconds: 0.22,
    delaySend: 0.012,
  },
  touchNote: {
    velocityBase: 0.14,
    velocityStrengthWeight: 0.11,
    durationBaseSeconds: 0.55,
    durationStrengthSeconds: 0.18,
    delaySend: 0.006,
    lowpassBaseExpression: 0.55,
    lowpassStrengthWeight: 0.35,
  },
  brushPhrase: {
    initialMotifOffset: -1,
    energyDecaySeconds: 0.72,
    maniaDecaySeconds: 0.54,
    layerIntensityBase: 0.8,
    layerIntensityManiaWeight: 0.42,
    frameActivityWeight: 0.42,
    frameManiaWeight: 0.18,
  },
  brushStream: {
    inferredManiaThreshold: 0.82,
    inferredManiaRange: 0.18,
    registerManiaShift: 0.3,
    chordToneEverySteps: 4,
    durationBaseSeconds: 0.48,
    durationIntensitySeconds: 0.08,
    durationManiaSeconds: 0.34,
    durationMinSeconds: 0.14,
    durationMaxSeconds: 0.62,
    delaySendBase: 0.012,
    delaySendIntensityWeight: 0.011,
    delaySendManiaWeight: 0.006,
    delaySendMin: 0.006,
    delaySendMax: 0.032,
    velocityBase: 0.1,
    velocityIntensityWeight: 0.1,
    lowpassBaseExpression: 0.39,
    lowpassIntensityWeight: 0.48,
    lowpassManiaWeight: 0.18,
    intenseThreshold: 0.68,
    activeThreshold: 0.34,
  },
  brushStreamEcho: {
    maniaThreshold: 0.92,
    stepModulo: 3,
    stepRemainder: 1,
    intensityThreshold: 0.95,
    octaveSemitones: 12,
    maxMidi: 84,
    velocityBase: 0.035,
    velocityIntensityWeight: 0.04,
    durationMinSeconds: 0.11,
    durationScale: 0.68,
    panScale: -0.75,
    delaySendMin: 0.006,
    delaySendScale: 0.72,
    lowpassBaseExpression: 0.62,
    lowpassManiaWeight: 0.24,
  },
  brushMotif: {
    highThreshold: 0.82,
    mediumThreshold: 0.55,
    highOffset: 1,
    mediumOffset: 0,
    lowOffset: -1,
  },
  registerBias: {
    maniaShiftSemitones: 2,
    midiMin: 36,
    midiMaxForMin: 86,
    minimumSpan: 4,
    midiMax: 91,
  },
  candidateOctaveSearch: {
    min: -3,
    max: 3,
  },
  stereoWidth: {
    idle: 0.46,
    active: 0.9,
    intense: 1.16,
    intenseThreshold: 0.72,
  },
  stylePanOffsetScale: 0.35,
  lowpass: {
    midiBase: 48,
    midiRange: 33,
    midiLiftHz: 500,
    expressionBase: 0.58,
    expressionWeight: 0.32,
  },
  styleRotationBars: 2,
  chordBars: 4,
  supportBarSpacing: 2,
  supportBarOffset: 1,
  idleTextureBarSpacing: 2,
  mediumTextureBarSpacing: 1,
  textureBeat: 2,
  highActivityExtraBeat: 3,
  highActivityExtraThreshold: 0.45,
  noteScorePreferenceWeight: 1.8,
  noteScoreRegisterWeight: 0.28,
  noteScoreChordToneWeight: 0.75,
  noteScoreRepeatPenalty: 3.2,
  gestureAccentMinIntervalSeconds: 2.5,
  strokeAccentMinSteps: 12,
  strokeAccentThreshold: 0.58,
  maxBrushPhraseLayers: 3,
  maxBrushStreamNotesPerBar: 7,
  brushLayerBaseSeconds: 5.5,
  brushLayerEnergySeconds: 2.5,
  brushLayerMinIntensity: 0.12,
  brushStreamIdleIntervalBeats: 2,
  brushStreamActiveIntervalBeats: 1,
  brushStreamIntenseIntervalBeats: 0.75,
  brushMotifMaxSteps: 8,
  brushMotifCanonDelaySeconds: 0.055,
  padDurationBarScale: 0.82,
};

export const styleVoices: [
  GardenAudioStyleVoice,
  GardenAudioStyleVoice,
  GardenAudioStyleVoice,
] = [
  {
    scaleDegreeOffset: 0,
    velocityMultiplier: 0.92,
    panOffset: -0.14,
  },
  {
    scaleDegreeOffset: 1,
    velocityMultiplier: 1,
    panOffset: 0,
  },
  {
    scaleDegreeOffset: 2,
    velocityMultiplier: 0.86,
    panOffset: 0.14,
  },
];
