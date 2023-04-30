import { setUpFullScreenQuad } from '../../utils/graphics/full-screen-quad/full-screen-quad';
import { generateNoise } from '../../utils/graphics/noise/noise';
import random from '../../utils/graphics/random.wgsl';
import { smartCompile } from '../../utils/graphics/smart-compile';
import { CommonParameters } from '../common-parameters';
import shader from './diffuse.wgsl';
import { DiffusionSettings } from './diffusion-settings';

export class DiffusionPipeline {
  private static readonly UNIFORM_COUNT = 18;

  private readonly pipeline: GPURenderPipeline;
  private readonly uniforms: GPUBuffer;
  private readonly quadVertexBuffer: GPUBuffer;
  private readonly noise: GPUTextureView;

  private bindGroup?: GPUBindGroup;
  private previousTrailMapIn?: GPUTexture;

  public constructor(private readonly device: GPUDevice) {
    this.noise = generateNoise({
      device,
      width: 256,
      height: 256,
      octaves: 8,
      amplitude: 0.12,
      gain: 0.7,
      lacunarity: 80,
    });

    const { buffer, vertex } = setUpFullScreenQuad(device);
    this.quadVertexBuffer = buffer;

    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex,
      fragment: {
        module: smartCompile(device, random, shader),
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
    canvasSize,
    deltaTime,
    time,
    diffusionRateTrails,
    decayRateTrails,
    diffusionRateBrush,
    decayRateBrush,
  }: CommonParameters & DiffusionSettings) {
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([
        canvasSize[0],
        canvasSize[1],
        deltaTime,
        time,
        diffusionRateTrails,
        decayRateTrails,
        diffusionRateBrush,
        decayRateBrush,
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
          {
            binding: 3,
            resource: this.noise,
          },
        ],
      });

      this.previousTrailMapIn = trailMapIn;
    }
  }

  public destroy() {
    this.quadVertexBuffer.destroy();
    this.uniforms.destroy();
  }
}
