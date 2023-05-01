import { setUpFullScreenQuad } from '../../utils/graphics/full-screen-quad/full-screen-quad';
import { smartCompile } from '../../utils/graphics/smart-compile';
import { CommonState } from '../common-state/common-state';
import shader from './diffuse.wgsl';
import { DiffusionSettings } from './diffusion-settings';

export class DiffusionPipeline {
  private static readonly UNIFORM_COUNT = 4;

  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniforms: GPUBuffer;
  private readonly vertexBuffer: GPUBuffer;
  private readonly noise: GPUTextureView;

  private bindGroup?: GPUBindGroup;
  private previousTrailMapIn?: GPUTextureView;

  public constructor(
    private readonly device: GPUDevice,
    private readonly commonState: CommonState
  ) {
    this.bindGroupLayout = device.createBindGroupLayout(
      DiffusionPipeline.bindGroupLayout
    );

    const { buffer, vertex } = setUpFullScreenQuad(device);
    this.vertexBuffer = buffer;

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [commonState.bindGroupLayout, this.bindGroupLayout],
      }),
      vertex,
      fragment: {
        module: smartCompile(device, CommonState.shaderCode, shader),
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
    diffusionRateTrails,
    decayRateTrails,
    diffusionRateBrush,
    decayRateBrush,
  }: DiffusionSettings) {
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([
        diffusionRateTrails,
        decayRateTrails,
        diffusionRateBrush,
        decayRateBrush,
      ])
    );
  }

  public execute(
    commandEncoder: GPUCommandEncoder,
    trailMapIn: GPUTextureView,
    trailMapOut: GPUTextureView
  ) {
    this.ensureBindGroupExists(trailMapIn);

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: trailMapOut,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    this.commonState.execute(passEncoder);
    passEncoder.setBindGroup(1, this.bindGroup);
    passEncoder.draw(4, 1);
    passEncoder.end();
  }

  private ensureBindGroupExists(trailMapIn: GPUTextureView) {
    if (this.previousTrailMapIn !== trailMapIn) {
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
            resource: trailMapIn,
          },
        ],
      });

      this.previousTrailMapIn = trailMapIn;
    }
  }

  public destroy() {
    this.vertexBuffer.destroy();
    this.uniforms.destroy();
  }

  private static get bindGroupLayout(): GPUBindGroupLayoutDescriptor {
    return {
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: {
            type: 'uniform',
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {
            type: 'filtering',
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'float',
          },
        },
      ],
    };
  }
}
