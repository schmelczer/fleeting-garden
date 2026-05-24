import { clamp } from '../utils/math';
import type { GardenAudioGraph } from './garden-audio-graph';
import type { NoiseBurst } from './garden-audio-types';

const noiseBurstTuning = {
  attackSeconds: 0.004,
  filterQ: 1.4,
  offsetRandomSeconds: 0.4,
  scheduleAheadSeconds: 0.002,
  silentGain: 0.0001,
  filterType: 'bandpass',
} as const;

export class NoiseBurstPlayer {
  public constructor(private readonly graph: GardenAudioGraph) {}

  public play({ startTime, durationSeconds, gain, filterHz, pan }: NoiseBurst): void {
    const { context, noiseBus, noiseBuffer } = this.graph;
    if (!context || !noiseBus || !noiseBuffer) {
      return;
    }

    const scheduledStart = Math.max(
      context.currentTime + noiseBurstTuning.scheduleAheadSeconds,
      startTime
    );
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const panner = context.createStereoPanner();
    const stopAt = scheduledStart + durationSeconds;

    source.buffer = noiseBuffer;
    filter.type = noiseBurstTuning.filterType;
    filter.frequency.setValueAtTime(filterHz, scheduledStart);
    filter.Q.value = noiseBurstTuning.filterQ;
    envelope.gain.setValueAtTime(noiseBurstTuning.silentGain, scheduledStart);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(noiseBurstTuning.silentGain, gain),
      scheduledStart + noiseBurstTuning.attackSeconds
    );
    envelope.gain.exponentialRampToValueAtTime(noiseBurstTuning.silentGain, stopAt);
    panner.pan.setValueAtTime(clamp(pan, -1, 1), scheduledStart);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(noiseBus);
    const maxOffsetSeconds = Math.max(0, noiseBuffer.duration - durationSeconds);
    const offsetSeconds =
      Math.random() * Math.min(noiseBurstTuning.offsetRandomSeconds, maxOffsetSeconds);
    source.start(scheduledStart, offsetSeconds);
    source.stop(stopAt);
    source.addEventListener(
      'ended',
      () => {
        source.disconnect();
        filter.disconnect();
        envelope.disconnect();
        panner.disconnect();
      },
      { once: true }
    );
  }
}
