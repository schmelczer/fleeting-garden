import { vec2 } from 'gl-matrix';

import { createBindGroupCache } from '../../utils/graphics/bind-group-cache';
import {
  createCachedBufferWrite,
  writeBufferIfChanged,
} from '../../utils/graphics/cached-buffer-write';
import { smartCompile } from '../../utils/graphics/smart-compile';
import { TRAIL_SOURCE_TEXTURE_FORMAT } from '../texture-formats';
import shader from './diffuse.wgsl?raw';

export interface DiffusionSettings {
  diffusionRateTrails: number;
  decayRateTrails: number;
  diffusionDecayRateDivisor: number;
  diffusionNeighborDivisor: number;
}

const MIN_DIFFUSION_RATE = 0.000001;

const getSafeInverseDiffusionRate = (diffusionRate: number): number =>
  1 /
  (Number.isFinite(diffusionRate) && diffusionRate > MIN_DIFFUSION_RATE
    ? diffusionRate
    : MIN_DIFFUSION_RATE);

const setDiffusionUniformValues = (
  target: Float32Array,
  {
    diffusionRateTrails,
    decayRateTrails,
    diffusionDecayRateDivisor,
    diffusionNeighborDivisor,
  }: DiffusionSettings
): void => {
  const decayDivisor = Math.max(Number.EPSILON, diffusionDecayRateDivisor);
  const neighborDivisor = Number.isFinite(diffusionNeighborDivisor)
    ? Math.max(1, diffusionNeighborDivisor)
    : 1;
  target[0] = getSafeInverseDiffusionRate(diffusionRateTrails);
  target[1] = decayRateTrails / decayDivisor;
  target[2] = 1 / neighborDivisor;
  // target[3] is WGSL 16-byte alignment padding — never read by the shader.
};

export class DiffusionPipeline {
  private static readonly WORKGROUP_SIZE = 16;
  private static readonly UNIFORM_COUNT = 4;

  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly pipeline: GPUComputePipeline;
  private readonly uniforms: GPUBuffer;
  // 1x1 zero texture used as the depositMap binding when callers don't supply
  // one (e.g. source-map diffusion). WebGPU's textureLoad returns zero for
  // out-of-bounds coordinates, so the diffusion shader sums in zeros.
  private readonly emptyDepositTexture: GPUTexture;
  private readonly emptyDepositTextureView: GPUTextureView;
  private readonly uniformValues = new Float32Array(DiffusionPipeline.UNIFORM_COUNT);
  private readonly uniformCache = createCachedBufferWrite(
    DiffusionPipeline.UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT
  );
  private readonly getBindGroup = createBindGroupCache<
    [GPUTextureView, GPUTextureView, GPUTextureView]
  >((trailMapIn, trailMapOut, depositMap) =>
    this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: trailMapIn },
        { binding: 2, resource: trailMapOut },
        { binding: 3, resource: depositMap },
      ],
    })
  );

  public constructor(private readonly device: GPUDevice) {
    this.bindGroupLayout = device.createBindGroupLayout(
      DiffusionPipeline.bindGroupLayout
    );

    this.pipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      compute: {
        module: smartCompile(device, this.shaderCode),
        entryPoint: 'main',
      },
    });

    this.uniforms = this.device.createBuffer({
      size: DiffusionPipeline.UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.emptyDepositTexture = device.createTexture({
      format: TRAIL_SOURCE_TEXTURE_FORMAT,
      size: { width: 1, height: 1 },
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.emptyDepositTextureView = this.emptyDepositTexture.createView();
    const clearEncoder = device.createCommandEncoder();
    const clearPass = clearEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.emptyDepositTextureView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    clearPass.end();
    device.queue.submit([clearEncoder.finish()]);
  }

  public setParameters({
    diffusionRateTrails,
    decayRateTrails,
    diffusionDecayRateDivisor,
    diffusionNeighborDivisor,
  }: DiffusionSettings) {
    setDiffusionUniformValues(this.uniformValues, {
      diffusionRateTrails,
      decayRateTrails,
      diffusionDecayRateDivisor,
      diffusionNeighborDivisor,
    });
    writeBufferIfChanged(
      this.device,
      this.uniforms,
      this.uniformValues,
      this.uniformCache
    );
  }

  public execute(
    commandEncoder: GPUCommandEncoder,
    trailMapIn: GPUTextureView,
    trailMapOut: GPUTextureView,
    size: vec2,
    depositMap: GPUTextureView | null,
    timestampWrites?: GPUComputePassTimestampWrites
  ) {
    const bindGroup = this.getBindGroup(
      trailMapIn,
      trailMapOut,
      depositMap ?? this.emptyDepositTextureView
    );

    const passEncoder = commandEncoder.beginComputePass(
      timestampWrites ? { timestampWrites } : undefined
    );
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(
      Math.ceil(size[0] / DiffusionPipeline.WORKGROUP_SIZE),
      Math.ceil(size[1] / DiffusionPipeline.WORKGROUP_SIZE)
    );
    passEncoder.end();
  }

  public destroy() {
    this.uniforms.destroy();
    this.emptyDepositTexture.destroy();
  }

  private static get bindGroupLayout(): GPUBindGroupLayoutDescriptor {
    return {
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: 'uniform',
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          texture: {
            sampleType: 'float',
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: 'write-only',
            format: TRAIL_SOURCE_TEXTURE_FORMAT,
          },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          texture: {
            sampleType: 'float',
          },
        },
      ],
    };
  }

  private get shaderCode(): string {
    return shader.replaceAll(
      '__WORKGROUP_SIZE__',
      DiffusionPipeline.WORKGROUP_SIZE.toString()
    );
  }
}
