import { clamp, clamp01 } from '../utils/math';
import type { VibePreset } from '../vibes';
import type {
  GardenAudioChord,
  GardenAudioConfig,
  GardenAudioVibeProfile,
} from './garden-audio-config';
import { getVibeProfile, PITCH_SEMITONES_PER_OCTAVE } from './garden-audio-music';
import type { PianoNote } from './garden-audio-types';
import {
  generativePianoTuning,
  styleVoices,
  type GardenAudioRegister,
  type GardenAudioStylePool,
} from './generative-piano-tuning';
import { PIANO_SCHEDULE_AHEAD_SECONDS } from './piano-sampler';

const GENERATIVE_LOOKAHEAD_SECONDS = 0.3;
const GENERATIVE_START_DELAY_SECONDS = 0.02;
const TEXTURE_ONSET_EXPRESSION = 0.15;
const SUPPORT_ONSET_EXPRESSION = 0.4;

const chordVoicings: Record<
  GardenAudioChord['quality'],
  { closed: Array<number>; open: Array<number> }
> = {
  major: {
    closed: [0, 4, 7, 12, 16],
    open: [0, 7, 12, 16],
  },
  minor: {
    closed: [0, 3, 7, 12, 15],
    open: [0, 7, 12, 15],
  },
  sus2: {
    closed: [0, 2, 7, 12, 14],
    open: [0, 7, 12, 14],
  },
  sus4: {
    closed: [0, 5, 7, 12, 17],
    open: [0, 7, 12, 17],
  },
};

const getChordIntervals = (
  chord: GardenAudioChord,
  openVoicing: boolean
): Array<number> => {
  const voicing = chordVoicings[chord.quality];
  return openVoicing ? voicing.open : voicing.closed;
};

const degreeToSemitone = (profile: GardenAudioVibeProfile, degree: number): number => {
  const scaleIndex =
    ((degree % profile.scale.length) + profile.scale.length) % profile.scale.length;
  const octave = Math.floor(degree / profile.scale.length);
  return profile.scale[scaleIndex] + octave * PITCH_SEMITONES_PER_OCTAVE;
};

type GardenAudioStyleIndex = 0 | 1 | 2;

interface PitchCandidate {
  midi: number;
  preference: number;
  chordToneDistance: number;
}

interface PitchSource {
  baseMidi: number;
  offsets: ReadonlyArray<number>;
  chordOffsets?: ReadonlyArray<number>;
}

interface BrushPhraseLayer {
  vibe: VibePreset;
  startedAt: number;
  lastUpdatedAt: number;
  expiresAt: number;
  styleIndex: GardenAudioStyleIndex;
  energy: number;
  motifOffsets: Array<number>;
  maniaAmount: number;
}

export class GenerativePianoEngine {
  private nextBeatStep: number | null = null;
  private timelineStartedAt: number | null = null;
  private activeProfile: GardenAudioVibeProfile | null = null;
  private isWaitingForGestureAccent = false;
  private lastGestureAccentAt = Number.NEGATIVE_INFINITY;
  private lastStrokeAccentStep = Number.NEGATIVE_INFINITY;
  private readonly lastMidiByStyle: [number | null, number | null, number | null] = [
    null,
    null,
    null,
  ];
  private readonly lastPadMidiByVoice: [number | null, number | null, number | null] = [
    null,
    null,
    null,
  ];
  private brushPhraseLayers: Array<BrushPhraseLayer> = [];
  private nextBrushStreamStep: number | null = null;
  private brushStreamNoteIndex = 0;
  private lastBrushStreamMidi: number | null = null;
  private readonly brushStreamNoteCountsByBar = new Map<number, number>();

  public constructor(
    private readonly config: GardenAudioConfig,
    private readonly playNote: (note: PianoNote) => void
  ) {}

  public prime(now: number, profile: GardenAudioVibeProfile): void {
    this.activeProfile = profile;
    this.timelineStartedAt ??= now;
    this.nextBeatStep ??= 0;
    this.nextBrushStreamStep ??= 0;
  }

  public cue(now: number, profile?: GardenAudioVibeProfile): void {
    if (profile) {
      this.activeProfile = profile;
    }
    this.nextBeatStep = 0;
    this.timelineStartedAt = now;
    this.nextBrushStreamStep = 0;
    this.brushStreamNoteIndex = 0;
    this.lastBrushStreamMidi = null;
    this.brushStreamNoteCountsByBar.clear();
  }

  public beginGesture(): void {
    this.isWaitingForGestureAccent = true;
  }

  public endGesture(): void {
    this.isWaitingForGestureAccent = false;
  }

  public release(vibe: VibePreset, now: number): number {
    const profile = getVibeProfile(vibe);
    this.prime(now, profile);
    this.isWaitingForGestureAccent = false;
    const releaseStep = this.getReleaseResolutionStep(now);
    const releaseStart = Math.max(now, this.getTimeForStep(releaseStep));

    this.playReleaseResolution(profile, releaseStep, releaseStart);
    this.nextBeatStep = null;
    this.nextBrushStreamStep = null;
    this.brushPhraseLayers = [];
    this.brushStreamNoteCountsByBar.clear();

    return releaseStart + generativePianoTuning.releaseResolution.fadeAfterSeconds;
  }

  private recordTouchDown({
    vibe,
    now,
    strength,
    maniaAmount = 0,
  }: {
    vibe: VibePreset;
    now: number;
    strength: number;
    maniaAmount?: number;
  }): void {
    const normalizedStrength = clamp01(strength);
    const normalizedManiaAmount = clamp01(maniaAmount);
    const styleIndex = this.getStyleIndex(now);

    this.isWaitingForGestureAccent = false;
    this.lastGestureAccentAt = now;
    this.lastStrokeAccentStep = this.getStepIndexAtTime(now);
    this.startBrushPhraseLayer({
      vibe,
      now,
      strength: normalizedStrength,
      styleIndex,
      maniaAmount: normalizedManiaAmount,
    });
    this.playTouchNote({
      vibe,
      now,
      styleIndex,
      strength: normalizedStrength,
    });
  }

