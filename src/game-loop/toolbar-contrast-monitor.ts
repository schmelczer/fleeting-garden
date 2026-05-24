import { appConfig } from '../config';
import { clamp01 } from '../utils/math';
import type { CanvasReadbackRequest } from './game-loop-types';

interface CanvasSamplePoint {
  x: number;
  y: number;
}

interface CanvasSampleRegion {
  bytesPerRow: number;
  height: number;
  origin: CanvasSamplePoint;
  sampleOffsets: Array<number>;
  width: number;
}

interface ToolbarContrastMetrics {
  averageLuminance: number;
  backgroundOpacity: number;
  brightRatio: number;
  lowContrastRatio: number;
}

const TOOLBAR_BACKGROUND_OPACITY_PROPERTY = '--toolbar-background-opacity';
const TOOLBAR_BACKGROUND_STRENGTH_PROPERTY = '--toolbar-background-strength';
const GPU_COPY_BYTES_PER_ROW_ALIGNMENT = 256;

const getLinearChannel = (channel: number): number => {
  const normalized = channel / 255;
  return normalized <= appConfig.toolbar.contrast.linearChannelBreakpoint
    ? normalized / appConfig.toolbar.contrast.linearChannelDivisor
    : ((normalized + appConfig.toolbar.contrast.linearChannelOffset) /
        appConfig.toolbar.contrast.linearChannelScale) **
        appConfig.toolbar.contrast.linearChannelGamma;
};

const getRelativeLuminance = (red: number, green: number, blue: number): number =>
  appConfig.toolbar.contrast.luminanceRedWeight * getLinearChannel(red) +
  appConfig.toolbar.contrast.luminanceGreenWeight * getLinearChannel(green) +
  appConfig.toolbar.contrast.luminanceBlueWeight * getLinearChannel(blue);

const getToolbarContrastMetrics = (
  pixels: Uint8Array,
  sampleOffsets: ReadonlyArray<number>,
  isBgra: boolean
): ToolbarContrastMetrics => {
  const count = sampleOffsets.filter(
    (offset) =>
      offset >= 0 && offset + appConfig.toolbar.contrast.bytesPerSample <= pixels.length
  ).length;
  if (count === 0) {
    return {
      averageLuminance: 0,
      backgroundOpacity: 0,
      brightRatio: 0,
      lowContrastRatio: 0,
    };
  }

  let luminanceTotal = 0;
  let brightCount = 0;
  let lowContrastCount = 0;

  sampleOffsets.forEach((offset) => {
    if (
      offset < 0 ||
      offset + appConfig.toolbar.contrast.bytesPerSample > pixels.length
    ) {
      return;
    }

    const red = pixels[offset + (isBgra ? 2 : 0)];
    const green = pixels[offset + 1];
    const blue = pixels[offset + (isBgra ? 0 : 2)];
    const luminance = getRelativeLuminance(red, green, blue);
    const contrastWithWhite =
      appConfig.toolbar.contrast.whiteContrastNumerator /
      (luminance + appConfig.toolbar.contrast.contrastOffset);

    luminanceTotal += luminance;
    if (luminance > appConfig.toolbar.contrast.brightLuminanceThreshold) {
      brightCount++;
    }
    if (contrastWithWhite < appConfig.toolbar.contrast.lowContrastThreshold) {
      lowContrastCount++;
    }
  });

  const averageLuminance = luminanceTotal / count;
  const brightRatio = brightCount / count;
  const lowContrastRatio = lowContrastCount / count;
  const backgroundStrength = clamp01(
    Math.max(0, averageLuminance - appConfig.toolbar.contrast.luminanceBase) /
      appConfig.toolbar.contrast.luminanceRange +
      brightRatio * appConfig.toolbar.contrast.brightWeight +
      lowContrastRatio * appConfig.toolbar.contrast.lowContrastWeight
  );
  const backgroundOpacity =
    backgroundStrength * appConfig.toolbar.contrast.backgroundOpacityMax;

  return {
    averageLuminance,
    backgroundOpacity,
    brightRatio,
    lowContrastRatio,
  };
};

