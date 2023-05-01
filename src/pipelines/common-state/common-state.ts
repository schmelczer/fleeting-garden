import { generateNoise } from '../../utils/graphics/noise/noise';

import { vec2 } from 'gl-matrix';

export class CommonState {
  private static readonly UNIFORM_COUNT = 4;

  private readonly uniforms: GPUBuffer;
  private readonly noise: GPUTextureView;
  private readonly bindGroup: GPUBindGroup;

  public readonly bindGroupLayout: GPUBindGroupLayout;

  public static readonly shaderCode = /* wgsl */ `
    struct State {
      size: vec2<f32>,
      deltaTime: f32, 
      time: f32,
    };
    
    @group(0) @binding(0) var<uniform> state: State;
    @group(0) @binding(1) var noiseSampler: sampler;
    @group(0) @binding(2) var noise: texture_2d<f32>;
  `;

  public constructor(private readonly device: GPUDevice) {
    this.uniforms = this.device.createBuffer({
      size: CommonState.UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.noise = generateNoise({
      device,
      width: 2048,
      height: 2048,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility:
            GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {
            type: 'uniform',
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
          sampler: {
            type: 'filtering',
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'float',
          },
        },
      ],
    });

    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
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
          resource: this.noise,
        },
      ],
    });
  }

  public setParameters(canvasSize: vec2, deltaTime: number, time: number) {
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([...canvasSize, deltaTime, time])
    );
  }

  public execute(passEncoder: GPUComputePassEncoder | GPURenderPassEncoder) {
    passEncoder.setBindGroup(0, this.bindGroup);
  }

  public destroy() {
    this.uniforms.destroy();
  }
}
