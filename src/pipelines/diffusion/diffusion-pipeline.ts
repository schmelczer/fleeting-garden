import { setUpFullScreenQuad } from '../../utils/full-screen-quad';
import shader from './diffuse.wgsl';

import { vec2 } from 'gl-matrix';

export class DiffusionPipeline {
  private static readonly UNIFORM_COUNT = 14;

  private readonly pipeline: GPURenderPipeline;
  private readonly uniforms: GPUBuffer;
  private readonly quadVertexBuffer: GPUBuffer;

  private swipes: Array<vec2> = [
    vec2.fromValues(Number.NaN, Number.NaN),
    vec2.fromValues(Number.NaN, Number.NaN),
  ];
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
    swipe,
    swipeRadius,
    swipeBlur,
    isSwipeActive,
  }: {
    width: number;
    height: number;
    swipe: vec2;
    diffusionRate: number;
    decayRate: number;
    deltaTime: number;
    time: number;
    swipeRadius: number;
    swipeBlur: number;
    isSwipeActive: boolean;
  }) {
    if (swipe) {
      this.swipes = [...this.swipes.slice(-1), swipe];
    }

    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([
        width,
        height,
        ...this.swipes.flatMap((s) => [s[0], s[1]]),
        diffusionRate,
        decayRate,
        deltaTime,
        time,
        swipeRadius,
        swipeBlur,
        isSwipeActive ? 1.0 : 0.0,
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