export class ToolbarContrastMonitor {
  private readonly isBgra: boolean;
  private isDestroyed = false;
  private isReadbackPending = false;
  private lastSampleAt = Number.NEGATIVE_INFINITY;
  private readbackBuffer: GPUBuffer | null = null;
  private readbackBufferSize = 0;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly toolbar: HTMLElement,
    private readonly device: GPUDevice,
    canvasFormat: GPUTextureFormat
  ) {
    this.isBgra = canvasFormat === 'bgra8unorm';
  }

  public takeReadbackRequest(time: DOMHighResTimeStamp): CanvasReadbackRequest | null {
    if (
      this.isDestroyed ||
      this.isReadbackPending ||
      time - this.lastSampleAt < appConfig.toolbar.contrast.sampleIntervalMs
    ) {
      return null;
    }

    const sampleRegion = this.getSampleRegion();
    if (sampleRegion.sampleOffsets.length === 0) {
      return null;
    }

    const bufferSize = sampleRegion.bytesPerRow * sampleRegion.height;
    const buffer = this.getReadbackBuffer(bufferSize);
    if (!buffer) {
      return null;
    }

    this.isReadbackPending = true;
    this.lastSampleAt = time;

    let isCancelled = false;
    let isEncoded = false;
    const cancel = () => {
      if (isCancelled) {
        return;
      }

      isCancelled = true;
      this.isReadbackPending = false;
    };

    return {
      encode: (commandEncoder, texture) => {
        if (isCancelled) {
          return;
        }

        try {
          commandEncoder.copyTextureToBuffer(
            {
              origin: sampleRegion.origin,
              texture,
            },
            {
              buffer,
              bytesPerRow: sampleRegion.bytesPerRow,
            },
            {
              depthOrArrayLayers: 1,
              height: sampleRegion.height,
              width: sampleRegion.width,
            }
          );
          isEncoded = true;
        } catch {
          cancel();
        }
      },
      afterSubmit: () => {
        if (isCancelled) {
          return;
        }

        if (!isEncoded) {
          cancel();
          return;
        }

        void this.readBuffer(buffer, sampleRegion.sampleOffsets);
      },
    };
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.readbackBuffer?.destroy();
    this.readbackBuffer = null;
    this.readbackBufferSize = 0;
    this.toolbar.style.removeProperty(TOOLBAR_BACKGROUND_OPACITY_PROPERTY);
    this.toolbar.style.removeProperty(TOOLBAR_BACKGROUND_STRENGTH_PROPERTY);
  }

  private setToolbarBackgroundOpacity(backgroundOpacity: number): void {
    const safeBackgroundOpacity = Math.min(
      appConfig.toolbar.contrast.backgroundOpacityMax,
      Math.max(0, backgroundOpacity)
    );
    const backgroundStrength =
      appConfig.toolbar.contrast.backgroundOpacityMax > 0
        ? clamp01(safeBackgroundOpacity / appConfig.toolbar.contrast.backgroundOpacityMax)
        : 0;

    this.toolbar.style.setProperty(
      TOOLBAR_BACKGROUND_OPACITY_PROPERTY,
      `${(safeBackgroundOpacity * 100).toFixed(1)}%`
    );
    this.toolbar.style.setProperty(
      TOOLBAR_BACKGROUND_STRENGTH_PROPERTY,
      backgroundStrength.toFixed(3)
    );
  }

  private getSampleRegion(): CanvasSampleRegion {
    const emptyRegion = {
      bytesPerRow: 0,
      height: 0,
      origin: { x: 0, y: 0 },
      sampleOffsets: [],
      width: 0,
    };
    const canvasRect = this.canvas.getBoundingClientRect();
    const toolbarRect = this.toolbar.getBoundingClientRect();
    if (
      canvasRect.width <= 0 ||
      canvasRect.height <= 0 ||
      toolbarRect.width <= 0 ||
      toolbarRect.height <= 0
    ) {
      return emptyRegion;
    }

    const left = Math.max(canvasRect.left, toolbarRect.left);
    const right = Math.min(canvasRect.right, toolbarRect.right);
    const top = Math.max(canvasRect.top, toolbarRect.top);
    const bottom = Math.min(canvasRect.bottom, toolbarRect.bottom);
    if (left >= right || top >= bottom) {
      return emptyRegion;
    }

    const xScale = this.canvas.width / canvasRect.width;
    const yScale = this.canvas.height / canvasRect.height;
    const cssWidth = right - left;
    const cssHeight = bottom - top;
    const origin = {
      x: Math.max(0, Math.floor((left - canvasRect.left) * xScale)),
      y: Math.max(0, Math.floor((top - canvasRect.top) * yScale)),
    };
    const regionRight = Math.min(
      this.canvas.width,
      Math.ceil((right - canvasRect.left) * xScale)
    );
    const regionBottom = Math.min(
      this.canvas.height,
      Math.ceil((bottom - canvasRect.top) * yScale)
    );
    const width = Math.max(0, regionRight - origin.x);
    const height = Math.max(0, regionBottom - origin.y);
    if (width === 0 || height === 0) {
      return emptyRegion;
    }

    const bytesPerRow = alignTo(
      width * appConfig.toolbar.contrast.bytesPerSample,
      GPU_COPY_BYTES_PER_ROW_ALIGNMENT
    );
    const points = new Map<string, CanvasSamplePoint>();

    for (let row = 0; row < appConfig.toolbar.contrast.sampleRows; row++) {
      const cssY =
        top + ((row + 0.5) / appConfig.toolbar.contrast.sampleRows) * cssHeight;
      const y = Math.min(
        this.canvas.height - 1,
        Math.max(0, Math.floor((cssY - canvasRect.top) * yScale))
      );

      for (let column = 0; column < appConfig.toolbar.contrast.sampleColumns; column++) {
        const cssX =
          left + ((column + 0.5) / appConfig.toolbar.contrast.sampleColumns) * cssWidth;
        const x = Math.min(
          this.canvas.width - 1,
          Math.max(0, Math.floor((cssX - canvasRect.left) * xScale))
        );
        points.set(`${x}:${y}`, { x, y });
      }
    }

    return {
      bytesPerRow,
      height,
      origin,
      sampleOffsets: [...points.values()].map(
        (point) =>
          (point.y - origin.y) * bytesPerRow +
          (point.x - origin.x) * appConfig.toolbar.contrast.bytesPerSample
      ),
      width,
    };
  }

  private getReadbackBuffer(size: number): GPUBuffer | null {
    if (this.readbackBuffer && this.readbackBufferSize >= size) {
      return this.readbackBuffer;
    }

    this.readbackBuffer?.destroy();
    try {
      this.readbackBuffer = this.device.createBuffer({
        size,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      this.readbackBufferSize = size;
      return this.readbackBuffer;
    } catch {
      this.readbackBuffer = null;
      this.readbackBufferSize = 0;
      return null;
    }
  }

  private async readBuffer(
    buffer: GPUBuffer,
    sampleOffsets: Array<number>
  ): Promise<void> {
    let isMapped = false;
    try {
      await buffer.mapAsync(GPUMapMode.READ);
      isMapped = true;

      if (!this.isDestroyed) {
        const pixels = new Uint8Array(buffer.getMappedRange());
        const metrics = getToolbarContrastMetrics(pixels, sampleOffsets, this.isBgra);
        this.setToolbarBackgroundOpacity(metrics.backgroundOpacity);
      }
    } catch {
      // Readback is an enhancement; leave rendering alone if the GPU rejects it.
    } finally {
      if (isMapped) {
        buffer.unmap();
      }
      this.isReadbackPending = false;
    }
  }
}

const alignTo = (value: number, alignment: number): number =>
  Math.ceil(value / alignment) * alignment;
