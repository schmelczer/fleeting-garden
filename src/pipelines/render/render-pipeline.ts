import { setUpFullScreenQuad } from '../../utils/full-screen-quad';
import { CommonParameters } from '../common-parameters';
import { RenderSettings } from './render-settings';
import shader from './render.wgsl';

export class RenderPipeline {
  private static readonly UNIFORM_COUNT = 4;

  private readonly pipeline: GPURenderPipeline;
  private readonly uniforms: GPUBuffer;
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

    this.uniforms = this.device.createBuffer({
      size: RenderPipeline.UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  public setParameters({
    canvasSize,
    deltaTime,
    time,
  }: CommonParameters & RenderSettings) {
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([canvasSize[0], canvasSize[1], deltaTime, time])
    );
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
            resource: {
              buffer: this.uniforms,
            },
          },
          {
            binding: 1,
            resource: this.device.createSampler({
              magFilter: 'linear',
              minFilter: 'linear',
            }),
          },
          {
            binding: 2,
            resource: colorTexture.createView(),
          },
        ],
      });

      this.previousColorTexture = colorTexture;
    }
  }
}
