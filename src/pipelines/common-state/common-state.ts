import { vec2 } from 'gl-matrix';

import { appConfig } from '../../config';
import {
  createCachedBufferWrite,
  writeBufferIfChanged,
} from '../../utils/graphics/cached-buffer-write';
import { generateNoise } from '../../utils/graphics/noise';

export class CommonState {
  private static readonly UNIFORM_COUNT = 4;

  private readonly uniforms: GPUBuffer;
  private readonly uniformValues = new Float32Array(CommonState.UNIFORM_COUNT);
  private readonly uniformCache = createCachedBufferWrite(
    CommonState.UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT
  );
  private readonly noise: GPUTexture;
  private readonly bindGroup: GPUBindGroup;

  public readonly bindGroupLayout: GPUBindGroupLayout;

  public static readonly shaderCode = /* wgsl */ `
    struct State {
      size: vec2<f32>,
      _padding: vec2<f32>,
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

    const noise = generateNoise({
      device,
      width: appConfig.pipelines.common.noiseTextureSize,
      height: appConfig.pipelines.common.noiseTextureSize,
    });
    this.noise = noise.texture;

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
            addressModeU: 'repeat',
            addressModeV: 'repeat',
            magFilter: 'linear',
            minFilter: 'linear',
          }),
        },
        {
          binding: 2,
          resource: noise.view,
        },
      ],
    });
  }

  public setParameters({ canvasSize }: { canvasSize: vec2 }) {
    this.uniformValues[0] = canvasSize[0];
    this.uniformValues[1] = canvasSize[1];
    writeBufferIfChanged(
      this.device,
      this.uniforms,
      this.uniformValues,
      this.uniformCache
    );
  }

  public execute(passEncoder: GPUComputePassEncoder | GPURenderPassEncoder) {
    passEncoder.setBindGroup(0, this.bindGroup);
  }

  public destroy() {
    this.uniforms.destroy();
    this.noise.destroy();
  }
}
