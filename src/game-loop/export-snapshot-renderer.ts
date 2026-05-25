import { RenderPipeline } from '../pipelines/render/render-pipeline';
import type { VibeId } from '../vibes';

const SNAPSHOT_BYTES_PER_PIXEL = 4;
const SNAPSHOT_FILENAME_EXTENSION = 'png';
const SNAPSHOT_FILENAME_PREFIX = 'fleeting-garden';
const SNAPSHOT_FILENAME_SUFFIX = '-snapshot';
const SNAPSHOT_MIME_TYPE = 'image/png';
const SNAPSHOT_ROW_ALIGNMENT_BYTES = 256;

interface ExportSnapshotRendererOptions {
  device: GPUDevice;
  renderPipeline: RenderPipeline;
  canvasFormat: GPUTextureFormat;
  statusElement: HTMLElement;
  seed: string;
  getSourceSize: () => { width: number; height: number };
  getColorTextureView: () => GPUTextureView;
  getSourceTextureView: () => GPUTextureView;
  getSourceActive?: () => boolean;
  getVibeId: () => VibeId;
}

interface SnapshotLayout {
  width: number;
  height: number;
  unpaddedBytesPerRow: number;
  bytesPerRow: number;
  readbackBufferBytes: number;
}

export class ExportSnapshotRenderer {
  private isExporting = false;

  public constructor(private readonly options: ExportSnapshotRendererOptions) {}

  public async export(): Promise<void> {
    if (this.isExporting) {
      this.statusElement.textContent = 'Snapshot already saving...';
      return;
    }

    this.isExporting = true;
    this.statusElement.textContent = 'Saving snapshot...';

    try {
      const sourceSize = this.options.getSourceSize();
      await this.renderSnapshot(getSnapshotLayout(sourceSize.width, sourceSize.height));
      this.statusElement.textContent = '';
    } catch (error) {
      this.statusElement.textContent = 'Snapshot failed';
      throw error;
    } finally {
      this.isExporting = false;
    }
  }

  private async renderSnapshot(layout: SnapshotLayout): Promise<void> {
    const { width, height, unpaddedBytesPerRow, bytesPerRow } = layout;
    let texture: GPUTexture | null = null;
    let output: GPUBuffer | null = null;
    let isOutputMapped = false;

    try {
      texture = this.device.createTexture({
        size: { width, height },
        format: this.options.canvasFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      output = this.device.createBuffer({
        size: layout.readbackBufferBytes,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

      const commandEncoder = this.device.createCommandEncoder();
      this.options.renderPipeline.executeToView(
        commandEncoder,
        this.options.getColorTextureView(),
        this.options.getSourceTextureView(),
        texture.createView(),
        this.options.getSourceActive?.() ?? true
      );
      commandEncoder.copyTextureToBuffer(
        { texture },
        { buffer: output, bytesPerRow, rowsPerImage: height },
        { width, height }
      );
      this.device.queue.submit([commandEncoder.finish()]);

      await output.mapAsync(GPUMapMode.READ);
      isOutputMapped = true;
      const pixels = readSnapshotPixels({
        mapped: new Uint8Array(output.getMappedRange()),
        width,
        height,
        unpaddedBytesPerRow,
        bytesPerRow,
        isBgra: this.options.canvasFormat === 'bgra8unorm',
      });
      output.unmap();
      isOutputMapped = false;
      output.destroy();
      output = null;
      texture.destroy();
      texture = null;

      await this.downloadPixels(pixels, width, height);
    } finally {
      if (output && isOutputMapped) {
        output.unmap();
      }
      output?.destroy();
      texture?.destroy();
    }
  }

  private async downloadPixels(
    pixels: Uint8ClampedArray<ArrayBuffer>,
    width: number,
    height: number
  ): Promise<void> {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not create export canvas');
    }

    context.putImageData(new ImageData(pixels, width, height), 0, 0);
    const blob = await canvas.convertToBlob({
      type: SNAPSHOT_MIME_TYPE,
    });
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    try {
      link.href = objectUrl;
      link.download = `${SNAPSHOT_FILENAME_PREFIX}_${this.options.getVibeId()}_${
        this.options.seed
      }_${width}x${height}${SNAPSHOT_FILENAME_SUFFIX}.${SNAPSHOT_FILENAME_EXTENSION}`;
      link.click();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  private get device(): GPUDevice {
    return this.options.device;
  }

  private get statusElement(): HTMLElement {
    return this.options.statusElement;
  }
}

const alignTo = (value: number, alignment: number): number =>
  Math.ceil(value / alignment) * alignment;

const getSnapshotDimension = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : 1;

const getSnapshotLayout = (sourceWidth: number, sourceHeight: number): SnapshotLayout => {
  const width = getSnapshotDimension(sourceWidth);
  const height = getSnapshotDimension(sourceHeight);
  const unpaddedBytesPerRow = width * SNAPSHOT_BYTES_PER_PIXEL;
  const bytesPerRow = alignTo(unpaddedBytesPerRow, SNAPSHOT_ROW_ALIGNMENT_BYTES);

  return {
    width,
    height,
    unpaddedBytesPerRow,
    bytesPerRow,
    readbackBufferBytes: bytesPerRow * height,
  };
};

const readSnapshotPixels = ({
  mapped,
  width,
  height,
  unpaddedBytesPerRow,
  bytesPerRow,
  isBgra,
}: {
  mapped: Uint8Array;
  width: number;
  height: number;
  unpaddedBytesPerRow: number;
  bytesPerRow: number;
  isBgra: boolean;
}): Uint8ClampedArray<ArrayBuffer> => {
  const pixels: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(
    unpaddedBytesPerRow * height
  );
  for (let y = 0; y < height; y++) {
    const sourceOffset = y * bytesPerRow;
    const targetOffset = y * unpaddedBytesPerRow;
    for (let x = 0; x < width; x++) {
      const source = sourceOffset + x * SNAPSHOT_BYTES_PER_PIXEL;
      const target = targetOffset + x * SNAPSHOT_BYTES_PER_PIXEL;
      pixels[target] = isBgra ? mapped[source + 2] : mapped[source];
      pixels[target + 1] = mapped[source + 1];
      pixels[target + 2] = isBgra ? mapped[source] : mapped[source + 2];
      pixels[target + 3] = mapped[source + 3];
    }
  }

  return pixels;
};