  public recordStroke({
    vibe,
    now,
    activity,
    maniaAmount = 0,
  }: {
    vibe: VibePreset;
    now: number;
    activity: number;
    maniaAmount?: number;
  }): void {
    const profile = getVibeProfile(vibe);
    this.prime(now, profile);
    const strength = clamp01(activity);
    const normalizedManiaAmount = clamp01(maniaAmount);
    const styleIndex = this.getStyleIndex(now);
    const accentStep = this.getNextStepIndexAt(
      now,
      generativePianoTuning.gestureAccent.quantizeStepLookahead
    );

    if (
      this.isWaitingForGestureAccent &&
      now - this.lastGestureAccentAt >=
        generativePianoTuning.gestureAccentMinIntervalSeconds
    ) {
      this.recordTouchDown({
        vibe,
        now,
        strength,
        maniaAmount: normalizedManiaAmount,
      });
      return;
    }

    this.isWaitingForGestureAccent = false;
    this.updateBrushPhraseLayer({
      now,
      strength,
      styleIndex,
      maniaAmount: normalizedManiaAmount,
    });
    if (
      strength >= generativePianoTuning.strokeAccentThreshold &&
      accentStep - this.lastStrokeAccentStep >= generativePianoTuning.strokeAccentMinSteps
    ) {
      this.lastStrokeAccentStep = accentStep;
      this.playGestureAccent(vibe, accentStep, styleIndex, strength);
    }
  }

  public renderLookahead({
    vibe,
    now,
    activity,
    lookaheadSeconds = GENERATIVE_LOOKAHEAD_SECONDS,
  }: {
    vibe: VibePreset;
    now: number;
    activity: number;
    lookaheadSeconds?: number;
  }): void {
    const profile = getVibeProfile(vibe);
    this.prime(now, profile);
    this.skipLateBeats(now);

    if (this.nextBeatStep === null) {
      return;
    }

    const lookaheadEnd = now + lookaheadSeconds;
    const expression = this.getExpression(activity);
    while (this.getTimeForStep(this.nextBeatStep) <= lookaheadEnd) {
      const beatIndex = this.getBeatIndexForStep(this.nextBeatStep);
      this.renderBeat({
        profile,
        beatIndex,
        startTime: this.getTimeForStep(this.nextBeatStep),
        expression,
      });
      this.nextBeatStep += this.config.rhythm.stepsPerBeat;
    }
    this.renderBrushPhraseLayers({
      vibe,
      now,
      lookaheadEnd,
      activity: expression,
    });
  }

  public playVibeChangeStinger(vibe: VibePreset, now: number): void {
    const profile = getVibeProfile(vibe);
    const chord = this.getChord(profile, 0);
    const intervals = getChordIntervals(chord, true);
    const rootMidi = profile.rootMidi + chord.rootOffset;
    const stinger = generativePianoTuning.vibeChangeStinger;
    const offsetsByVoice: ReadonlyArray<ReadonlyArray<number>> = [
      [0],
      [intervals[1], intervals[2]],
      [intervals[3], intervals[2]],
    ];

    offsetsByVoice.forEach((offsets, index) => {
      const midi = this.chooseMidi(
        { baseMidi: rootMidi, offsets },
        generativePianoTuning.padRegisters[index]
      );
      this.playProfileNote(profile, {
        midi,
        velocity: stinger.velocities[index],
        pan: stinger.pans[index],
        delaySend: stinger.delaySends[index],
        durationSeconds: stinger.noteDurationSeconds,
        role: 'stinger',
        lowpassHz: this.getLowpassHz(profile, midi, stinger.lowpassExpression),
        startTime: now + index * stinger.spacingSeconds,
      });
    });
  }

  public reset(): void {
    this.nextBeatStep = null;
    this.timelineStartedAt = null;
    this.activeProfile = null;
    this.isWaitingForGestureAccent = false;
    this.lastGestureAccentAt = Number.NEGATIVE_INFINITY;
    this.lastStrokeAccentStep = Number.NEGATIVE_INFINITY;
    this.lastMidiByStyle.fill(null);
    this.lastPadMidiByVoice.fill(null);
    this.brushPhraseLayers = [];
    this.nextBrushStreamStep = null;
    this.brushStreamNoteIndex = 0;
    this.lastBrushStreamMidi = null;
    this.brushStreamNoteCountsByBar.clear();
  }

  private playProfileNote(profile: GardenAudioVibeProfile, note: PianoNote): void {
    this.playNote({
      ...note,
      sustainSeconds: profile.noteLength,
    });
  }

  private renderBeat({
    profile,
    beatIndex,
    startTime,
    expression,
  }: {
    profile: GardenAudioVibeProfile;
    beatIndex: number;
    startTime: number;
    expression: number;
  }): void {
    const beatsPerBar = this.getBeatsPerBar();
    const beatInBar = beatIndex % beatsPerBar;
    const barIndex = Math.floor(beatIndex / beatsPerBar);
    const styleIndex = this.getStyleIndex(startTime);

    if (beatInBar === 0 && barIndex % generativePianoTuning.chordBars === 0) {
      this.playPadChord(profile, barIndex, startTime, expression);
    }

    if (beatInBar === 0 && this.shouldPlaySupport(expression, barIndex)) {
      this.playSupportNote(profile, barIndex, startTime, expression, styleIndex);
    }

    if (
      beatInBar === generativePianoTuning.textureBeat &&
      this.shouldPlayTexture(expression, barIndex)
    ) {
      this.playTextureNote(profile, barIndex, startTime, expression, styleIndex);
    }

    if (
      beatInBar === generativePianoTuning.highActivityExtraBeat &&
      expression >= generativePianoTuning.highActivityExtraThreshold
    ) {
      this.playTextureNote(
        profile,
        barIndex + generativePianoTuning.highActivityExtra.barOffset,
        startTime,
        expression * generativePianoTuning.highActivityExtra.expressionMultiplier,
        styleIndex
      );
    }
  }

