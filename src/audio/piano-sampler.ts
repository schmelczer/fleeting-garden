import { clamp, clamp01 } from '../utils/math';
import type { GardenAudioConfig } from './garden-audio-config';
import type { GardenAudioGraph } from './garden-audio-graph';
import { PITCH_SEMITONES_PER_OCTAVE } from './garden-audio-music';
import type {
  LoadedPianoReleaseSample,
  LoadedPianoSamples,
  LoadedPianoStrikeSample,
  PianoNote,
} from './garden-audio-types';
import { getLoadedPianoSamples, loadPianoSamples } from './piano-samples';

export const PIANO_SCHEDULE_AHEAD_SECONDS = 0.002;

interface ActivePianoVoice {
  gain: GainNode;
  peakGain: number;
  releaseAt: number;
  sources: Array<AudioBufferSourceNode>;
  startedAt: number;
  stopAt: number;
}

interface SelectedPianoStrikeSample {
  gainScale: number;
  sample: LoadedPianoStrikeSample;
}

interface ScheduledReleaseSample {
  gainValue: number;
  source: AudioBufferSourceNode;
  startTime: number;
  stopAt: number;
}

const pianoSamplerTuning = {
  filterType: 'lowpass',
  filterQ: 0.45,
  minDurationSeconds: 0.08,
  minFadeSeconds: 0.08,
  minGain: 0.0001,
  releaseSampleAttackSeconds: 0.006,
  releaseSampleDecaySeconds: 0.18,
  releaseTimeConstantCount: 6,
  tailStopExtraSeconds: 0.08,
  voiceStealFadeSeconds: 0.045,
  voiceStealStopSeconds: 0.09,
} as const;

export class PianoSampler {
  private activeVoices: Array<ActivePianoVoice> = [];
  private releaseSamples: Array<LoadedPianoReleaseSample> = [];
  private strikeSamples: Array<LoadedPianoStrikeSample> = [];
  private velocityLayers: Array<number> = [];

  public constructor(
    private readonly config: GardenAudioConfig,
    private readonly graph: GardenAudioGraph
  ) {}

