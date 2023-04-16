import { setUpFullScreenQuad } from '../../utils/full-screen-quad';
import shader from './render.wgsl';

export class RenderPipeline {
  private readonly pipeline: GPURenderPipeline;
  private readonly quadVertexBuffer: GPUBuffer;

  private bindGroup?: GPUBindGroup;
  private previousColorTexture?: GPUTexture;

  public constructor(
    private readonly context: GPUCanvasContext,
    private readonly device: GPUDevice,
    preferredCanvasFormat: GPUTextureFormat
  ) {
    const { buffer, vertex } = setUpFullScreenQuad(device);
    this.quadVertexBuffer = buffer;

    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex,
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
          clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setVertexBuffer(0, this.quadVertexBuffer);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.draw(4, 1);
    passEncoder.end();
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
