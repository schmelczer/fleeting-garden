import type { LoadedPianoSample } from './garden-audio-types';
import a0SampleUrl from './samples/A0v12.m4a?url&no-inline';
import a1SampleUrl from './samples/A1v12.m4a?url&no-inline';
import a2SampleUrl from './samples/A2v12.m4a?url&no-inline';
import a3SampleUrl from './samples/A3v12.m4a?url&no-inline';
import a4SampleUrl from './samples/A4v12.m4a?url&no-inline';
import a5SampleUrl from './samples/A5v12.m4a?url&no-inline';
import a6SampleUrl from './samples/A6v12.m4a?url&no-inline';
import a7SampleUrl from './samples/A7v12.m4a?url&no-inline';
import c1SampleUrl from './samples/C1v12.m4a?url&no-inline';
import c2SampleUrl from './samples/C2v12.m4a?url&no-inline';
import c3SampleUrl from './samples/C3v12.m4a?url&no-inline';
import c4SampleUrl from './samples/C4v12.m4a?url&no-inline';
import c5SampleUrl from './samples/C5v12.m4a?url&no-inline';
import c6SampleUrl from './samples/C6v12.m4a?url&no-inline';
import c7SampleUrl from './samples/C7v12.m4a?url&no-inline';
import c8SampleUrl from './samples/C8v12.m4a?url&no-inline';
import dSharp1SampleUrl from './samples/Dsharp1v12.m4a?url&no-inline';
import dSharp2SampleUrl from './samples/Dsharp2v12.m4a?url&no-inline';
import dSharp3SampleUrl from './samples/Dsharp3v12.m4a?url&no-inline';
import dSharp4SampleUrl from './samples/Dsharp4v12.m4a?url&no-inline';
import dSharp5SampleUrl from './samples/Dsharp5v12.m4a?url&no-inline';
import dSharp6SampleUrl from './samples/Dsharp6v12.m4a?url&no-inline';
import dSharp7SampleUrl from './samples/Dsharp7v12.m4a?url&no-inline';
import fSharp1SampleUrl from './samples/Fsharp1v12.m4a?url&no-inline';
import fSharp2SampleUrl from './samples/Fsharp2v12.m4a?url&no-inline';
import fSharp3SampleUrl from './samples/Fsharp3v12.m4a?url&no-inline';
import fSharp4SampleUrl from './samples/Fsharp4v12.m4a?url&no-inline';
import fSharp5SampleUrl from './samples/Fsharp5v12.m4a?url&no-inline';
import fSharp6SampleUrl from './samples/Fsharp6v12.m4a?url&no-inline';
import fSharp7SampleUrl from './samples/Fsharp7v12.m4a?url&no-inline';

interface PianoSampleDefinition {
  note: string;
  url: string;
}

export interface PianoSampleLoadProgress {
  failedCount: number;
  loadedCount: number;
  settledCount: number;
  totalCount: number;
}

const pianoSampleDefinitions: Array<PianoSampleDefinition> = [
  { url: a0SampleUrl, note: 'A0' },
  { url: c1SampleUrl, note: 'C1' },
  { url: dSharp1SampleUrl, note: 'Dsharp1' },
  { url: fSharp1SampleUrl, note: 'Fsharp1' },
  { url: a1SampleUrl, note: 'A1' },
  { url: c2SampleUrl, note: 'C2' },
  { url: dSharp2SampleUrl, note: 'Dsharp2' },
  { url: fSharp2SampleUrl, note: 'Fsharp2' },
  { url: a2SampleUrl, note: 'A2' },
  { url: c3SampleUrl, note: 'C3' },
  { url: dSharp3SampleUrl, note: 'Dsharp3' },
  { url: fSharp3SampleUrl, note: 'Fsharp3' },
  { url: a3SampleUrl, note: 'A3' },
  { url: c4SampleUrl, note: 'C4' },
  { url: dSharp4SampleUrl, note: 'Dsharp4' },
  { url: fSharp4SampleUrl, note: 'Fsharp4' },
  { url: a4SampleUrl, note: 'A4' },
  { url: c5SampleUrl, note: 'C5' },
  { url: dSharp5SampleUrl, note: 'Dsharp5' },
  { url: fSharp5SampleUrl, note: 'Fsharp5' },
  { url: a5SampleUrl, note: 'A5' },
  { url: c6SampleUrl, note: 'C6' },
  { url: dSharp6SampleUrl, note: 'Dsharp6' },
  { url: fSharp6SampleUrl, note: 'Fsharp6' },
  { url: a6SampleUrl, note: 'A6' },
  { url: c7SampleUrl, note: 'C7' },
  { url: dSharp7SampleUrl, note: 'Dsharp7' },
  { url: fSharp7SampleUrl, note: 'Fsharp7' },
  { url: a7SampleUrl, note: 'A7' },
  { url: c8SampleUrl, note: 'C8' },
];

let loadedPianoSamples: Array<LoadedPianoSample> | null = null;
let pianoSampleLoadPromise: Promise<Array<LoadedPianoSample>> | null = null;
let lastPianoSampleProgress: PianoSampleLoadProgress | null = null;
const pianoSampleProgressListeners = new Set<
  (progress: PianoSampleLoadProgress) => void
>();

const sampleLoadTuning = {
  concurrency: 4,
  sampleTimeoutMs: 15_000,
};