  private playPadChord(
    profile: GardenAudioVibeProfile,
    barIndex: number,
    startTime: number,
    expression: number
  ): void {
    const chord = this.getChord(profile, barIndex);
    const intervals = getChordIntervals(chord, true);
    const rootMidi = profile.rootMidi + chord.rootOffset;
    const durationSeconds =
      this.getBarDurationSeconds() *
      generativePianoTuning.chordBars *
      generativePianoTuning.padDurationBarScale;
    const notes = [
      {
        source: { baseMidi: rootMidi, offsets: [0] },
        register: generativePianoTuning.padRegisters[0],
        velocity: generativePianoTuning.padChord.velocities[0],
      },
      {
        source: { baseMidi: rootMidi, offsets: [intervals[1]] },
        register: generativePianoTuning.padRegisters[1],
        velocity: generativePianoTuning.padChord.velocities[1],
      },
      {
        source: { baseMidi: rootMidi, offsets: [intervals[3], intervals[2]] },
        register: generativePianoTuning.padRegisters[2],
        velocity: generativePianoTuning.padChord.velocities[2],
      },
    ];

    notes.forEach(({ source, register, velocity }, index) => {
      const midi = this.chooseMidi(
        source,
        register,
        this.lastPadMidiByVoice[index],
        false
      );
      this.lastPadMidiByVoice[index] = midi;
      this.playProfileNote(profile, {
        midi,
        velocity:
          velocity + expression * generativePianoTuning.padChord.expressionVelocityWeight,
        startTime,
        durationSeconds,
        pan: this.getActivityPan(register.pan, expression),
        role: 'pad',
        delaySend: generativePianoTuning.padChord.delaySend,
        lowpassHz: this.getLowpassHz(
          profile,
          midi,
          expression * generativePianoTuning.padChord.lowpassExpressionWeight
        ),
      });
    });
  }

  private playReleaseResolution(
    profile: GardenAudioVibeProfile,
    stepIndex: number,
    startTime: number
  ): void {
    const chord = this.getChord(profile, this.getBarIndexForStep(stepIndex));
    const intervals = getChordIntervals(chord, true);
    const rootMidi = profile.rootMidi + chord.rootOffset;
    const release = generativePianoTuning.releaseResolution;
    const offsetsByVoice: ReadonlyArray<ReadonlyArray<number>> = [
      [0],
      [intervals[1], intervals[2]],
      [intervals[3], intervals[2]],
    ];

    offsetsByVoice.forEach((offsets, index) => {
      const register = generativePianoTuning.padRegisters[index];
      const midi = this.chooseMidi(
        { baseMidi: rootMidi, offsets },
        register,
        null,
        false
      );
      this.playProfileNote(profile, {
        midi,
        velocity: release.velocities[index],
        startTime: startTime + index * release.strumSeconds,
        durationSeconds: release.durationSeconds,
        pan: this.getActivityPan(register.pan, 0),
        role: 'pad',
        delaySend: release.delaySend,
        lowpassHz: this.getLowpassHz(profile, midi, release.lowpassExpression),
      });
    });
  }

  private playSupportNote(
    profile: GardenAudioVibeProfile,
    barIndex: number,
    startTime: number,
    expression: number,
    styleIndex: GardenAudioStyleIndex
  ): void {
    const pool = generativePianoTuning.stylePools[styleIndex];
    const chord = this.getChord(profile, barIndex);
    const chordIntervals = getChordIntervals(chord, false);
    const rootMidi = profile.rootMidi + chord.rootOffset;
    const midi = this.chooseMidi(
      {
        baseMidi: rootMidi,
        offsets: this.getSupportOffsets(chordIntervals, styleIndex),
        chordOffsets: chordIntervals,
      },
      pool,
      this.lastMidiByStyle[styleIndex],
      true
    );

    this.lastMidiByStyle[styleIndex] = midi;
    this.playProfileNote(profile, {
      midi,
      velocity:
        (generativePianoTuning.supportNote.velocityBase +
          expression * generativePianoTuning.supportNote.velocityExpressionWeight) *
        styleVoices[styleIndex].velocityMultiplier,
      startTime,
      durationSeconds:
        generativePianoTuning.supportNote.durationBaseSeconds +
        expression * generativePianoTuning.supportNote.durationExpressionSeconds,
      pan: this.getStylePan(styleIndex, expression),
      role: 'support',
      delaySend:
        generativePianoTuning.supportNote.delaySendBase +
        expression * generativePianoTuning.supportNote.delaySendExpressionWeight,
      lowpassHz: this.getLowpassHz(
        profile,
        midi,
        expression * generativePianoTuning.supportNote.lowpassExpressionWeight
      ),
    });
  }

  private playTextureNote(
    profile: GardenAudioVibeProfile,
    barIndex: number,
    startTime: number,
    expression: number,
    styleIndex: GardenAudioStyleIndex
  ): void {
    const pool = generativePianoTuning.stylePools[styleIndex];
    const chord = this.getChord(profile, barIndex);
    const chordIntervals = getChordIntervals(chord, false);
    const degrees = this.rotate(pool.scaleDegrees, barIndex + styleIndex);
    const midi = this.chooseMidi(
      {
        baseMidi: profile.rootMidi,
        offsets: degrees.map((degree) => degreeToSemitone(profile, degree)),
        chordOffsets: this.getChordOffsets(chord, chordIntervals),
      },
      pool,
      this.lastMidiByStyle[styleIndex],
      true
    );

    this.lastMidiByStyle[styleIndex] = midi;
    this.playProfileNote(profile, {
      midi,
      velocity:
        (generativePianoTuning.textureNote.velocityBase +
          expression * generativePianoTuning.textureNote.velocityExpressionWeight) *
        styleVoices[styleIndex].velocityMultiplier,
      startTime,
      durationSeconds:
        generativePianoTuning.textureNote.durationBaseSeconds +
        expression * generativePianoTuning.textureNote.durationExpressionSeconds,
      pan: this.getStylePan(styleIndex, expression),
      role: 'texture',
      delaySend:
        generativePianoTuning.textureNote.delaySendBase +
        expression * generativePianoTuning.textureNote.delaySendExpressionWeight,
      lowpassHz: this.getLowpassHz(profile, midi, expression),
    });
  }

