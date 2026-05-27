import { ErrorHandler, Severity } from '../utils/error-handler';
import { clamp } from '../utils/math';
import type { VibeId, VibePreset } from '../vibes';
import {
  MAX_AUDIO_VOLUME,
  SILENT_AUDIO_GAIN,
  type GardenAudioConfig,
  type GardenAudioVibeProfile,
} from './garden-audio-config';
import { GardenAudioEnergy } from './garden-audio-energy';
import { GardenAudioGestureState } from './garden-audio-gesture-state';
import { GardenAudioGraph } from './garden-audio-graph';
import { getStrokeMetrics } from './garden-audio-input';
import { getVibeProfile } from './garden-audio-music';
import type { GardenAudioSnapshot, GardenAudioStroke } from './garden-audio-types';
import { GenerativePianoEngine } from './generative-piano';
import { NoiseBurstPlayer } from './noise-burst-player';
import { PianoSampler } from './piano-sampler';

type AudioLifecycle = 'idle' | 'started' | 'destroyed';
type PianoReleasePhase =
  | { kind: 'idle' }
  | { kind: 'awaiting-fade' }
  | { kind: 'scheduled-fade'; fadeAt: number }
  | { kind: 'settling'; stopAt: number };

const muteRampSeconds = 0.02;
const brushUpPianoBusFadeSeconds = 2.4;
const brushUpPianoBusFadeSettleSeconds = 3.2;
const vibeChangeStingerMinIntervalSeconds = 0.45;

export class GardenAudio {
  private readonly graph: GardenAudioGraph;
  private readonly piano: PianoSampler;
  private readonly noise: NoiseBurstPlayer;
  private readonly energy: GardenAudioEnergy;
  private readonly gestureState: GardenAudioGestureState;
  private readonly pianoEngine: GenerativePianoEngine;

  private currentVibeId: VibeId | null = null;
  private currentVibe: VibePreset | null = null;
  private lifecycle: AudioLifecycle = 'idle';
  private pianoReleasePhase: PianoReleasePhase = { kind: 'idle' };
  private isMuted = false;
  private isGestureActive = false;
  private masterVolume: number;
  private lastEraserAt = Number.NEGATIVE_INFINITY;
  private lastVibeStingerAt = Number.NEGATIVE_INFINITY;
  private startRequestId = 0;
  private hasLoadedPiano = false;

  public constructor(private readonly config: GardenAudioConfig) {
    this.masterVolume = clamp(config.masterVolume, 0, MAX_AUDIO_VOLUME);
    this.graph = new GardenAudioGraph(config);
    this.piano = new PianoSampler(config, this.graph);
    this.noise = new NoiseBurstPlayer(this.graph);
    this.energy = new GardenAudioEnergy(config);
    this.gestureState = new GardenAudioGestureState(config.input);
    this.pianoEngine = new GenerativePianoEngine(config, (note) => this.piano.play(note));
  }

  public start(vibe: VibePreset, options: { userGesture?: boolean } = {}): void {
    const isUserGesture = options.userGesture === true;

    if (this.lifecycle === 'destroyed') {
      return;
    }

    if (
      this.lifecycle === 'started' &&
      this.currentVibeId === vibe.id &&
      this.graph.context?.state === 'running' &&
      this.hasLoadedPiano
    ) {
      return;
    }

    const context = this.graph.ensureContext(isUserGesture);
    if (!context) {
      return;
    }

    const startupRampSeconds = isUserGesture
      ? muteRampSeconds
      : this.config.fadeInSeconds;
    const needsResume = context.state !== 'running' && context.state !== 'closed';
    const startRequestId = ++this.startRequestId;

    if (needsResume) {
      if (!isUserGesture) {
        return;
      }
      void context
        .resume()
        .then(() => {
          if (this.graph.context === context && this.lifecycle !== 'destroyed') {
            this.completeStart(vibe, { context, startupRampSeconds, startRequestId });
          }
        })
        .catch((error) => {
          ErrorHandler.addException(error, {
            fallbackMessage: 'Could not resume audio playback.',
            severity: Severity.WARNING,
          });
        });
      return;
    }

    this.completeStart(vibe, { context, startupRampSeconds, startRequestId });
  }

  private completeStart(
    vibe: VibePreset,
    {
      context,
      startRequestId,
      startupRampSeconds,
    }: {
      context: AudioContext;
      startRequestId: number;
      startupRampSeconds: number;
    }
  ): void {
    if (this.graph.context !== context || this.lifecycle === 'destroyed') {
      return;
    }

    if (this.isMuted) {
      this.activateMutedStart(vibe, context);
      this.graph.setMasterGain(SILENT_AUDIO_GAIN, muteRampSeconds);
      return;
    }

    void this.piano
      .load(context)
      .then(() => {
        if (!this.canCompleteStart(context, startRequestId)) {
          return;
        }

        this.activateStart(vibe, context, startupRampSeconds, true);
      })
      .catch((error) => {
        if (this.canCompleteStart(context, startRequestId)) {
          this.activateStart(vibe, context, startupRampSeconds, false);
        }
        ErrorHandler.addException(error, {
          fallbackMessage: 'Could not load piano samples.',
          severity: Severity.WARNING,
        });
      });
  }