export const preloadPianoSamples = (
  onProgress?: (progress: PianoSampleLoadProgress) => void
): Promise<Array<LoadedPianoSample>> => {
  const OfflineAudioContextConstructor = globalThis.OfflineAudioContext;

  if (!OfflineAudioContextConstructor) {
    return Promise.reject(
      new Error('OfflineAudioContext is required to preload piano samples.')
    );
  }

  // Decoding ignores these, but the constructor demands real numbers.
  const decodeContext = new OfflineAudioContextConstructor(1, 1, 48_000);
  return loadPianoSamples(decodeContext, onProgress);
};

export const loadPianoSamples = (
  decodeContext: BaseAudioContext,
  onProgress?: (progress: PianoSampleLoadProgress) => void
): Promise<Array<LoadedPianoSample>> => {
  const unsubscribeProgress = subscribeToPianoSampleProgress(onProgress);

  if (loadedPianoSamples) {
    emitPianoSampleProgress({
      failedCount: 0,
      loadedCount: loadedPianoSamples.length,
      settledCount: loadedPianoSamples.length,
      totalCount: pianoSampleDefinitions.length,
    });
    unsubscribeProgress();
    return Promise.resolve([...loadedPianoSamples]);
  }

  if (pianoSampleLoadPromise) {
    return pianoSampleLoadPromise.finally(unsubscribeProgress);
  }

  let loadedCount = 0;
  let failedCount = 0;
  let settledCount = 0;
  const totalCount = pianoSampleDefinitions.length;
  emitPianoSampleProgress({ failedCount, loadedCount, settledCount, totalCount });

  pianoSampleLoadPromise = loadPianoSampleBatch(
    pianoSampleDefinitions,
    async (sample) => {
      try {
        const loadedSample = await withTimeout(
          (signal) => loadPianoSample(decodeContext, sample, signal),
          sampleLoadTuning.sampleTimeoutMs
        );
        loadedCount += 1;
        return loadedSample;
      } catch (error) {
        failedCount += 1;
        throw error;
      } finally {
        settledCount += 1;
        emitPianoSampleProgress({ failedCount, loadedCount, settledCount, totalCount });
      }
    }
  )
    .then(
      (samples) => {
        loadedPianoSamples = samples.sort((a, b) => a.midi - b.midi);
        if (loadedPianoSamples.length !== pianoSampleDefinitions.length) {
          throw new Error(
            `Loaded ${loadedPianoSamples.length}/${pianoSampleDefinitions.length} piano samples.`
          );
        }
        return [...loadedPianoSamples];
      },
      (error: unknown) => {
        pianoSampleLoadPromise = null;
        pianoSampleProgressListeners.clear();
        throw error;
      }
    )
    .finally(unsubscribeProgress);

  return pianoSampleLoadPromise;
};

export const getLoadedPianoSamples = (): Array<LoadedPianoSample> | null =>
  loadedPianoSamples ? [...loadedPianoSamples] : null;

const loadPianoSample = async (
  decodeContext: BaseAudioContext,
  sample: PianoSampleDefinition,
  signal: AbortSignal
): Promise<LoadedPianoSample> => {
  const response = await fetch(sample.url, { signal });
  if (!response.ok) {
    throw new Error(`Unable to load piano sample ${getPianoSamplePath(sample)}`);
  }

  const audioData = await response.arrayBuffer();
  const buffer = await decodeContext.decodeAudioData(audioData);
  return { midi: getMidiForPianoSample(sample), buffer };
};

const loadPianoSampleBatch = async (
  samples: Array<PianoSampleDefinition>,
  loadSample: (sample: PianoSampleDefinition) => Promise<LoadedPianoSample>
): Promise<Array<LoadedPianoSample>> => {
  const results: Array<LoadedPianoSample> = [];

  for (let index = 0; index < samples.length; index += sampleLoadTuning.concurrency) {
    const batch = samples.slice(index, index + sampleLoadTuning.concurrency);
    const batchResults = await Promise.all(batch.map((sample) => loadSample(sample)));
    results.push(...batchResults);
  }

  return results;
};

const withTimeout = <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> =>
  new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => {
      controller.abort();
      reject(new Error('Timed out while loading a piano sample.'));
    }, timeoutMs);

    operation(controller.signal).then(
      (value) => {
        globalThis.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timeout);
        reject(error);
      }
    );
  });

const subscribeToPianoSampleProgress = (
  onProgress: ((progress: PianoSampleLoadProgress) => void) | undefined
): (() => void) => {
  if (!onProgress) {
    return () => undefined;
  }

  pianoSampleProgressListeners.add(onProgress);
  if (lastPianoSampleProgress) {
    onProgress(lastPianoSampleProgress);
  }
  return () => {
    pianoSampleProgressListeners.delete(onProgress);
  };
};

const emitPianoSampleProgress = (progress: PianoSampleLoadProgress): void => {
  lastPianoSampleProgress = progress;
  pianoSampleProgressListeners.forEach((listener) => listener(progress));
};

const getPianoSamplePath = (sample: PianoSampleDefinition): string =>
  `./samples/${sample.note}v12.m4a`;

const getMidiForPianoSample = (sample: PianoSampleDefinition): number => {
  const match = /^(?<name>[A-G])(?<accidental>sharp)?(?<octave>\d+)$/.exec(sample.note);
  if (!match?.groups) {
    throw new Error(`Invalid piano sample note ${sample.note}`);
  }

  const semitoneByName: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const octave = Number(match.groups.octave);
  const semitone = semitoneByName[match.groups.name] + (match.groups.accidental ? 1 : 0);
  return (octave + 1) * 12 + semitone;
};