  private playGestureAccent(
    vibe: VibePreset,
    stepIndex: number,
    styleIndex: GardenAudioStyleIndex,
    strength: number
  ): void {
    const profile = getVibeProfile(vibe);
    const pool = generativePianoTuning.stylePools[styleIndex];
    const startTime = this.getTimeForStep(stepIndex);
    const chord = this.getChord(profile, this.getBarIndexForStep(stepIndex));
    const chordIntervals = getChordIntervals(chord, false);
    const degrees = this.rotate(
      pool.scaleDegrees,
      Math.round(
        strength * generativePianoTuning.gestureAccent.rotationStrengthMultiplier
      )
    );

    const midi = this.chooseMidi(
      {
        baseMidi: profile.rootMidi,
        offsets: degrees.map((degree) => degreeToSemitone(profile, degree)),
        chordOffsets: this.getChordOffsets(chord, chordIntervals),
      },
      pool,
      this.lastMidiByStyle[styleIndex],
      true
    );

    this.lastMidiByStyle[styleIndex] = midi;
    this.playProfileNote(profile, {
      midi,
      velocity:
        (generativePianoTuning.gestureAccent.velocityBase +
          strength * generativePianoTuning.gestureAccent.velocityStrengthWeight) *
        styleVoices[styleIndex].velocityMultiplier,
      startTime,
      durationSeconds:
        generativePianoTuning.gestureAccent.durationBaseSeconds +
        strength * generativePianoTuning.gestureAccent.durationStrengthSeconds,
      pan: this.getStylePan(styleIndex, strength),
      role: 'gesture',
      delaySend: generativePianoTuning.gestureAccent.delaySend,
      lowpassHz: this.getLowpassHz(profile, midi, strength),
    });
  }

  private playTouchNote({
    vibe,
    now,
    styleIndex,
    strength,
  }: {
    vibe: VibePreset;
    now: number;
    styleIndex: GardenAudioStyleIndex;
    strength: number;
  }): void {
    const profile = getVibeProfile(vibe);
    const pool = generativePianoTuning.stylePools[styleIndex];
    const chord = this.getChord(profile, this.getGlobalBarIndex(now));
    const chordIntervals = getChordIntervals(chord, false);
    const rootMidi = profile.rootMidi + chord.rootOffset;
    const midi = this.chooseMidi(
      {
        baseMidi: rootMidi,
        offsets: this.getSupportOffsets(chordIntervals, styleIndex),
      },
      pool,
      this.lastMidiByStyle[styleIndex],
      true
    );

    this.lastMidiByStyle[styleIndex] = midi;
    this.lastBrushStreamMidi = midi;
    this.playProfileNote(profile, {
      midi,
      velocity:
        (generativePianoTuning.touchNote.velocityBase +
          strength * generativePianoTuning.touchNote.velocityStrengthWeight) *
        styleVoices[styleIndex].velocityMultiplier,
      startTime: now,
      durationSeconds:
        generativePianoTuning.touchNote.durationBaseSeconds +
        strength * generativePianoTuning.touchNote.durationStrengthSeconds,
      pan: this.getStylePan(styleIndex, strength),
      role: 'gesture',
      delaySend: generativePianoTuning.touchNote.delaySend,
      lowpassHz: this.getLowpassHz(
        profile,
        midi,
        clamp01(
          generativePianoTuning.touchNote.lowpassBaseExpression +
            strength * generativePianoTuning.touchNote.lowpassStrengthWeight
        )
      ),
    });
  }

  private startBrushPhraseLayer({
    vibe,
    now,
    strength,
    styleIndex,
    maniaAmount,
  }: {
    vibe: VibePreset;
    now: number;
    strength: number;
    styleIndex: GardenAudioStyleIndex;
    maniaAmount: number;
  }): void {
    const lifetimeSeconds =
      generativePianoTuning.brushLayerBaseSeconds +
      strength * generativePianoTuning.brushLayerEnergySeconds;
    const expiresAt = this.getNextBarTimeAt(now + lifetimeSeconds);

    this.brushPhraseLayers.push({
      vibe,
      startedAt: now,
      lastUpdatedAt: now,
      expiresAt,
      styleIndex,
      energy: strength,
      motifOffsets: [styleIndex + generativePianoTuning.brushPhrase.initialMotifOffset],
      maniaAmount,
    });

    if (this.brushPhraseLayers.length > generativePianoTuning.maxBrushPhraseLayers) {
      this.brushPhraseLayers = this.brushPhraseLayers.slice(
        -generativePianoTuning.maxBrushPhraseLayers
      );
    }
  }

  private updateBrushPhraseLayer({
    now,
    strength,
    styleIndex,
    maniaAmount,
  }: {
    now: number;
    strength: number;
    styleIndex: GardenAudioStyleIndex;
    maniaAmount: number;
  }): void {
    const layer = this.brushPhraseLayers[this.brushPhraseLayers.length - 1];
    if (!layer || layer.expiresAt <= now) {
      return;
    }

    const elapsedSeconds = Math.max(0, now - layer.lastUpdatedAt);
    layer.lastUpdatedAt = now;
    layer.styleIndex = styleIndex;
    layer.energy = Math.max(
      layer.energy *
        Math.exp(-elapsedSeconds / generativePianoTuning.brushPhrase.energyDecaySeconds),
      strength
    );
    layer.maniaAmount = Math.max(
      layer.maniaAmount *
        Math.exp(-elapsedSeconds / generativePianoTuning.brushPhrase.maniaDecaySeconds),
      maniaAmount
    );
    layer.motifOffsets.push(this.getMotifOffset(strength));
    if (layer.motifOffsets.length > generativePianoTuning.brushMotifMaxSteps) {
      layer.motifOffsets = layer.motifOffsets.slice(
        -generativePianoTuning.brushMotifMaxSteps
      );
    }
  }