  public load(context: BaseAudioContext): Promise<void> {
    if (this.strikeSamples.length > 0) {
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

    const noteVelocity = clamp01(velocity);
    const selectedSamples = this.selectStrikeSamples(midi, noteVelocity);
    if (selectedSamples.length === 0) {
      return;
    }

    const scheduledStart = Math.max(
      context.currentTime + PIANO_SCHEDULE_AHEAD_SECONDS,
      startTime
    );
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
    const strikeSources = selectedSamples.map(({ gainScale, sample }) => ({
      gainScale,
      source: this.createSource(
        context,
        sample.buffer,
        midi,
        sample.midi,
        scheduledStart
      ),
    }));
    const releaseSample = this.createReleaseSample({
      context,
      midi,
      noteVelocity,
      releaseAt,
    });

    this.scheduleVoice({
      delaySend,
      eventBus,
      lowpassHz,
      noteGainValue,
      pan,
      releaseAt,
      releaseSample,
      scheduledStart,
      stopAt: releaseSample ? Math.max(stopAt, releaseSample.stopAt) : stopAt,
      strikeSources,
      sustainAt,
      sustainSeconds,
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
    this.releaseSamples = [];
    this.strikeSamples = [];
    this.velocityLayers = [];
    this.activeVoices = [];
  }

  private scheduleVoice({
    strikeSources,
    releaseSample,
    scheduledStart,
    sustainAt,
    sustainSeconds,
    releaseAt,
    stopAt,
    pan,
    lowpassHz,
    delaySend,
    eventBus,
    noteGainValue,
  }: {
    delaySend: number;
    eventBus: GainNode;
    lowpassHz: number;
    noteGainValue: number;
    pan: number;
    releaseAt: number;
    releaseSample: ScheduledReleaseSample | null;
    scheduledStart: number;
    stopAt: number;
    strikeSources: Array<{ gainScale: number; source: AudioBufferSourceNode }>;
    sustainAt: number;
    sustainSeconds: number;
  }): void {
    const { context, delayInput, roomInput } = this.graph;
    if (!context) {
      return;
    }

    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const sourceGains = strikeSources.map(({ gainScale }) => {
      const sourceGain = context.createGain();
      sourceGain.gain.value = gainScale;
      return sourceGain;
    });
    let delaySendGain: GainNode | null = null;
    let roomSendGain: GainNode | null = null;
    let releaseGain: GainNode | null = null;

    this.trimActiveVoices(scheduledStart);
    while (this.activeVoices.length >= this.config.piano.maxVoices) {
      this.stealQuietestVoice(scheduledStart);
    }

    filter.type = pianoSamplerTuning.filterType;
    filter.frequency.setValueAtTime(
      clamp(lowpassHz, this.config.piano.lowpassMinHz, this.config.piano.lowpassMaxHz),
      scheduledStart
    );
    filter.Q.value = pianoSamplerTuning.filterQ;
    panner.pan.setValueAtTime(clamp(pan, -1, 1), scheduledStart);
    this.configureGainEnvelope({
      gain,
      noteGainValue,
      releaseAt,
      scheduledStart,
      sustainAt,
      sustainSeconds,
    });

    strikeSources.forEach(({ source }, index) => {
      source.connect(sourceGains[index]);
      sourceGains[index].connect(filter);
    });
    filter.connect(gain);
    gain.connect(panner);

    if (releaseSample) {
      releaseGain = context.createGain();
      releaseSample.source.connect(releaseGain);
      releaseGain.connect(panner);
      this.configureReleaseEnvelope(releaseGain, releaseSample);
    }

    panner.connect(eventBus);

    if (delayInput && delaySend > 0) {
      delaySendGain = context.createGain();
      delaySendGain.gain.value = delaySend;
      panner.connect(delaySendGain);
      delaySendGain.connect(delayInput);
    }

    if (roomInput && this.config.piano.roomSend > 0) {
      roomSendGain = context.createGain();
      roomSendGain.gain.value = this.config.piano.roomSend;
      panner.connect(roomSendGain);
      roomSendGain.connect(roomInput);
    }

    const sources = [
      ...strikeSources.map(({ source }) => source),
      ...(releaseSample ? [releaseSample.source] : []),
    ];

    strikeSources.forEach(({ source }) => {
      source.start(scheduledStart);
      source.stop(stopAt + pianoSamplerTuning.tailStopExtraSeconds);
    });
    if (releaseSample) {
      releaseSample.source.start(releaseSample.startTime);
      releaseSample.source.stop(releaseSample.stopAt);
    }

    const voice: ActivePianoVoice = {
      gain,
      peakGain: noteGainValue,
      releaseAt,
      sources,
      startedAt: scheduledStart,
      stopAt,
    };
    this.activeVoices.push(voice);

    this.cleanupVoiceWhenSourcesEnd({
      delaySendGain,
      filter,
      gain,
      panner,
      releaseGain,
      roomSendGain,
      sourceGains,
      sources,
      voice,
    });
  }

  private configureGainEnvelope({
    gain,
    noteGainValue,
    releaseAt,
    scheduledStart,
    sustainAt,
    sustainSeconds,
  }: {
    gain: GainNode;
    noteGainValue: number;
    releaseAt: number;
    scheduledStart: number;
    sustainAt: number;
    sustainSeconds: number;
  }): void {
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
  }

  private configureReleaseEnvelope(
    releaseGain: GainNode,
    releaseSample: ScheduledReleaseSample
  ): void {
    releaseGain.gain.setValueAtTime(pianoSamplerTuning.minGain, releaseSample.startTime);
    releaseGain.gain.exponentialRampToValueAtTime(
      releaseSample.gainValue,
      releaseSample.startTime + pianoSamplerTuning.releaseSampleAttackSeconds
    );
    releaseGain.gain.setTargetAtTime(
      pianoSamplerTuning.minGain,
      releaseSample.startTime + pianoSamplerTuning.releaseSampleAttackSeconds,
      pianoSamplerTuning.releaseSampleDecaySeconds
    );
  }

  private createSource(
    context: BaseAudioContext,
    buffer: AudioBuffer,
    midi: number,
    sampleMidi: number,
    scheduledStart: number
  ): AudioBufferSourceNode {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(
      Math.pow(2, (midi - sampleMidi) / PITCH_SEMITONES_PER_OCTAVE),
      scheduledStart
    );
    return source;
  }

  private createReleaseSample({
    context,
    midi,
    noteVelocity,
    releaseAt,
  }: {
    context: BaseAudioContext;
    midi: number;
    noteVelocity: number;
    releaseAt: number;
  }): ScheduledReleaseSample | null {
    const sample = this.findNearestReleaseSample(midi);
    if (!sample) {
      return null;
    }

    const source = this.createSource(
      context,
      sample.buffer,
      midi,
      sample.midi,
      releaseAt
    );
    const gainValue =
      this.config.piano.releaseSampleGain *
      (this.config.piano.releaseSampleVelocityBase +
        noteVelocity * this.config.piano.releaseSampleVelocityRange);

    return {
      gainValue: Math.max(pianoSamplerTuning.minGain, gainValue),
      source,
      startTime: releaseAt,
      stopAt:
        releaseAt + sample.buffer.duration + pianoSamplerTuning.tailStopExtraSeconds,
    };
  }

  private cleanupVoiceWhenSourcesEnd({
    sources,
    sourceGains,
    filter,
    gain,
    releaseGain,
    panner,
    delaySendGain,
    roomSendGain,
    voice,
  }: {
    delaySendGain: GainNode | null;
    filter: BiquadFilterNode;
    gain: GainNode;
    panner: StereoPannerNode;
    releaseGain: GainNode | null;
    roomSendGain: GainNode | null;
    sourceGains: Array<GainNode>;
    sources: Array<AudioBufferSourceNode>;
    voice: ActivePianoVoice;
  }): void {
    let remainingSources = sources.length;
    const cleanup = (): void => {
      remainingSources -= 1;
      if (remainingSources > 0) {
        return;
      }

      sources.forEach((source) => {
        source.disconnect();
      });
      sourceGains.forEach((sourceGain) => {
        sourceGain.disconnect();
      });
      filter.disconnect();
      gain.disconnect();
      releaseGain?.disconnect();
      panner.disconnect();
      delaySendGain?.disconnect();
      roomSendGain?.disconnect();
      this.activeVoices = this.activeVoices.filter(
        (activeVoice) => activeVoice !== voice
      );
    };

    sources.forEach((source) => {
      source.addEventListener('ended', cleanup, { once: true });
    });
  }

  private computeNoteGain(velocity: number): number {
    return Math.max(pianoSamplerTuning.minGain, this.config.piano.gain * velocity);
  }

  private selectStrikeSamples(
    midi: number,
    noteVelocity: number
  ): Array<SelectedPianoStrikeSample> {
    if (this.strikeSamples.length === 0 || this.velocityLayers.length === 0) {
      return [];
    }

    const targetLayer = this.getTargetVelocityLayer(noteVelocity);
    const layerPair = this.getVelocityLayerPair(targetLayer);
    if (!layerPair) {
      return [];
    }

    const lowerSample = this.findNearestStrikeSample(midi, layerPair.lower);
    const upperSample =
      layerPair.upper === layerPair.lower
        ? null
        : this.findNearestStrikeSample(midi, layerPair.upper);

    if (!lowerSample && !upperSample) {
      return [];
    }
    if (!upperSample || layerPair.blend <= 0) {
      return lowerSample ? [{ gainScale: 1, sample: lowerSample }] : [];
    }
    if (!lowerSample || layerPair.blend >= 1) {
      return [{ gainScale: 1, sample: upperSample }];
    }

    return [
      {
        gainScale: Math.sqrt(1 - layerPair.blend),
        sample: lowerSample,
      },
      {
        gainScale: Math.sqrt(layerPair.blend),
        sample: upperSample,
      },
    ];
  }

  private getTargetVelocityLayer(noteVelocity: number): number {
    const firstLayer = this.velocityLayers[0];
    const lastLayer = this.velocityLayers[this.velocityLayers.length - 1];
    const velocityRange = Math.max(
      0.001,
      this.config.piano.velocityLayerMax - this.config.piano.velocityLayerMin
    );
    const normalizedVelocity = clamp01(
      (noteVelocity - this.config.piano.velocityLayerMin) / velocityRange
    );
    const curvedVelocity = Math.pow(
      normalizedVelocity,
      this.config.piano.velocityLayerCurve
    );

    return firstLayer + (lastLayer - firstLayer) * curvedVelocity;
  }

  private getVelocityLayerPair(
    targetLayer: number
  ): { blend: number; lower: number; upper: number } | null {
    const firstLayer = this.velocityLayers[0];
    if (firstLayer === undefined) {
      return null;
    }
    if (targetLayer <= firstLayer) {
      return { blend: 0, lower: firstLayer, upper: firstLayer };
    }

    for (let index = 1; index < this.velocityLayers.length; index += 1) {
      const upper = this.velocityLayers[index];
      const lower = this.velocityLayers[index - 1];
      if (targetLayer <= upper) {
        return {
          blend: (targetLayer - lower) / (upper - lower),
          lower,
          upper,
        };
      }
    }

    const lastLayer = this.velocityLayers[this.velocityLayers.length - 1];
    return { blend: 0, lower: lastLayer, upper: lastLayer };
  }

  private findNearestStrikeSample(
    midi: number,
    velocityLayer: number
  ): LoadedPianoStrikeSample | null {
    const layerSamples = this.strikeSamples.filter(
      (sample) => sample.velocityLayer === velocityLayer
    );
    if (layerSamples.length === 0) {
      return null;
    }

    return layerSamples.reduce((nearest, sample) =>
      Math.abs(sample.midi - midi) < Math.abs(nearest.midi - midi) ? sample : nearest
    );
  }

  private findNearestReleaseSample(midi: number): LoadedPianoReleaseSample | null {
    if (this.releaseSamples.length === 0) {
      return null;
    }

    return this.releaseSamples.reduce((nearest, sample) =>
      Math.abs(sample.midi - midi) < Math.abs(nearest.midi - midi) ? sample : nearest
    );
  }

  private trimActiveVoices(now: number): void {
    this.activeVoices = this.activeVoices.filter((voice) => voice.stopAt > now);
  }

  private stealQuietestVoice(now: number): void {
    const quietestVoice = this.activeVoices.reduce<ActivePianoVoice | null>(
      (quietest, voice) =>
        quietest === null ||
        this.getVoiceActivityScore(voice, now) < this.getVoiceActivityScore(quietest, now)
          ? voice
          : quietest,
      null
    );
    if (!quietestVoice) {
      return;
    }

    this.stopVoice(quietestVoice, now);
    this.activeVoices = this.activeVoices.filter((voice) => voice !== quietestVoice);
  }

  private getVoiceActivityScore(voice: ActivePianoVoice, now: number): number {
    const ageSeconds = Math.max(0, now - voice.startedAt);
    const releasedScale = now >= voice.releaseAt ? 0.28 : 1;
    return (
      voice.peakGain *
      releasedScale *
      Math.exp(-ageSeconds / this.config.piano.voiceDecayEstimateSeconds)
    );
  }

  private stopVoice(voice: ActivePianoVoice, now: number): void {
    const stopAt = now + pianoSamplerTuning.voiceStealStopSeconds;

    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(
      pianoSamplerTuning.minGain,
      now,
      pianoSamplerTuning.voiceStealFadeSeconds
    );
    voice.sources.forEach((source) => {
      try {
        source.stop(stopAt);
      } catch {
        // The source may already have ended naturally.
      }
    });
    voice.stopAt = stopAt;
  }

  private setSamples(samples: LoadedPianoSamples): void {
    this.releaseSamples = samples.releases.slice().sort((a, b) => a.midi - b.midi);
    this.strikeSamples = samples.strikes
      .slice()
      .sort((a, b) => a.midi - b.midi || a.velocityLayer - b.velocityLayer);
    this.velocityLayers = [
      ...new Set(this.strikeSamples.map((sample) => sample.velocityLayer)),
    ].sort((a, b) => a - b);
  }
}
