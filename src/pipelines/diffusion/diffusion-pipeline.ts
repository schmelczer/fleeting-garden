import { setUpFullScreenQuad } from '../../utils/full-screen-quad';
import shader from './diffuse.wgsl';

export class DiffusionPipeline {
  private static readonly UNIFORM_COUNT = 16;

  private readonly pipeline: GPURenderPipeline;
  private readonly uniforms: GPUBuffer;
  private readonly quadVertexBuffer: GPUBuffer;

  private bindGroup?: GPUBindGroup;
  private previousTrailMapIn?: GPUTexture;

  public constructor(private readonly device: GPUDevice) {
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
            format: 'rgba16float',
          },
        ],
      },
      primitive: {
        topology: 'triangle-strip',
      },
    });

    this.uniforms = this.device.createBuffer({
      size: DiffusionPipeline.UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  public setParameters({
    width,
    height,
    diffusionRate,
    decayRate,
    deltaTime,
    time,
    swipeRadius,
    swipeBlur,
  }: {
    width: number;
    height: number;
    diffusionRate: number;
    decayRate: number;
    deltaTime: number;
    time: number;
    swipeRadius: number;
    swipeBlur: number;
  }) {
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([
        width,
        height,
        diffusionRate,
        decayRate,
        deltaTime,
        time,
        swipeRadius,
        swipeBlur,
      ])
    );
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

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setVertexBuffer(0, this.quadVertexBuffer);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.draw(4, 1);
    passEncoder.end();
  }

  private ensureBindGroupExists(trailMapIn: GPUTexture) {
    if (this.previousTrailMapIn !== trailMapIn) {
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
            resource: trailMapIn.createView(),
          },
        ],
      });

      this.previousTrailMapIn = trailMapIn;
    }
  }
}