  private renderBrushPhraseLayers({
    vibe,
    now,
    lookaheadEnd,
    activity,
  }: {
    vibe: VibePreset;
    now: number;
    lookaheadEnd: number;
    activity: number;
  }): void {
    const earliestStart = now + PIANO_SCHEDULE_AHEAD_SECONDS;
    this.nextBrushStreamStep ??= 0;
    this.pruneBrushStreamNoteCounts(this.getGlobalBarIndex(now) - 1);

    this.brushPhraseLayers = this.brushPhraseLayers.filter(
      (layer) => layer.expiresAt > earliestStart
    );

    while (this.getTimeForStep(this.nextBrushStreamStep) < earliestStart) {
      const frame = this.getBrushStreamFrame(
        this.getTimeForStep(this.nextBrushStreamStep),
        activity
      );
      this.nextBrushStreamStep += this.getBrushStreamIntervalSteps(frame.intensity);
      this.brushStreamNoteIndex += 1;
    }

    while (this.getTimeForStep(this.nextBrushStreamStep) <= lookaheadEnd) {
      const startTime = this.getTimeForStep(this.nextBrushStreamStep);
      const frame = this.getBrushStreamFrame(startTime, activity);
      if (
        frame.intensity >= generativePianoTuning.brushLayerMinIntensity &&
        this.reserveBrushStreamNote(this.nextBrushStreamStep)
      ) {
        this.playBrushStreamNote({
          vibe,
          startTime,
          stepIndex: this.nextBrushStreamStep,
          intensity: frame.intensity,
          styleIndex: this.getStyleIndex(startTime),
          layer: frame.layer,
        });
      }
      this.nextBrushStreamStep += this.getBrushStreamIntervalSteps(frame.intensity);
      this.brushStreamNoteIndex += 1;
    }
  }

  private playBrushStreamNote({
    vibe,
    startTime,
    stepIndex,
    intensity,
    styleIndex,
    layer,
  }: {
    vibe: VibePreset;
    startTime: number;
    stepIndex: number;
    intensity: number;
    styleIndex: GardenAudioStyleIndex;
    layer: BrushPhraseLayer | null;
  }): void {
    const profile = getVibeProfile(vibe);
    const pool = generativePianoTuning.stylePools[styleIndex];
    const maniaAmount =
      layer?.maniaAmount ??
      clamp01(
        (intensity - generativePianoTuning.brushStream.inferredManiaThreshold) /
          generativePianoTuning.brushStream.inferredManiaRange
      );
    const register = this.getBiasedRegister(
      pool,
      maniaAmount * generativePianoTuning.brushStream.registerManiaShift
    );
    const chord = this.getChord(profile, this.getBarIndexForStep(stepIndex));
    const chordIntervals = getChordIntervals(chord, false);
    const rootMidi = profile.rootMidi + chord.rootOffset;
    const useChordTone =
      this.brushStreamNoteIndex %
        generativePianoTuning.brushStream.chordToneEverySteps ===
      0;
    const source = useChordTone
      ? {
          baseMidi: rootMidi,
          offsets: this.getSupportOffsets(chordIntervals, styleIndex),
          chordOffsets: chordIntervals,
        }
      : {
          baseMidi: profile.rootMidi,
          offsets: this.getBrushMotifDegrees({
            layer,
            pool,
            styleIndex,
          }).map((degree) => degreeToSemitone(profile, degree)),
          chordOffsets: this.getChordOffsets(chord, chordIntervals),
        };
    const midi = this.chooseMidi(source, register, this.lastBrushStreamMidi, true);
    const pan = this.getStylePan(styleIndex, intensity);
    const durationSeconds = clamp(
      generativePianoTuning.brushStream.durationBaseSeconds +
        intensity * generativePianoTuning.brushStream.durationIntensitySeconds -
        maniaAmount * generativePianoTuning.brushStream.durationManiaSeconds,
      generativePianoTuning.brushStream.durationMinSeconds,
      generativePianoTuning.brushStream.durationMaxSeconds
    );
    const delaySend = clamp(
      generativePianoTuning.brushStream.delaySendBase +
        intensity * generativePianoTuning.brushStream.delaySendIntensityWeight -
        maniaAmount * generativePianoTuning.brushStream.delaySendManiaWeight,
      generativePianoTuning.brushStream.delaySendMin,
      generativePianoTuning.brushStream.delaySendMax
    );

    this.lastBrushStreamMidi = midi;
    this.lastMidiByStyle[styleIndex] = midi;
    this.playProfileNote(profile, {
      midi,
      velocity:
        (generativePianoTuning.brushStream.velocityBase +
          intensity * generativePianoTuning.brushStream.velocityIntensityWeight) *
        styleVoices[styleIndex].velocityMultiplier,
      startTime,
      durationSeconds,
      pan,
      role: 'brush',
      delaySend,
      lowpassHz: this.getLowpassHz(
        profile,
        midi,
        clamp01(
          generativePianoTuning.brushStream.lowpassBaseExpression +
            intensity * generativePianoTuning.brushStream.lowpassIntensityWeight +
            maniaAmount * generativePianoTuning.brushStream.lowpassManiaWeight
        )
      ),
    });

    if (
      maniaAmount >= generativePianoTuning.brushStreamEcho.maniaThreshold &&
      (this.brushStreamNoteIndex % generativePianoTuning.brushStreamEcho.stepModulo ===
        generativePianoTuning.brushStreamEcho.stepRemainder ||
        intensity >= generativePianoTuning.brushStreamEcho.intensityThreshold)
    ) {
      const echoMidi =
        midi + generativePianoTuning.brushStreamEcho.octaveSemitones <=
        generativePianoTuning.brushStreamEcho.maxMidi
          ? midi + generativePianoTuning.brushStreamEcho.octaveSemitones
          : midi - generativePianoTuning.brushStreamEcho.octaveSemitones;
      this.playProfileNote(profile, {
        midi: echoMidi,
        velocity:
          (generativePianoTuning.brushStreamEcho.velocityBase +
            intensity * generativePianoTuning.brushStreamEcho.velocityIntensityWeight) *
          styleVoices[styleIndex].velocityMultiplier,
        startTime: startTime + generativePianoTuning.brushMotifCanonDelaySeconds,
        durationSeconds: Math.max(
          generativePianoTuning.brushStreamEcho.durationMinSeconds,
          durationSeconds * generativePianoTuning.brushStreamEcho.durationScale
        ),
        pan: clamp(pan * generativePianoTuning.brushStreamEcho.panScale, -1, 1),
        role: 'brush',
        delaySend: Math.max(
          generativePianoTuning.brushStreamEcho.delaySendMin,
          delaySend * generativePianoTuning.brushStreamEcho.delaySendScale
        ),
        lowpassHz: this.getLowpassHz(
          profile,
          echoMidi,
          generativePianoTuning.brushStreamEcho.lowpassBaseExpression +
            maniaAmount * generativePianoTuning.brushStreamEcho.lowpassManiaWeight
        ),
      });
    }
  }

