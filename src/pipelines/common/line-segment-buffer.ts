import { vec2 } from 'gl-matrix';

export interface LineSegment {
  from: vec2;
  to: vec2;
}

export const LINE_SEGMENT_VERTICES = 6;
const LINE_SEGMENT_ATTRIBUTES = 4;

export const LINE_SEGMENT_VERTEX_BUFFER_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: Float32Array.BYTES_PER_ELEMENT * LINE_SEGMENT_ATTRIBUTES,
  stepMode: 'instance',
  attributes: [
    { shaderLocation: 0, format: 'float32x2', offset: 0 },
    {
      shaderLocation: 1,
      format: 'float32x2',
      offset: Float32Array.BYTES_PER_ELEMENT * 2,
    },
  ],
};

export class LineSegmentBuffer {
  public readonly vertexBuffer: GPUBuffer;

  private readonly device: GPUDevice;
  private readonly maxSegments: number;
  private readonly uploadData: Float32Array;

  private pending: Array<LineSegment> = [];
  private active: Array<LineSegment> = [];

  public constructor(device: GPUDevice, maxSegments: number) {
    this.device = device;
    this.maxSegments = maxSegments;
    this.uploadData = new Float32Array(maxSegments * LINE_SEGMENT_ATTRIBUTES);
    this.vertexBuffer = device.createBuffer({
      size: this.uploadData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  public add(from: vec2, to: vec2): void {
    this.pending.push({ from: vec2.clone(from), to: vec2.clone(to) });
  }

  public clear(): void {
    this.pending.length = 0;
    this.active.length = 0;
  }

  public get activeCount(): number {
    return this.active.length;
  }

  public flush(): void {
    this.active = this.pending.slice();
    this.pending.length = 0;

    if (this.active.length === 0) {
      return;
    }

    if (this.active.length > this.maxSegments) {
      this.active = subsample(this.active, this.maxSegments);
    }

    let offset = 0;
    for (const segment of this.active) {
      this.uploadData[offset++] = segment.from[0];
      this.uploadData[offset++] = segment.from[1];
      this.uploadData[offset++] = segment.to[0];
      this.uploadData[offset++] = segment.to[1];
    }

    this.device.queue.writeBuffer(this.vertexBuffer, 0, this.uploadData, 0, offset);
  }

  public destroy(): void {
    this.vertexBuffer.destroy();
  }
}

const subsample = (segments: Array<LineSegment>, count: number): Array<LineSegment> => {
  const result: Array<LineSegment> = [];
  for (let i = 0; i < count; i++) {
    const index = Math.round((i * (segments.length - 1)) / (count - 1));
    result.push(segments[index]);
  }
  return result;
};
