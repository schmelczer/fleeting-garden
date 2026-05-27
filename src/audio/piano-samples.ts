import type {
  LoadedPianoReleaseSample,
  LoadedPianoSamples,
  LoadedPianoStrikeSample,
} from './garden-audio-types';

interface PianoStrikeSampleDefinition {
  kind: 'strike';
  midi: number;
  path: string;
  url: string;
  velocityLayer: number;
}

interface PianoReleaseSampleDefinition {
  kind: 'release';
  midi: number;
  path: string;
  url: string;
}

type PianoSampleDefinition = PianoStrikeSampleDefinition | PianoReleaseSampleDefinition;

export interface PianoSampleLoadProgress {
  failedCount: number;
  loadedCount: number;
  settledCount: number;
  totalCount: number;
}

const pianoSampleModules = import.meta.glob('./samples/*.m4a', {
  eager: true,
  import: 'default',
  query: '?url&no-inline',
}) as Record<string, string>;
const pianoSampleDefinitions = getPianoSampleDefinitions(pianoSampleModules);

let loadedPianoSamples: LoadedPianoSamples | null = null;
let pianoSampleLoadPromise: Promise<LoadedPianoSamples> | null = null;
let lastPianoSampleProgress: PianoSampleLoadProgress | null = null;
const pianoSampleProgressListeners = new Set<
  (progress: PianoSampleLoadProgress) => void
>();

const sampleLoadTuning = {
  concurrency: 6,
  sampleTimeoutMs: 15_000,
};

export const preloadPianoSamples = (
  onProgress?: (progress: PianoSampleLoadProgress) => void
): Promise<LoadedPianoSamples> => {
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
): Promise<LoadedPianoSamples> => {
  const unsubscribeProgress = subscribeToPianoSampleProgress(onProgress);

  if (loadedPianoSamples) {
    emitPianoSampleProgress({
      failedCount: 0,
      loadedCount: loadedPianoSamples.strikes.length + loadedPianoSamples.releases.length,
      settledCount:
        loadedPianoSamples.strikes.length + loadedPianoSamples.releases.length,
      totalCount: pianoSampleDefinitions.length,
    });
    unsubscribeProgress();
    return Promise.resolve(cloneLoadedPianoSamples(loadedPianoSamples));
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
        loadedPianoSamples = sortLoadedPianoSamples(samples);
        const loadedCount =
          loadedPianoSamples.strikes.length + loadedPianoSamples.releases.length;
        if (loadedCount !== pianoSampleDefinitions.length) {
          throw new Error(
            `Loaded ${loadedCount}/${pianoSampleDefinitions.length} piano samples.`
          );
        }
        return cloneLoadedPianoSamples(loadedPianoSamples);
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

export const getLoadedPianoSamples = (): LoadedPianoSamples | null =>
  loadedPianoSamples ? cloneLoadedPianoSamples(loadedPianoSamples) : null;

const loadPianoSample = async (
  decodeContext: BaseAudioContext,
  sample: PianoSampleDefinition,
  signal: AbortSignal
): Promise<LoadedPianoStrikeSample | LoadedPianoReleaseSample> => {
  const response = await fetch(sample.url, { signal });
  if (!response.ok) {
    throw new Error(`Unable to load piano sample ${sample.path}`);
  }

  const audioData = await response.arrayBuffer();
  const buffer = await decodeContext.decodeAudioData(audioData);
  if (sample.kind === 'strike') {
    return {
      buffer,
      midi: sample.midi,
      velocityLayer: sample.velocityLayer,
    };
  }
  return { buffer, midi: sample.midi };
};

const loadPianoSampleBatch = async (
  samples: Array<PianoSampleDefinition>,
  loadSample: (
    sample: PianoSampleDefinition
  ) => Promise<LoadedPianoStrikeSample | LoadedPianoReleaseSample>
): Promise<Array<LoadedPianoStrikeSample | LoadedPianoReleaseSample>> => {
  const results: Array<LoadedPianoStrikeSample | LoadedPianoReleaseSample> = [];

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

function getPianoSampleDefinitions(
  modules: Record<string, string>
): Array<PianoSampleDefinition> {
  return Object.entries(modules)
    .map(([path, url]) => getPianoSampleDefinition(path, url))
    .sort((a, b) => a.midi - b.midi || getSampleSortValue(a) - getSampleSortValue(b));
}

function getPianoSampleDefinition(path: string, url: string): PianoSampleDefinition {
  const filename = path.split('/').pop() ?? path;
  const strikeMatch = /^(?<note>[A-G](?:sharp)?\d+)v(?<velocityLayer>\d+)\.m4a$/.exec(
    filename
  );
  if (strikeMatch?.groups) {
    return {
      kind: 'strike',
      midi: getMidiForPianoSampleNote(strikeMatch.groups.note),
      path,
      url,
      velocityLayer: Number(strikeMatch.groups.velocityLayer),
    };
  }

  const releaseMatch = /^rel(?<releaseIndex>\d+)\.m4a$/.exec(filename);
  if (releaseMatch?.groups) {
    return {
      kind: 'release',
      midi: getMidiForReleaseSample(Number(releaseMatch.groups.releaseIndex)),
      path,
      url,
    };
  }

  throw new Error(`Invalid piano sample filename ${path}`);
}

function getSampleSortValue(sample: PianoSampleDefinition): number {
  return sample.kind === 'strike' ? sample.velocityLayer : Number.MAX_SAFE_INTEGER;
}

function getMidiForPianoSampleNote(note: string): number {
  const match = /^(?<name>[A-G])(?<accidental>sharp)?(?<octave>\d+)$/.exec(note);
  if (!match?.groups) {
    throw new Error(`Invalid piano sample note ${note}`);
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
}

function getMidiForReleaseSample(releaseIndex: number): number {
  const pianoLowestMidi = 21;
  return pianoLowestMidi + releaseIndex - 1;
}

const sortLoadedPianoSamples = (
  samples: Array<LoadedPianoStrikeSample | LoadedPianoReleaseSample>
): LoadedPianoSamples => ({
  releases: samples
    .filter((sample): sample is LoadedPianoReleaseSample => !('velocityLayer' in sample))
    .sort((a, b) => a.midi - b.midi),
  strikes: samples
    .filter((sample): sample is LoadedPianoStrikeSample => 'velocityLayer' in sample)
    .sort((a, b) => a.midi - b.midi || a.velocityLayer - b.velocityLayer),
});

const cloneLoadedPianoSamples = (samples: LoadedPianoSamples): LoadedPianoSamples => ({
  releases: [...samples.releases],
  strikes: [...samples.strikes],
});
