import { vec2 } from 'gl-matrix';

import { appConfig } from '../config';
import { ERASER_MASK_TEXTURE_FORMAT } from '../pipelines/texture-formats';
import {
  ResizableTexture,
  type PendingTextureResize,
} from '../utils/graphics/resizable-texture';

export class SimulationTextures {
  // trailMapA holds the current trail (read by agent and diffuse). trailMapB
  // receives the diffuse output; the two swap each frame so the freshly
  // diffused texture becomes trailMapA for the next frame.
  public trailMapA: ResizableTexture;
  public trailMapB: ResizableTexture;
  // Per-frame last-writer deposit map: cleared each frame, written sparsely by
  // agents, then read by diffuse alongside trailMapA.
  public readonly depositMap: ResizableTexture;
  public readonly eraserMask: ResizableTexture;
  public sourceMapA: ResizableTexture;
  public sourceMapB: ResizableTexture;

  public constructor(
    private readonly device: GPUDevice,
    canvasSize: vec2
  ) {
    this.trailMapA = this.createTexture(canvasSize);
    this.trailMapB = this.createTexture(canvasSize);
    this.depositMap = this.createTexture(canvasSize);
    this.sourceMapA = this.createTexture(canvasSize);
    this.sourceMapB = this.createTexture(canvasSize);
    this.eraserMask = this.createEraserMask(canvasSize);
  }

  public resizeTo(nextSize: vec2): vec2 | null {
    const previousSize = this.trailMapA.getSize();
    if (vec2.equals(previousSize, nextSize)) {
      return null;
    }

    const scale = vec2.div(vec2.create(), nextSize, previousSize);
    const resizes = [
      this.trailMapA,
      this.trailMapB,
      this.depositMap,
      this.sourceMapA,
      this.sourceMapB,
      this.eraserMask,
    ]
      .map((texture): [ResizableTexture, PendingTextureResize] | null => {
        const resize = texture.prepareResize(nextSize);
        return resize ? [texture, resize] : null;
      })
      .filter((resize): resize is [ResizableTexture, PendingTextureResize] =>
        Boolean(resize)
      );

    if (resizes.length > 0) {
      const commandEncoder = this.device.createCommandEncoder();
      resizes.forEach(([texture, resize]) => {
        texture.encodeResize(commandEncoder, resize);
      });
      this.device.queue.submit([commandEncoder.finish()]);
      resizes.forEach(([texture, resize]) => {
        texture.commitResize(resize);
      });
    }

    return scale;
  }

  public clear(): void {
    const commandEncoder = this.device.createCommandEncoder();
    [
      this.trailMapA,
      this.trailMapB,
      this.depositMap,
      this.sourceMapA,
      this.sourceMapB,
      this.eraserMask,
    ].forEach((texture) => {
      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: texture.getTextureView(),
            clearValue: appConfig.simulation.clearColor,
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      passEncoder.end();
    });
    this.device.queue.submit([commandEncoder.finish()]);
  }

  public clearDepositMap(commandEncoder: GPUCommandEncoder): void {
    // Hardware fast-clear via a render pass with loadOp 'clear' and an empty
    // body. Cheaper than copyTextureToTexture and writes no actual color data
    // on tile-based GPUs.
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.depositMap.getTextureView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    passEncoder.end();
  }

  public swapTrailMaps(): void {
    [this.trailMapA, this.trailMapB] = [this.trailMapB, this.trailMapA];
  }

  public clearSourceMaps(commandEncoder: GPUCommandEncoder): void {
    // Only sourceMapA needs clearing — sourceMapB gets fully overwritten by
    // the diffusion pass on the next active frame before it's ever sampled.
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.sourceMapA.getTextureView(),
          clearValue: appConfig.simulation.clearColor,
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    passEncoder.end();
  }

  public swapSourceMaps(): void {
    [this.sourceMapA, this.sourceMapB] = [this.sourceMapB, this.sourceMapA];
  }

  public destroy(): void {
    this.trailMapA.destroy();
    this.trailMapB.destroy();
    this.depositMap.destroy();
    this.sourceMapA.destroy();
    this.sourceMapB.destroy();
    this.eraserMask.destroy();
  }

  private createTexture(size: vec2): ResizableTexture {
    return new ResizableTexture(this.device, size);
  }

  private createEraserMask(size: vec2): ResizableTexture {
    return new ResizableTexture(this.device, size, {
      clearValue: { r: 1, g: 1, b: 1, a: 1 },
      format: ERASER_MASK_TEXTURE_FORMAT,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    });
  }
}
