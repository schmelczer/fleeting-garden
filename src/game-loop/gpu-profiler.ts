const PASS_NAMES = [
  'brush',
  'eraserTexture',
  'eraserAgent',
  'agent',
  'trailDiffusion',
  'render',
  'sourceDiffusion',
] as const;

export type GpuPassName = (typeof PASS_NAMES)[number];

interface GpuProfilerSample {
  frame: number;
  passes: Partial<Record<GpuPassName, number>>;
  totalPassMs: number;
}

interface ActivePass {
  endQueryIndex: number;
  name: GpuPassName;
  startQueryIndex: number;
}

interface ReadbackSlot {
  buffer: GPUBuffer;
  state: 'idle' | 'encoding' | 'mapping';
}

const MAX_QUERY_COUNT = PASS_NAMES.length * 2;
const QUERY_BYTES = BigUint64Array.BYTES_PER_ELEMENT;
const READBACK_SLOT_COUNT = 4;

export class GpuProfiler {
  private readonly querySet: GPUQuerySet;
  private readonly resolveBuffer: GPUBuffer;
  private readonly readbackSlots: Array<ReadbackSlot>;
  private readonly isEnabled: () => boolean;
  private activePasses: Array<ActivePass> = [];
  private nextQueryIndex = 0;
  private frame = 0;
  private latestSample: GpuProfilerSample | null = null;

  public static create(device: GPUDevice, isEnabled: () => boolean): GpuProfiler | null {
    if (!device.features.has('timestamp-query')) {
      return null;
    }
    return new GpuProfiler(device, isEnabled);
  }

  private constructor(device: GPUDevice, isEnabled: () => boolean) {
    this.isEnabled = isEnabled;
    this.querySet = device.createQuerySet({
      type: 'timestamp',
      count: MAX_QUERY_COUNT,
    });
    this.resolveBuffer = device.createBuffer({
      size: MAX_QUERY_COUNT * QUERY_BYTES,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    this.readbackSlots = Array.from({ length: READBACK_SLOT_COUNT }, () => ({
      buffer: device.createBuffer({
        size: MAX_QUERY_COUNT * QUERY_BYTES,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      }),
      state: 'idle' as const,
    }));
  }

  public beginFrame(): void {
    this.frame += 1;
    this.activePasses = [];
    this.nextQueryIndex = 0;
  }

  public timestampWrites(
    name: GpuPassName
  ): (GPUComputePassTimestampWrites & GPURenderPassTimestampWrites) | undefined {
    if (!this.isEnabled()) {
      return undefined;
    }
    if (this.nextQueryIndex + 1 >= MAX_QUERY_COUNT) {
      return undefined;
    }

    const startQueryIndex = this.nextQueryIndex;
    const endQueryIndex = this.nextQueryIndex + 1;
    this.nextQueryIndex += 2;
    this.activePasses.push({
      endQueryIndex,
      name,
      startQueryIndex,
    });

    return {
      querySet: this.querySet,
      beginningOfPassWriteIndex: startQueryIndex,
      endOfPassWriteIndex: endQueryIndex,
    };
  }

  public resolve(commandEncoder: GPUCommandEncoder): (() => void) | null {
    const queryCount = this.nextQueryIndex;
    if (queryCount === 0 || this.activePasses.length === 0) {
      return null;
    }

    const slot = this.readbackSlots.find((candidate) => candidate.state === 'idle');
    if (!slot) {
      return null;
    }

    const byteLength = queryCount * QUERY_BYTES;
    const passes = this.activePasses.slice();
    const frame = this.frame;
    slot.state = 'encoding';
    commandEncoder.resolveQuerySet(this.querySet, 0, queryCount, this.resolveBuffer, 0);
    commandEncoder.copyBufferToBuffer(this.resolveBuffer, 0, slot.buffer, 0, byteLength);

    return () => {
      slot.state = 'mapping';
      void slot.buffer
        .mapAsync(GPUMapMode.READ, 0, byteLength)
        .then(() => {
          this.publishSample(frame, passes, slot.buffer.getMappedRange(0, byteLength));
          slot.buffer.unmap();
          slot.state = 'idle';
        })
        .catch(() => {
          slot.state = 'idle';
        });
    };
  }

  public destroy(): void {
    this.querySet.destroy();
    this.resolveBuffer.destroy();
    this.readbackSlots.forEach((slot) => {
      slot.buffer.destroy();
    });
  }

  public get latestTotalPassMs(): number | undefined {
    return this.latestSample?.totalPassMs;
  }

  private publishSample(
    frame: number,
    passes: Array<ActivePass>,
    mappedRange: ArrayBuffer
  ): void {
    const timestamps = new BigUint64Array(mappedRange);
    const sample: GpuProfilerSample = {
      frame,
      passes: {},
      totalPassMs: 0,
    };

    passes.forEach(({ endQueryIndex, name, startQueryIndex }) => {
      const start = timestamps[startQueryIndex];
      const end = timestamps[endQueryIndex];
      if (end < start) {
        return;
      }

      const elapsedMs = Number(end - start) / 1_000_000;
      sample.passes[name] = elapsedMs;
      sample.totalPassMs += elapsedMs;
    });

    this.latestSample = sample;
  }
}
