import { clamp } from '../utils/math';
import { SILENT_AUDIO_GAIN, type GardenAudioConfig } from './garden-audio-config';
import type { PianoNoteRole } from './garden-audio-types';

type AudioSessionType = NonNullable<NavigatorWithAudioSession['audioSession']>['type'];

type NavigatorWithAudioSession = Navigator & {
  audioSession?: {
    type:
      | 'auto'
      | 'playback'
      | 'ambient'
      | 'transient'
      | 'transient-solo'
      | 'play-and-record';
  };
};

const outputHighPassFrequencyHz = 45;
const noiseBufferDurationSeconds = 1;
const graphTuning = {
  closeGain: SILENT_AUDIO_GAIN,
  closeRampSeconds: 0.015,
  delayMaxSeconds: 2,
  eventBusGain: 1,
  noiseMax: 1,
  noiseMin: -1,
  latencyHint: 'interactive',
  outputFilterType: 'highpass',
  compressor: {
    thresholdDb: -22,
    kneeDb: 12,
    ratio: 4.5,
    attackSeconds: 0.006,
    releaseSeconds: 0.18,
  },
} as const;
const delayFilterTuning = {
  feedbackHighPassHz: 180,
  feedbackLowPassHz: 5200,
  returnLowPassHz: 6200,
};

export class GardenAudioGraph {
  public context: AudioContext | null = null;
  public eventBus: GainNode | null = null;
  public delayInput: GainNode | null = null;
  public noiseBus: GainNode | null = null;
  public noiseBuffer: AudioBuffer | null = null;

  private masterGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayOutput: GainNode | null = null;
  private lastPianoBusActivity = 0;
  private pianoBusGainScale = 1;
  private pianoBusGainScaleAutomationUntil = 0;
  private pianoBusGainScaleTimeConstantSeconds = 0;
  private previousAudioSessionType: AudioSessionType | null = null;
  private readonly pianoBuses = new Map<PianoNoteRole, GainNode>();

  public constructor(private readonly config: GardenAudioConfig) {}

  public ensureContext(canCreate: boolean): AudioContext | null {
    if (this.context) {
      return this.context;
    }

    if (!canCreate) {
      return null;
    }

    const AudioContextConstructor = globalThis.AudioContext;
    if (!AudioContextConstructor) {
      return null;
    }

    // Tells iOS to treat this as media playback, so the hardware ringer/mute
    // switch does not silence Web Audio output. No-op on browsers without the
    // Audio Session API.
    const audioSession = (navigator as NavigatorWithAudioSession).audioSession;
    if (audioSession) {
      this.previousAudioSessionType ??= audioSession.type;
      audioSession.type = 'playback';
    }

    const context = new AudioContextConstructor({
      latencyHint: graphTuning.latencyHint,
    });
    const outputBus = context.createGain();
    const masterGain = context.createGain();
    const highPass = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();

    outputBus.gain.value = 1;
    masterGain.gain.value = 0;
    highPass.type = graphTuning.outputFilterType;
    highPass.frequency.value = outputHighPassFrequencyHz;
    compressor.threshold.value = graphTuning.compressor.thresholdDb;
    compressor.knee.value = graphTuning.compressor.kneeDb;
    compressor.ratio.value = graphTuning.compressor.ratio;
    compressor.attack.value = graphTuning.compressor.attackSeconds;
    compressor.release.value = graphTuning.compressor.releaseSeconds;

    // Keep peak control independent from the user's volume slider.
    outputBus.connect(highPass);
    highPass.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(context.destination);

    this.context = context;
    this.masterGain = masterGain;
    this.noiseBuffer = this.createNoiseBuffer(context);
    this.createDelay(context, outputBus);
    this.createBuses(context, outputBus);

    return context;
  }

  public setMasterGain(targetGain: number, timeConstantSeconds: number): void {
    if (!this.context || !this.masterGain) {
      return;
    }

    this.masterGain.gain.setTargetAtTime(
      targetGain,
      this.context.currentTime,
      timeConstantSeconds
    );
  }

  public applyDelayProfile(bpm: number): void {
    if (!this.context || !this.delayNode) {
      return;
    }

    this.delayNode.delayTime.setTargetAtTime(
      this.getDelayTimeSecondsForBpm(bpm),
      this.context.currentTime,
      this.config.delay.timeRampSeconds
    );
  }

  public updateDelay(activity: number, bpm: number): void {
    if (!this.context || !this.delayNode || !this.delayFeedback || !this.delayOutput) {
      return;
    }

    const now = this.context.currentTime;
    const normalizedActivity = clamp(activity, 0, 1);
    this.delayNode.delayTime.setTargetAtTime(
      this.getDelayTimeSecondsForBpm(bpm),
      now,
      this.config.delay.timeRampSeconds
    );
    this.delayFeedback.gain.setTargetAtTime(
      clamp(
        this.config.delay.feedback +
          normalizedActivity * this.config.delay.activityFeedbackWeight,
        this.config.delay.feedbackMin,
        this.config.delay.feedbackMax
      ),
      now,
      this.config.updateRampSeconds
    );
    this.delayOutput.gain.setTargetAtTime(
      this.config.delay.wetGain *
        (this.config.delay.outputBase +
          normalizedActivity * this.config.delay.outputActivityWeight) *
        (1 - normalizedActivity * this.config.delay.outputActivityDuck),
      now,
      this.config.updateRampSeconds
    );
    this.updatePianoBusGains(normalizedActivity, now);
  }

  public getPianoBus(role: PianoNoteRole | undefined): GainNode | null {
    return this.pianoBuses.get(role ?? 'gesture') ?? this.eventBus;
  }

