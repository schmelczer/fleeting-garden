import shader from './render.wgsl';

export class RenderPipeline {
  private readonly pipeline: GPURenderPipeline;
  private bindGroup?: GPUBindGroup;
  private previousColorTexture?: GPUTexture;

  public constructor(
    private readonly context: GPUCanvasContext,
    private readonly device: GPUDevice,
    preferredCanvasFormat: GPUTextureFormat
  ) {
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
            format: preferredCanvasFormat,
          },
        ],
      },
      primitive: {
        topology: 'triangle-strip',
      },
    });
  }

  public execute(commandEncoder: GPUCommandEncoder, colorTexture: GPUTexture) {
    this.ensureBindGroupExists(colorTexture);

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };
    const renderPassEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    renderPassEncoder.setBindGroup(0, this.bindGroup);
    renderPassEncoder.setPipeline(this.pipeline);
    renderPassEncoder.draw(4, 1);
    renderPassEncoder.end();
  }

  private ensureBindGroupExists(colorTexture: GPUTexture) {
    if (this.previousColorTexture !== colorTexture) {
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
            resource: colorTexture.createView(),
          },
        ],
      });

      this.previousColorTexture = colorTexture;
    }
  }
}