  private getBrushStreamFrame(
    startTime: number,
    activity: number
  ): {
    intensity: number;
    layer: BrushPhraseLayer | null;
  } {
    const layerStates = this.brushPhraseLayers.map((layer) => ({
      layer,
      intensity:
        layer.energy *
        this.getBrushPhraseFade(layer, startTime) *
        (generativePianoTuning.brushPhrase.layerIntensityBase +
          layer.maniaAmount *
            generativePianoTuning.brushPhrase.layerIntensityManiaWeight),
    }));
    const dominant = layerStates.reduce<{
      layer: BrushPhraseLayer;
      intensity: number;
    } | null>((best, state) => {
      if (state.intensity <= 0) {
        return best;
      }
      return best === null || state.intensity > best.intensity ? state : best;
    }, null);
    const layeredIntensity = layerStates.reduce(
      (sum, state) => sum + Math.max(0, state.intensity),
      0
    );

    return {
      intensity: clamp01(
        activity * generativePianoTuning.brushPhrase.frameActivityWeight +
          layeredIntensity +
          (dominant?.layer.maniaAmount ?? 0) *
            generativePianoTuning.brushPhrase.frameManiaWeight
      ),
      layer: dominant?.layer ?? null,
    };
  }

  private getBrushStreamIntervalSteps(intensity: number): number {
    const intervalBeats =
      intensity >= generativePianoTuning.brushStream.intenseThreshold
        ? generativePianoTuning.brushStreamIntenseIntervalBeats
        : intensity >= generativePianoTuning.brushStream.activeThreshold
          ? generativePianoTuning.brushStreamActiveIntervalBeats
          : generativePianoTuning.brushStreamIdleIntervalBeats;
    return Math.max(1, Math.round(intervalBeats * this.config.rhythm.stepsPerBeat));
  }

  private getBrushPhraseFade(layer: BrushPhraseLayer, startTime: number): number {
    const lifetimeSeconds = Math.max(0.001, layer.expiresAt - layer.startedAt);
    const ageSeconds = startTime - layer.startedAt;
    return clamp01(1 - ageSeconds / lifetimeSeconds);
  }

  private getMotifOffset(strength: number): number {
    return strength >= generativePianoTuning.brushMotif.highThreshold
      ? generativePianoTuning.brushMotif.highOffset
      : strength >= generativePianoTuning.brushMotif.mediumThreshold
        ? generativePianoTuning.brushMotif.mediumOffset
        : generativePianoTuning.brushMotif.lowOffset;
  }

  private getBrushMotifDegrees({
    layer,
    pool,
    styleIndex,
  }: {
    layer: BrushPhraseLayer | null;
    pool: GardenAudioStylePool;
    styleIndex: GardenAudioStyleIndex;
  }): Array<number> {
    const styleOffset = styleVoices[styleIndex].scaleDegreeOffset;
    if (!layer || layer.motifOffsets.length === 0) {
      return this.rotate(pool.scaleDegrees, this.brushStreamNoteIndex + styleOffset);
    }

    const motifOffset =
      layer.motifOffsets[this.brushStreamNoteIndex % layer.motifOffsets.length];
    const baseOffset = styleOffset + motifOffset;

    return this.rotate(
      pool.scaleDegrees.map((degree) => degree + baseOffset),
      this.brushStreamNoteIndex
    );
  }

  private getBiasedRegister(
    register: GardenAudioRegister,
    maniaAmount: number
  ): GardenAudioRegister {
    const shift = Math.round(
      maniaAmount * generativePianoTuning.registerBias.maniaShiftSemitones
    );
    const midiMin = clamp(
      register.midiMin + shift,
      generativePianoTuning.registerBias.midiMin,
      generativePianoTuning.registerBias.midiMaxForMin
    );
    const midiMax = clamp(
      register.midiMax + shift,
      midiMin + generativePianoTuning.registerBias.minimumSpan,
      generativePianoTuning.registerBias.midiMax
    );

    return {
      midiMin,
      midiMax,
      preferredMidi: clamp(register.preferredMidi + shift, midiMin, midiMax),
      pan: register.pan,
    };
  }