  public setPianoBusGainScale(targetScale: number, timeConstantSeconds: number): void {
    if (!this.context) {
      this.pianoBusGainScale = clamp(targetScale, 0, 1);
      return;
    }

    const now = this.context.currentTime;

    this.pianoBusGainScale = clamp(targetScale, 0, 1);
    this.pianoBusGainScaleTimeConstantSeconds = timeConstantSeconds;
    this.pianoBusGainScaleAutomationUntil = now + timeConstantSeconds * 4;
    this.updatePianoBusGains(this.lastPianoBusActivity, now, timeConstantSeconds);
  }

  public async close(): Promise<void> {
    const context = this.context;
    if (!context) {
      return;
    }

    if (this.masterGain && context.state !== 'closed') {
      this.masterGain.gain.setTargetAtTime(
        graphTuning.closeGain,
        context.currentTime,
        graphTuning.closeRampSeconds
      );
    }

    this.clearNodes();

    if (context.state !== 'closed') {
      await context.close().catch(() => undefined);
    }

    this.restoreAudioSessionType();
  }

  private restoreAudioSessionType(): void {
    const previousType = this.previousAudioSessionType;
    this.previousAudioSessionType = null;
    if (previousType === null) {
      return;
    }

    const audioSession = (navigator as NavigatorWithAudioSession).audioSession;
    if (audioSession) {
      audioSession.type = previousType;
    }
  }

  private createDelay(context: AudioContext, outputBus: GainNode): void {
    const delayInput = context.createGain();
    const delayNode = context.createDelay(graphTuning.delayMaxSeconds);
    const delayFeedback = context.createGain();
    const delayOutput = context.createGain();
    const feedbackHighPass = context.createBiquadFilter();
    const feedbackLowPass = context.createBiquadFilter();
    const returnLowPass = context.createBiquadFilter();

    delayNode.delayTime.value = this.getDelayTimeSecondsForBpm(this.config.rhythm.bpm);
    delayFeedback.gain.value = this.config.delay.feedback;
    delayOutput.gain.value = this.config.delay.wetGain;
    feedbackHighPass.type = 'highpass';
    feedbackHighPass.frequency.value = delayFilterTuning.feedbackHighPassHz;
    feedbackLowPass.type = 'lowpass';
    feedbackLowPass.frequency.value = delayFilterTuning.feedbackLowPassHz;
    returnLowPass.type = 'lowpass';
    returnLowPass.frequency.value = delayFilterTuning.returnLowPassHz;

    delayInput.connect(delayNode);
    delayNode.connect(feedbackHighPass);
    feedbackHighPass.connect(feedbackLowPass);
    feedbackLowPass.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(returnLowPass);
    returnLowPass.connect(delayOutput);
    delayOutput.connect(outputBus);

    this.delayInput = delayInput;
    this.delayNode = delayNode;
    this.delayFeedback = delayFeedback;
    this.delayOutput = delayOutput;
  }

  private createBuses(context: AudioContext, outputBus: GainNode): void {
    const eventBus = context.createGain();
    eventBus.gain.value = graphTuning.eventBusGain;
    eventBus.connect(outputBus);
    this.eventBus = eventBus;
    this.pianoBuses.clear();

    (Object.keys(this.config.graph.pianoBusGains) as Array<PianoNoteRole>).forEach(
      (role) => {
        const bus = context.createGain();
        bus.gain.value = this.config.graph.pianoBusGains[role];
        bus.connect(eventBus);
        this.pianoBuses.set(role, bus);
      }
    );

    this.noiseBus = context.createGain();
    this.noiseBus.gain.value = this.config.graph.noiseBusGain;
    this.noiseBus.connect(eventBus);
  }

  private updatePianoBusGains(
    activity: number,
    now: number,
    timeConstantSeconds?: number
  ): void {
    const effectiveTimeConstantSeconds =
      timeConstantSeconds ??
      (now < this.pianoBusGainScaleAutomationUntil
        ? this.pianoBusGainScaleTimeConstantSeconds
        : this.config.updateRampSeconds);

    this.lastPianoBusActivity = activity;
    this.pianoBuses.forEach((bus, role) => {
      const baseGain = this.config.graph.pianoBusGains[role];
      const ducking = this.config.graph.pianoBusActivityDucking[role];
      bus.gain.setTargetAtTime(
        Math.max(0, baseGain * (1 - activity * ducking) * this.pianoBusGainScale),
        now,
        effectiveTimeConstantSeconds
      );
    });
  }

  private getDelayTimeSecondsForBpm(bpm: number): number {
    const safeBpm = Number.isFinite(bpm) ? Math.max(1, bpm) : this.config.rhythm.bpm;
    return clamp(
      (60 / safeBpm) * this.config.delay.timeBeats,
      this.config.delay.timeMinSeconds,
      this.config.delay.timeMaxSeconds
    );
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(
      1,
      Math.floor(context.sampleRate * noiseBufferDurationSeconds),
      context.sampleRate
    );
    const data = buffer.getChannelData(0);

    for (let index = 0; index < data.length; index++) {
      data[index] =
        graphTuning.noiseMin +
        Math.random() * (graphTuning.noiseMax - graphTuning.noiseMin);
    }

    return buffer;
  }

  private clearNodes(): void {
    this.context = null;
    this.eventBus = null;
    this.delayInput = null;
    this.noiseBus = null;
    this.noiseBuffer = null;
    this.masterGain = null;
    this.delayNode = null;
    this.delayFeedback = null;
    this.delayOutput = null;
    this.lastPianoBusActivity = 0;
    this.pianoBusGainScale = 1;
    this.pianoBusGainScaleAutomationUntil = 0;
    this.pianoBusGainScaleTimeConstantSeconds = 0;
    this.pianoBuses.clear();
  }
}
