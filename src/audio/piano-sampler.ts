import { clamp, clamp01 } from '../utils/math';
import type { GardenAudioConfig } from './garden-audio-config';
import type { GardenAudioGraph } from './garden-audio-graph';
import { PITCH_SEMITONES_PER_OCTAVE } from './garden-audio-music';
import type { LoadedPianoSample, PianoNote } from './garden-audio-types';
import { getLoadedPianoSamples, loadPianoSamples } from './piano-samples';

export const PIANO_SCHEDULE_AHEAD_SECONDS = 0.002;

interface ActivePianoVoice {
  gain: GainNode;
  source: AudioScheduledSourceNode;
  stopAt: number;
}

const pianoSamplerTuning = {
  filterType: 'lowpass',
  filterQ: 0.7,
  minDurationSeconds: 0.08,
  minFadeSeconds: 0.08,
  minGain: 0.0001,
  releaseTimeConstantCount: 5,
  tailStopExtraSeconds: 0.05,
  voiceStealFadeSeconds: 0.025,
  voiceStealStopSeconds: 0.05,
} as const;

export class PianoSampler {
  private samples: Array<LoadedPianoSample> = [];
  private activeVoices: Array<ActivePianoVoice> = [];

  public constructor(
    private readonly config: GardenAudioConfig,
    private readonly graph: GardenAudioGraph
  ) {}

  public load(context: BaseAudioContext): Promise<void> {
    if (this.samples.length > 0) {
      return Promise.resolve();
    }

    const loadedSamples = getLoadedPianoSamples();
    if (loadedSamples) {
      this.setSamples(loadedSamples);
      return Promise.resolve();
    }

    return loadPianoSamples(context).then((samples) => {
      this.setSamples(samples);
    });
  }

  public play({
    midi,
    velocity,
    startTime,
    durationSeconds,
    pan,
    role,
    delaySend = 0,
    lowpassHz = this.config.piano.lowpassHz,
    sustainSeconds: profileSustainSeconds = this.config.piano.sustainSeconds,
  }: PianoNote): void {
    const { context } = this.graph;
    const eventBus = this.graph.getPianoBus(role);
    if (!context || !eventBus) {
      return;
    }

    const sample = this.findNearestSample(midi);
    if (!sample) {
      return;
    }

    const scheduledStart = Math.max(
      context.currentTime + PIANO_SCHEDULE_AHEAD_SECONDS,
      startTime
    );
    const noteVelocity = clamp01(velocity);
    const noteGainValue = this.computeNoteGain(noteVelocity);
    const sustainSeconds =
      profileSustainSeconds *
      (this.config.piano.sustainBase +
        noteVelocity * this.config.piano.sustainVelocityRange);
    const sustainAt =
      scheduledStart + Math.max(pianoSamplerTuning.minDurationSeconds, durationSeconds);
    const releaseAt = sustainAt + sustainSeconds;
    const stopAt =
      releaseAt +
      this.config.piano.releaseSeconds * pianoSamplerTuning.releaseTimeConstantCount;
    const source = context.createBufferSource();

    source.buffer = sample.buffer;
    source.playbackRate.setValueAtTime(
      Math.pow(2, (midi - sample.midi) / PITCH_SEMITONES_PER_OCTAVE),
      scheduledStart
    );

    this.scheduleVoice({
      source,
      scheduledStart,
      stopAt,
      pan,
      lowpassHz,
      delaySend,
      eventBus,
      configureGainEnvelope: (gain) => {
        gain.gain.setValueAtTime(pianoSamplerTuning.minGain, scheduledStart);
        gain.gain.exponentialRampToValueAtTime(
          noteGainValue,
          scheduledStart + this.config.piano.gainAttackSeconds
        );
        gain.gain.setTargetAtTime(
          Math.max(
            pianoSamplerTuning.minGain,
            noteGainValue * this.config.piano.sustainLevel
          ),
          sustainAt,
          Math.max(
            pianoSamplerTuning.minFadeSeconds,
            sustainSeconds * this.config.piano.sustainBase
          )
        );
        gain.gain.setTargetAtTime(
          pianoSamplerTuning.minGain,
          releaseAt,
          this.config.piano.releaseSeconds
        );
      },
    });
  }

  public stopAll(): void {
    const context = this.graph.context;
    if (!context) {
      this.activeVoices = [];
      return;
    }

    const now = context.currentTime;

    this.activeVoices.forEach((voice) => {
      this.stopVoice(voice, now);
    });
    this.activeVoices = [];
  }

  public reset(): void {
    this.samples = [];
    this.activeVoices = [];
  }

  private scheduleVoice({
    source,
    scheduledStart,
    stopAt,
    pan,
    lowpassHz,
    delaySend,
    eventBus,
    configureGainEnvelope,
  }: {
    source: AudioScheduledSourceNode;
    scheduledStart: number;
    stopAt: number;
    pan: number;
    lowpassHz: number;
    delaySend: number;
    eventBus: GainNode;
    configureGainEnvelope: (gain: GainNode) => void;
  }): void {
    const { context, delayInput } = this.graph;
    if (!context) {
      return;
    }

    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    let sendGain: GainNode | null = null;

    this.trimActiveVoices(scheduledStart);
    while (this.activeVoices.length >= this.config.piano.maxVoices) {
      const oldest = this.activeVoices.shift();
      if (!oldest) {
        break;
      }
      this.stopVoice(oldest, scheduledStart);
    }

    filter.type = pianoSamplerTuning.filterType;
    filter.frequency.setValueAtTime(
      clamp(lowpassHz, this.config.piano.lowpassMinHz, this.config.piano.lowpassMaxHz),
      scheduledStart
    );
    filter.Q.value = pianoSamplerTuning.filterQ;
    panner.pan.setValueAtTime(clamp(pan, -1, 1), scheduledStart);
    configureGainEnvelope(gain);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(eventBus);

    if (delayInput && delaySend > 0) {
      sendGain = context.createGain();
      sendGain.gain.value = delaySend;
      panner.connect(sendGain);
      sendGain.connect(delayInput);
    }

    source.start(scheduledStart);
    source.stop(stopAt + pianoSamplerTuning.tailStopExtraSeconds);
    this.activeVoices.push({ gain, source, stopAt });

    source.addEventListener(
      'ended',
      () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
        panner.disconnect();
        sendGain?.disconnect();
        this.activeVoices = this.activeVoices.filter((voice) => voice.gain !== gain);
      },
      { once: true }
    );
  }

  private computeNoteGain(velocity: number): number {
    return Math.max(pianoSamplerTuning.minGain, this.config.piano.gain * velocity);
  }

  private findNearestSample(midi: number): LoadedPianoSample | null {
    if (this.samples.length === 0) {
      return null;
    }

    return this.samples.reduce((nearest, sample) =>
      Math.abs(sample.midi - midi) < Math.abs(nearest.midi - midi) ? sample : nearest
    );
  }

  private trimActiveVoices(now: number): void {
    this.activeVoices = this.activeVoices.filter((voice) => voice.stopAt > now);
  }

  private stopVoice(voice: ActivePianoVoice, now: number): void {
    const stopAt = now + pianoSamplerTuning.voiceStealStopSeconds;

    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(
      pianoSamplerTuning.minGain,
      now,
      pianoSamplerTuning.voiceStealFadeSeconds
    );
    voice.stopAt = stopAt;
    voice.source.stop(stopAt);
  }

  private setSamples(samples: Array<LoadedPianoSample>): void {
    this.samples = samples.slice().sort((a, b) => a.midi - b.midi);
  }
}
