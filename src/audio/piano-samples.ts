import { ErrorHandler, Severity } from '../utils/error-handler';
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

type LoadedPianoSample = LoadedPianoStrikeSample | LoadedPianoReleaseSample;

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

// The sampler degrades gracefully on a partial set: it picks the nearest
// available strike per note, blends whatever velocity layers exist, and
// treats release samples as optional. The core velocity layer is therefore
// enough to start playing; the remaining layers and the release samples
// stream in afterwards, published per completed layer so nearest-sample
// lookups never see a half-loaded layer.
const coreVelocityLayer = 8;
const corePianoSampleDefinitions = pianoSampleDefinitions.filter(
  (definition) =>
    definition.kind === 'strike' && definition.velocityLayer === coreVelocityLayer
);
const backgroundPianoSamplePhases = getBackgroundPianoSamplePhases();

const loadedSamplesByPath = new Map<string, LoadedPianoSample>();
let publishedSamples: LoadedPianoSamples | null = null;
let coreSampleLoadPromise: Promise<void> | null = null;
let isLoadingBackgroundSamples = false;
const sampleSubscribers = new Set<(samples: LoadedPianoSamples) => void>();
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
): Promise<void> => {
  const OfflineAudioContextConstructor = globalThis.OfflineAudioContext;

  if (!OfflineAudioContextConstructor) {
    return Promise.reject(
      new Error('OfflineAudioContext is required to preload piano samples.')
    );
  }

  // Decoding ignores these, but the constructor demands real numbers.
  const decodeContext = new OfflineAudioContextConstructor(1, 1, 48_000);
  return ensurePianoSamplesLoading(decodeContext, onProgress);
};

/**
 * Starts loading samples if needed and resolves once the core velocity layer
 * is playable. Failed samples are retried on the next call; background layers
 * keep streaming in after resolution.
 */
export const ensurePianoSamplesLoading = (
  decodeContext: BaseAudioContext,
  onProgress?: (progress: PianoSampleLoadProgress) => void
): Promise<void> => {
  const unsubscribeProgress = subscribeToPianoSampleProgress(onProgress);

  coreSampleLoadPromise ??= loadCoreSamples(decodeContext).catch((error: unknown) => {
    coreSampleLoadPromise = null;
    throw error;
  });
  coreSampleLoadPromise.then(
    () => {
      startBackgroundLoading(decodeContext);
    },
    () => undefined
  );

  return coreSampleLoadPromise.finally(unsubscribeProgress);
};

/**
 * Calls the listener with the currently published samples (if any) and again
 * whenever another batch finishes loading. Returns an unsubscribe function.
 */
export const subscribeToPianoSamples = (
  listener: (samples: LoadedPianoSamples) => void
): (() => void) => {
  sampleSubscribers.add(listener);
  if (publishedSamples) {
    listener(cloneLoadedPianoSamples(publishedSamples));
  }
  return () => {
    sampleSubscribers.delete(listener);
  };
};

const loadCoreSamples = async (decodeContext: BaseAudioContext): Promise<void> => {
  const pending = corePianoSampleDefinitions.filter(
    (definition) => !loadedSamplesByPath.has(definition.path)
  );
  const totalCount = corePianoSampleDefinitions.length;
  let loadedCount = totalCount - pending.length;
  let settledCount = loadedCount;
  let failedCount = 0;
  emitPianoSampleProgress({ failedCount, loadedCount, settledCount, totalCount });

  await loadSamplesWithConcurrency(pending, async (definition) => {
    try {
      await loadPianoSample(decodeContext, definition);
      loadedCount += 1;
    } catch (error) {
      failedCount += 1;
      throw error;
    } finally {
      settledCount += 1;
      emitPianoSampleProgress({ failedCount, loadedCount, settledCount, totalCount });
    }
  });

  publishLoadedSamples();
};

const startBackgroundLoading = (decodeContext: BaseAudioContext): void => {
  if (
    isLoadingBackgroundSamples ||
    loadedSamplesByPath.size === pianoSampleDefinitions.length
  ) {
    return;
  }

  isLoadingBackgroundSamples = true;
  loadBackgroundSamples(decodeContext).then(
    () => {
      isLoadingBackgroundSamples = false;
    },
    (error: unknown) => {
      // The piano stays playable on the samples loaded so far; the next
      // ensurePianoSamplesLoading call retries whatever is still missing.
      isLoadingBackgroundSamples = false;
      ErrorHandler.addException(error, {
        fallbackMessage: 'Could not load all piano samples.',
        severity: Severity.WARNING,
      });
    }
  );
};

const loadBackgroundSamples = async (decodeContext: BaseAudioContext): Promise<void> => {
  for (const phaseDefinitions of backgroundPianoSamplePhases) {
    const pending = phaseDefinitions.filter(
      (definition) => !loadedSamplesByPath.has(definition.path)
    );
    if (pending.length === 0) {
      continue;
    }

    await loadSamplesWithConcurrency(pending, (definition) =>
      loadPianoSample(decodeContext, definition)
    );
    publishLoadedSamples();
  }
};

const loadPianoSample = async (
  decodeContext: BaseAudioContext,
  sample: PianoSampleDefinition
): Promise<void> => {
  const loadedSample = await withTimeout(
    (signal) => fetchAndDecodePianoSample(decodeContext, sample, signal),
    sampleLoadTuning.sampleTimeoutMs
  );
  loadedSamplesByPath.set(sample.path, loadedSample);
};

const fetchAndDecodePianoSample = async (
  decodeContext: BaseAudioContext,
  sample: PianoSampleDefinition,
  signal: AbortSignal
): Promise<LoadedPianoSample> => {
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

/**
 * Runs the loads through a sliding window of workers so one slow sample only
 * occupies a single slot instead of stalling a whole batch.
 */
const loadSamplesWithConcurrency = async (
  samples: Array<PianoSampleDefinition>,
  loadSample: (sample: PianoSampleDefinition) => Promise<void>
): Promise<void> => {
  let nextIndex = 0;
  const workerCount = Math.min(sampleLoadTuning.concurrency, samples.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < samples.length) {
        const sample = samples[nextIndex];
        nextIndex += 1;
        await loadSample(sample);
      }
    })
  );
};

const publishLoadedSamples = (): void => {
  const samples = sortLoadedPianoSamples([...loadedSamplesByPath.values()]);
  publishedSamples = samples;
  sampleSubscribers.forEach((listener) => {
    listener(cloneLoadedPianoSamples(samples));
  });
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

function getBackgroundPianoSamplePhases(): Array<Array<PianoSampleDefinition>> {
  const strikes = pianoSampleDefinitions.filter(
    (definition) => definition.kind === 'strike'
  );
  const releases = pianoSampleDefinitions.filter(
    (definition) => definition.kind === 'release'
  );
  // Layers closest to the core layer first: they are blended in soonest by
  // getVelocityLayerPair; ties resolve to the louder layer.
  const remainingLayers = [...new Set(strikes.map((strike) => strike.velocityLayer))]
    .filter((layer) => layer !== coreVelocityLayer)
    .sort(
      (a, b) => Math.abs(a - coreVelocityLayer) - Math.abs(b - coreVelocityLayer) || b - a
    );

  return [
    releases,
    ...remainingLayers.map((layer) =>
      strikes.filter((strike) => strike.velocityLayer === layer)
    ),
  ];
}

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
  samples: Array<LoadedPianoSample>
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