  private canCompleteStart(context: AudioContext, startRequestId: number): boolean {
    return (
      this.graph.context === context &&
      this.lifecycle !== 'destroyed' &&
      !this.isMuted &&
      this.startRequestId === startRequestId
    );
  }

  private activateStart(
    vibe: VibePreset,
    context: AudioContext,
    startupRampSeconds: number,
    cuePiano: boolean
  ): void {
    this.lifecycle = 'started';
    this.currentVibeId = vibe.id;
    this.currentVibe = vibe;
    const profile = getVibeProfile(vibe);
    this.graph.applyDelayProfile(profile.bpm);
    this.graph.setMasterGain(this.masterVolume, startupRampSeconds);

    if (cuePiano) {
      this.hasLoadedPiano = true;
      this.pianoEngine.cue(context.currentTime, profile);
    }
  }

  private activateMutedStart(vibe: VibePreset, context: AudioContext): void {
    this.lifecycle = 'started';
    this.currentVibeId = vibe.id;
    this.currentVibe = vibe;
    this.hasLoadedPiano = false;
    this.graph.applyDelayProfile(getVibeProfile(vibe).bpm);
    if (this.graph.context === context) {
      this.pianoEngine.reset();
    }
  }

  public changeVibe(vibe: VibePreset, options: { userGesture?: boolean } = {}): void {
    const previousVibeId = this.currentVibeId;
    this.start(vibe, options);
    const didChangeVibe = previousVibeId !== null && previousVibeId !== vibe.id;

    if (didChangeVibe) {
      this.piano.stopAll();
      this.hasLoadedPiano = false;
    }

    const context = this.graph.context;
    if (
      context &&
      (context.state === 'running' || options.userGesture === true) &&
      !this.isMuted &&
      this.lifecycle !== 'destroyed' &&
      didChangeVibe
    ) {
      this.playVibeChangeStinger(vibe);
    }
  }

  public setMuted(isMuted: boolean): void {
    if (this.isMuted === isMuted) {
      return;
    }

    this.isMuted = isMuted;
    this.graph.setMasterGain(
      isMuted ? SILENT_AUDIO_GAIN : this.masterVolume,
      isMuted ? muteRampSeconds : this.config.fadeInSeconds
    );

    if (!isMuted && this.currentVibe && !this.hasLoadedPiano) {
      this.start(this.currentVibe);
    }
  }

  public setMasterVolume(masterVolume: number): void {
    this.masterVolume = clamp(masterVolume, 0, MAX_AUDIO_VOLUME);
    if (!this.isMuted) {
      this.graph.setMasterGain(this.masterVolume, this.config.updateRampSeconds);
    }
  }

  public beginGesture(): void {
    const context = this.graph.context;
    if (!context) {
      return;
    }

    this.isGestureActive = true;
    this.pianoReleasePhase = { kind: 'idle' };
    this.graph.setPianoBusGainScale(1, this.config.fadeInSeconds);
    this.gestureState.reset();
    this.energy.beginGesture(context.currentTime);
    this.pianoEngine.beginGesture();
  }

  public endGesture(): void {
    this.gestureState.reset();
    this.isGestureActive = false;
    this.pianoReleasePhase = { kind: 'awaiting-fade' };
    this.energy.endGesture();
    this.pianoEngine.endGesture();
  }

  public update(snapshot: GardenAudioSnapshot): void {
    const context = this.graph.context;
    if (this.lifecycle !== 'started' || !context || this.isMuted) {
      return;
    }

    this.applyVibe(snapshot.vibe);
    const profile = getVibeProfile(snapshot.vibe);
    this.energy.update(context.currentTime, profile);

    if (snapshot.isErasing) {
      this.energy.silence();
    }

    if (!this.isGestureActive && this.pianoReleasePhase.kind !== 'idle') {
      this.updatePianoRelease(snapshot.vibe, context.currentTime);
      this.updateDelay(snapshot, profile);
      return;
    }

    this.pianoEngine.renderLookahead({
      vibe: snapshot.vibe,
      now: context.currentTime,
      activity: snapshot.isErasing
        ? this.config.eraser.pianoActivity
        : this.energy.getLevel(),
    });
    this.updateDelay(snapshot, profile);
  }

