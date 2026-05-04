import { vec2 } from 'gl-matrix';

import { CopyPipeline } from '../../pipelines/copy/copy-pipeline';

export class ResizableTexture {
  private texture: GPUTexture;
  private textureView: GPUTextureView;
  private size: vec2;
  private readonly copyPipeline: CopyPipeline;

  public constructor(
    private readonly device: GPUDevice,
    size: vec2
  ) {
    this.copyPipeline = new CopyPipeline(this.device);
    this.size = size;
    this.texture = this.createTexture(size);
    this.textureView = this.texture.createView();
  }

  public resize(size: vec2): void {
    if (vec2.equals(this.size, size)) {
      return;
    }

    const newTexture = this.createTexture(size);
    const newTextureView = newTexture.createView();

    const commandEncoder = this.device.createCommandEncoder();
    this.copyPipeline.execute(
      commandEncoder,
      this.textureView,
      newTextureView,
      vec2.div(vec2.create(), this.size, size)
    );
    this.device.queue.submit([commandEncoder.finish()]);
    this.texture.destroy();

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

  private createTexture(size: vec2): GPUTexture {
    return this.device.createTexture({
      format: 'rgba16float',
      size: { width: size[0], height: size[1] },
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }
}
