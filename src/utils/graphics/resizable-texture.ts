import { vec2 } from 'gl-matrix';

import { TRAIL_SOURCE_TEXTURE_FORMAT } from '../../pipelines/texture-formats';

interface ResizableTextureOptions {
  clearValue?: GPUColor;
  format?: GPUTextureFormat;
  usage?: GPUTextureUsageFlags;
}

export interface PendingTextureResize {
  copySize: GPUExtent3DStrict;
  newSize: vec2;
  newTexture: GPUTexture;
  newTextureView: GPUTextureView;
  oldTexture: GPUTexture;
}

export class ResizableTexture {
  private texture: GPUTexture;
  private textureView: GPUTextureView;
  private size: vec2;
  private readonly clearValue: GPUColor;
  private readonly format: GPUTextureFormat;
  private readonly usage: GPUTextureUsageFlags;

  public constructor(
    private readonly device: GPUDevice,
    size: vec2,
    {
      clearValue = { r: 0, g: 0, b: 0, a: 0 },
      format = TRAIL_SOURCE_TEXTURE_FORMAT,
      usage = defaultTextureUsage,
    }: ResizableTextureOptions = {}
  ) {
    this.size = vec2.clone(size);
    this.clearValue = clearValue;
    this.format = format;
    this.usage = usage;
    this.texture = this.createTexture(size);
    this.textureView = this.texture.createView();
  }

  public prepareResize(size: vec2): PendingTextureResize | null {
    if (vec2.equals(this.size, size)) {
      return null;
    }

    const newTexture = this.createTexture(size);
    const newTextureView = newTexture.createView();
    const copySize = {
      width: Math.min(this.size[0], size[0]),
      height: Math.min(this.size[1], size[1]),
    };

    return {
      copySize,
      newSize: vec2.clone(size),
      newTexture,
      newTextureView,
      oldTexture: this.texture,
    };
  }

  public encodeResize(
    commandEncoder: GPUCommandEncoder,
    resize: PendingTextureResize
  ): void {
    const clearPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: resize.newTextureView,
          clearValue: this.clearValue,
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    clearPass.end();
    commandEncoder.copyTextureToTexture(
      { texture: resize.oldTexture },
      { texture: resize.newTexture },
      resize.copySize
    );
  }

  public commitResize(resize: PendingTextureResize): void {
    resize.oldTexture.destroy();
    this.size = resize.newSize;
    this.texture = resize.newTexture;
    this.textureView = resize.newTextureView;
  }

  public getSize(): vec2 {
    return vec2.clone(this.size);
  }

  public getTextureView(): GPUTextureView {
    return this.textureView;
  }

  public getTexture(): GPUTexture {
    return this.texture;
  }

  public destroy(): void {
    this.texture.destroy();
  }

  private createTexture(size: vec2): GPUTexture {
    return this.device.createTexture({
      format: this.format,
      size: { width: size[0], height: size[1] },
      usage: this.usage,
    });
  }
}

const defaultTextureUsage =
  GPUTextureUsage.STORAGE_BINDING |
  GPUTextureUsage.TEXTURE_BINDING |
  GPUTextureUsage.RENDER_ATTACHMENT |
  GPUTextureUsage.COPY_SRC |
  GPUTextureUsage.COPY_DST;