  public stroke(stroke: GardenAudioStroke): void {
    if (this.lifecycle !== 'started' || this.isMuted) {
      return;
    }

    const context = this.graph.context;
    if (!context) {
      return;
    }
    if (!this.isGestureActive) {
      return;
    }

    const metrics = getStrokeMetrics(stroke);
    const now = context.currentTime;

    const frame = this.gestureState.recordStroke({ metrics });
    const strokeEnergy = frame.activity;

    if (stroke.isErasing) {
      this.playEraser(strokeEnergy, now);
      return;
    }

    const profile = getVibeProfile(stroke.vibe);
    this.energy.recordStroke(strokeEnergy, profile);
    this.pianoEngine.recordStroke({
      vibe: stroke.vibe,
      now,
      activity: strokeEnergy,
      maniaAmount: frame.maniaAmount,
    });
  }

  public async destroy(): Promise<void> {
    this.lifecycle = 'destroyed';
    await this.graph.close();

    this.piano.reset();
    this.hasLoadedPiano = false;
    this.energy.reset();
    this.gestureState.reset();
    this.pianoEngine.reset();
    this.currentVibeId = null;
    this.currentVibe = null;
    this.isGestureActive = false;
    this.pianoReleasePhase = { kind: 'idle' };
    this.lastEraserAt = Number.NEGATIVE_INFINITY;
    this.lastVibeStingerAt = Number.NEGATIVE_INFINITY;
  }

  private playVibeChangeStinger(vibe: VibePreset): void {
    const context = this.graph.context;
    if (!context) {
      return;
    }

    const now = context.currentTime;
    if (now - this.lastVibeStingerAt < vibeChangeStingerMinIntervalSeconds) {
      return;
    }

    this.lastVibeStingerAt = now;
    this.pianoEngine.playVibeChangeStinger(vibe, now);
  }

  private updatePianoRelease(vibe: VibePreset, now: number): void {
    if (this.pianoReleasePhase.kind === 'awaiting-fade') {
      const fadeAt = this.pianoEngine.release(vibe, now);
      if (now < fadeAt) {
        this.pianoReleasePhase = { kind: 'scheduled-fade', fadeAt };
        return;
      }

      this.graph.setPianoBusGainScale(0, brushUpPianoBusFadeSeconds);
      this.pianoReleasePhase = {
        kind: 'settling',
        stopAt: now + brushUpPianoBusFadeSettleSeconds,
      };
      return;
    }

    if (
      this.pianoReleasePhase.kind === 'scheduled-fade' &&
      now >= this.pianoReleasePhase.fadeAt
    ) {
      this.graph.setPianoBusGainScale(0, brushUpPianoBusFadeSeconds);
      this.pianoReleasePhase = {
        kind: 'settling',
        stopAt: now + brushUpPianoBusFadeSettleSeconds,
      };
      return;
    }

    if (
      this.pianoReleasePhase.kind === 'settling' &&
      now >= this.pianoReleasePhase.stopAt
    ) {
      this.piano.stopAll();
      this.pianoEngine.reset();
      this.hasLoadedPiano = false;
      this.pianoReleasePhase = { kind: 'idle' };
    }
  }

  private playEraser(activity: number, now: number): void {
    if (!this.graph.context) {
      return;
    }

    const distanceActivity = clamp(activity, 0, 1);
    if (distanceActivity <= 0) {
      return;
    }

    const filterHz =
      this.config.eraser.filterMinHz +
      (this.config.eraser.filterMaxHz - this.config.eraser.filterMinHz) *
        distanceActivity;

    if (now - this.lastEraserAt >= this.config.eraser.minIntervalSeconds) {
      this.lastEraserAt = now;
      this.noise.play({
        startTime: now,
        durationSeconds: this.config.eraser.durationSeconds,
        gain: this.config.eraser.noiseGain * distanceActivity,
        filterHz,
        pan: this.config.eraser.pan,
      });
    }
  }

  private updateDelay(
    snapshot: GardenAudioSnapshot,
    profile: GardenAudioVibeProfile
  ): void {
    const context = this.graph.context;
    if (!context) {
      return;
    }

    const activity = snapshot.isErasing
      ? this.config.delay.erasingActivity
      : this.energy.getLevel();
    this.graph.updateDelay(activity, profile.bpm);
  }

  private applyVibe(vibe: VibePreset): void {
    if (!this.graph.context || this.currentVibeId === vibe.id) {
      return;
    }

    this.currentVibeId = vibe.id;
    this.currentVibe = vibe;
    const profile = getVibeProfile(vibe);
    this.graph.applyDelayProfile(profile.bpm);
    this.pianoEngine.cue(this.graph.context.currentTime, profile);
    this.hasLoadedPiano = true;
  }
}