  private chooseMidi(
    pitchSource: PitchSource,
    register: GardenAudioRegister,
    previousMidi: number | null = null,
    avoidRepeat = false
  ): number {
    const candidates = this.getCandidates(pitchSource, register);
    const referenceMidi = previousMidi ?? register.preferredMidi;

    if (candidates.length === 0) {
      return register.preferredMidi;
    }

    return candidates.reduce((best, candidate) =>
      this.scoreCandidate(candidate, register, referenceMidi, avoidRepeat) <
      this.scoreCandidate(best, register, referenceMidi, avoidRepeat)
        ? candidate
        : best
    ).midi;
  }

  private getCandidates(
    pitchSource: PitchSource,
    register: GardenAudioRegister
  ): Array<PitchCandidate> {
    const candidates: Array<PitchCandidate> = [];
    const chordPitchClasses = pitchSource.chordOffsets?.map((offset) =>
      getPitchClass(pitchSource.baseMidi + offset)
    );

    pitchSource.offsets.forEach((offset, preference) => {
      for (
        let octave = generativePianoTuning.candidateOctaveSearch.min;
        octave <= generativePianoTuning.candidateOctaveSearch.max;
        octave += 1
      ) {
        const midi = pitchSource.baseMidi + offset + octave * PITCH_SEMITONES_PER_OCTAVE;
        if (midi >= register.midiMin && midi <= register.midiMax) {
          const roundedMidi = Math.round(midi);
          candidates.push({
            midi: roundedMidi,
            preference,
            chordToneDistance: getPitchClassDistance(roundedMidi, chordPitchClasses),
          });
        }
      }
    });

    return candidates;
  }

  private scoreCandidate(
    candidate: PitchCandidate,
    register: GardenAudioRegister,
    previousMidi: number,
    avoidRepeat: boolean
  ): number {
    return (
      Math.abs(candidate.midi - previousMidi) +
      Math.abs(candidate.midi - register.preferredMidi) *
        generativePianoTuning.noteScoreRegisterWeight +
      candidate.preference * generativePianoTuning.noteScorePreferenceWeight +
      candidate.chordToneDistance * generativePianoTuning.noteScoreChordToneWeight +
      (avoidRepeat && candidate.midi === previousMidi
        ? generativePianoTuning.noteScoreRepeatPenalty
        : 0)
    );
  }

  private shouldPlaySupport(expression: number, barIndex: number): boolean {
    if (expression < SUPPORT_ONSET_EXPRESSION) {
      return false;
    }
    if (expression >= generativePianoTuning.supportNote.expressionThreshold) {
      return true;
    }

    return (
      barIndex % generativePianoTuning.supportBarSpacing ===
      generativePianoTuning.supportBarOffset
    );
  }

  private shouldPlayTexture(expression: number, barIndex: number): boolean {
    if (expression < TEXTURE_ONSET_EXPRESSION) {
      return false;
    }
    if (expression >= generativePianoTuning.textureNote.mediumExpressionThreshold) {
      return barIndex % generativePianoTuning.textureNote.intenseSpacing === 0;
    }
    const spacing =
      expression < generativePianoTuning.textureNote.idleExpressionThreshold
        ? generativePianoTuning.idleTextureBarSpacing
        : generativePianoTuning.mediumTextureBarSpacing;
    return barIndex % spacing === generativePianoTuning.textureNote.idlePhase % spacing;
  }

  private getSupportOffsets(
    chordIntervals: ReadonlyArray<number>,
    styleIndex: GardenAudioStyleIndex
  ): Array<number> {
    return generativePianoTuning.supportNote.offsetsByStyle[styleIndex].map((offset) =>
      getConfiguredChordOffset(chordIntervals, offset)
    );
  }

  private getChord(profile: GardenAudioVibeProfile, barIndex: number): GardenAudioChord {
    const progressionIndex =
      Math.floor(barIndex / generativePianoTuning.chordBars) % profile.progression.length;
    return profile.progression[progressionIndex];
  }

  private getGlobalBarIndex(startTime: number): number {
    return this.getBarIndexForStep(this.getStepIndexAtTime(startTime));
  }

  private getStyleIndex(startTime: number): GardenAudioStyleIndex {
    const styleCount = generativePianoTuning.stylePools.length;
    const rotationBars = Math.max(1, Math.round(generativePianoTuning.styleRotationBars));
    return (Math.floor(this.getGlobalBarIndex(startTime) / rotationBars) %
      styleCount) as GardenAudioStyleIndex;
  }

  private getStylePan(styleIndex: GardenAudioStyleIndex, activity: number): number {
    const pool = generativePianoTuning.stylePools[styleIndex];
    const styleVoice = styleVoices[styleIndex];
    return this.getActivityPan(
      pool.pan + styleVoice.panOffset * generativePianoTuning.stylePanOffsetScale,
      activity
    );
  }

  private getActivityPan(pan: number, activity: number): number {
    const { active, idle, intense, intenseThreshold } = generativePianoTuning.stereoWidth;
    const normalizedActivity = clamp01(activity);
    const safeThreshold = clamp(intenseThreshold, 0.001, 0.999);
    const width =
      normalizedActivity < safeThreshold
        ? idle + ((active - idle) * normalizedActivity) / safeThreshold
        : active +
          ((intense - active) * (normalizedActivity - safeThreshold)) /
            (1 - safeThreshold);

    return clamp(pan * width, -1, 1);
  }

  private getLowpassHz(
    profile: GardenAudioVibeProfile,
    midi: number,
    expression: number
  ): number {
    const midiLift =
      clamp01(
        (midi - generativePianoTuning.lowpass.midiBase) /
          generativePianoTuning.lowpass.midiRange
      ) * generativePianoTuning.lowpass.midiLiftHz;
    return clamp(
      this.config.piano.lowpassHz *
        profile.brightness *
        (generativePianoTuning.lowpass.expressionBase +
          expression * generativePianoTuning.lowpass.expressionWeight) +
        midiLift,
      this.config.piano.lowpassMinHz,
      this.config.piano.lowpassMaxHz
    );
  }

