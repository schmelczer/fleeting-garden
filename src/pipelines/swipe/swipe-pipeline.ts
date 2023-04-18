import { setUpFullScreenQuad } from '../../utils/full-screen-quad';
import shader from './swipe.wgsl';

import { vec2 } from 'gl-matrix';

export class SwipePipeline {
  private static readonly UNIFORM_COUNT = 8;

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
      size: SwipePipeline.UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  public setParameters({
    width,
    height,
    isSwipeActive,
    swipe,
    swipeRadius,
  }: {
    width: number;
    height: number;
    isSwipeActive: boolean;
    swipe: vec2;
    swipeRadius: number;
  }) {
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([
        width,
        height,
        swipe ? swipe[0] : 0,
        swipe ? swipe[1] : 0,
        swipeRadius,
        isSwipeActive ? 1 : 0,
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
