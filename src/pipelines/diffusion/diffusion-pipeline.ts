import shader from './diffuse.wgsl';

export class DiffusionPipeline {
  private readonly pipeline: GPURenderPipeline;
  private bindGroup?: GPUBindGroup;
  private previousTrailMapIn?: GPUTexture;

  public constructor(private readonly device: GPUDevice) {
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({
          code: shader,
        }),
        entryPoint: 'vertex',
      },
      fragment: {
        module: device.createShaderModule({
          code: shader,
        }),
        entryPoint: 'fragment',
        targets: [
          {
            format: 'rgba16float',
          },
        ],
      },
      primitive: {
        topology: 'triangle-strip',
      },
    });
  }

  public execute(
    commandEncoder: GPUCommandEncoder,
    trailMapIn: GPUTexture,
    trailMapOut: GPUTexture
  ) {
    this.ensureBindGroupExists(trailMapIn);

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: trailMapOut.createView(),
          clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };

    const renderPassEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    renderPassEncoder.setBindGroup(0, this.bindGroup!);
    renderPassEncoder.setPipeline(this.pipeline);
    renderPassEncoder.draw(4, 1);
    renderPassEncoder.end();
  }

  private ensureBindGroupExists(trailMapIn: GPUTexture) {
    if (this.previousTrailMapIn !== trailMapIn) {
      this.bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: this.device.createSampler({
              magFilter: 'linear',
              minFilter: 'linear',
            }),
          },
          {
            binding: 1,
            resource: trailMapIn.createView(),
          },
        ],
      });

      this.previousTrailMapIn = trailMapIn;
    }
  }
}