  private skipLateBeats(now: number): void {
    if (this.nextBeatStep === null) {
      return;
    }

    const earliestStart = now + PIANO_SCHEDULE_AHEAD_SECONDS;
    if (this.getTimeForStep(this.nextBeatStep) >= earliestStart) {
      return;
    }

    const earliestStep = this.getNextStepIndexAt(earliestStart, 0);
    const stepsPerBeat = this.config.rhythm.stepsPerBeat;
    this.nextBeatStep = Math.ceil(earliestStep / stepsPerBeat) * stepsPerBeat;
  }

  private getExpression(activity: number): number {
    const activityExpression = clamp01(
      (activity - this.config.rhythm.sparseActivity) /
        (1 - this.config.rhythm.sparseActivity)
    );
    const idleExpression = clamp01(
      this.activeProfile?.idleIntensity ?? this.config.rhythm.idleIntensity
    );
    return Math.max(activityExpression, idleExpression);
  }

  private getBeatDurationSeconds(): number {
    return 60 / (this.activeProfile?.bpm ?? this.config.rhythm.bpm);
  }

  private getStepDurationSeconds(): number {
    return this.getBeatDurationSeconds() / this.config.rhythm.stepsPerBeat;
  }

  private getBarDurationSeconds(): number {
    return this.getBeatDurationSeconds() * this.getBeatsPerBar();
  }

  private getBeatsPerBar(): number {
    return Math.max(
      1,
      Math.round(this.config.rhythm.stepsPerBar / this.config.rhythm.stepsPerBeat)
    );
  }

  private getTimeForStep(stepIndex: number): number {
    return (
      (this.timelineStartedAt ?? 0) +
      GENERATIVE_START_DELAY_SECONDS +
      stepIndex * this.getStepDurationSeconds()
    );
  }

  private getStepIndexAtTime(startTime: number): number {
    const timelineStartedAt = this.timelineStartedAt ?? startTime;
    const elapsedSeconds = Math.max(
      0,
      startTime - timelineStartedAt - GENERATIVE_START_DELAY_SECONDS
    );
    return Math.floor(elapsedSeconds / this.getStepDurationSeconds());
  }

  private getNextStepIndexAt(startTime: number, lookaheadSteps: number): number {
    const timelineStartedAt = this.timelineStartedAt ?? startTime;
    const elapsedSeconds = Math.max(
      0,
      startTime - timelineStartedAt - GENERATIVE_START_DELAY_SECONDS
    );
    return Math.max(
      0,
      Math.ceil(elapsedSeconds / this.getStepDurationSeconds()) + lookaheadSteps
    );
  }

  private getReleaseResolutionStep(startTime: number): number {
    const currentStep = this.getStepIndexAtTime(startTime);
    const nextBeatStep =
      Math.ceil((currentStep + 1) / this.config.rhythm.stepsPerBeat) *
      this.config.rhythm.stepsPerBeat;
    const nextBarStep =
      Math.ceil((currentStep + 1) / this.config.rhythm.stepsPerBar) *
      this.config.rhythm.stepsPerBar;
    const barIsClose = nextBarStep - currentStep <= this.config.rhythm.stepsPerBeat * 2;

    return barIsClose ? nextBarStep : nextBeatStep;
  }

  private getNextBarTimeAt(startTime: number): number {
    const nextBarStep =
      Math.ceil(this.getStepIndexAtTime(startTime) / this.config.rhythm.stepsPerBar) *
      this.config.rhythm.stepsPerBar;
    return this.getTimeForStep(nextBarStep);
  }

  private getBeatIndexForStep(stepIndex: number): number {
    return Math.floor(stepIndex / this.config.rhythm.stepsPerBeat);
  }

  private getBarIndexForStep(stepIndex: number): number {
    return Math.floor(stepIndex / this.config.rhythm.stepsPerBar);
  }

  private reserveBrushStreamNote(stepIndex: number): boolean {
    const barIndex = this.getBarIndexForStep(stepIndex);
    const noteCount = this.brushStreamNoteCountsByBar.get(barIndex) ?? 0;
    if (noteCount >= generativePianoTuning.maxBrushStreamNotesPerBar) {
      return false;
    }

    this.brushStreamNoteCountsByBar.set(barIndex, noteCount + 1);
    return true;
  }

  private pruneBrushStreamNoteCounts(earliestBarIndex: number): void {
    this.brushStreamNoteCountsByBar.forEach((_, barIndex) => {
      if (barIndex < earliestBarIndex) {
        this.brushStreamNoteCountsByBar.delete(barIndex);
      }
    });
  }

  private getChordOffsets(
    chord: GardenAudioChord,
    chordIntervals: ReadonlyArray<number>
  ): Array<number> {
    return chordIntervals.map((interval) => chord.rootOffset + interval);
  }

  private rotate<T>(values: ReadonlyArray<T>, offset: number): Array<T> {
    return values.map((_, index) => values[(index + offset) % values.length]);
  }
}

const getPitchClass = (midi: number): number => ((midi % 12) + 12) % 12;

const getPitchClassDistance = (
  midi: number,
  chordPitchClasses: ReadonlyArray<number> | undefined
): number => {
  if (!chordPitchClasses || chordPitchClasses.length === 0) {
    return 0;
  }

  const pitchClass = getPitchClass(midi);
  return chordPitchClasses.reduce((best, chordPitchClass) => {
    const distance = Math.abs(pitchClass - chordPitchClass);
    return Math.min(best, Math.min(distance, 12 - distance));
  }, 6);
};

const getConfiguredChordOffset = (
  chordIntervals: ReadonlyArray<number>,
  configuredOffset: number
): number => {
  if (configuredOffset >= 12) {
    const interval = chordIntervals[configuredOffset - 12] ?? 0;
    return interval + 12;
  }

  return chordIntervals[configuredOffset] ?? configuredOffset;
};
