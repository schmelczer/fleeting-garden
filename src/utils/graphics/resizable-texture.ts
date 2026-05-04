import { vec2 } from 'gl-matrix';

import { CopyPipeline } from '../../pipelines/copy/copy-pipeline';

export class ResizableTexture {
  private texture!: GPUTexture;
  private textureView!: GPUTextureView;
  private readonly copyPipeline: CopyPipeline;
  private size: vec2 | null = null;

  public constructor(
    private readonly device: GPUDevice,
    size: vec2
  ) {
    this.copyPipeline = new CopyPipeline(this.device);
    this.resize(size);
  }

  public resize(size: vec2): void {
    if (this.size !== null && vec2.equals(this.size, size)) {
      return;
    }

    const newTexture = this.device.createTexture({
      format: 'rgba16float',
      size: {
        width: size[0],
        height: size[1],
      },
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const newTextureView = newTexture.createView();

    if (this.size) {
      const commandEncoder = this.device.createCommandEncoder();
      this.copyPipeline.execute(
        commandEncoder,
        this.textureView,
        newTextureView,
        vec2.div(vec2.create(), this.size, size)
      );
      this.device.queue.submit([commandEncoder.finish()]);
      this.texture.destroy();
    }

    this.size = size;
    this.texture = newTexture;
    this.textureView = newTextureView;
  }

  public getTextureView(): GPUTextureView {
    return this.textureView;
  }

  public destroy(): void {
    this.texture.destroy();
    this.copyPipeline.destroy();
  }
}
