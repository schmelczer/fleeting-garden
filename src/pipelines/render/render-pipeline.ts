import { setUpFullScreenQuad } from '../../utils/graphics/full-screen-quad/full-screen-quad';
import { smartCompile } from '../../utils/graphics/smart-compile';
import { CommonState } from '../common-state/common-state';
import { RenderSettings } from './render-settings';
import shader from './render.wgsl';

import { vec3 } from 'gl-matrix';

export class RenderPipeline {
  private static readonly UNIFORM_COUNT = 13;

  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniforms: GPUBuffer;
  private readonly vertexBuffer: GPUBuffer;

  private bindGroup?: GPUBindGroup;
  private previousColorTexture?: GPUTextureView;

  public constructor(
    private readonly context: GPUCanvasContext,
    private readonly device: GPUDevice,
    private readonly commonState: CommonState
  ) {
    this.bindGroupLayout = device.createBindGroupLayout(RenderPipeline.bindGroupLayout);

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
            format: navigator.gpu.getPreferredCanvasFormat(),
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
    brushColor,
    evenGenerationColor,
    oddGenerationColor,
    clarity,
  }: RenderSettings & {
    brushColor: vec3;
    evenGenerationColor: vec3;
    oddGenerationColor: vec3;
  }) {
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([
        ...brushColor,
        0, //padding
        ...evenGenerationColor,
        0, //padding
        ...oddGenerationColor,
        clarity,
      ])
    );
  }

  public execute(commandEncoder: GPUCommandEncoder, colorTexture: GPUTextureView) {
    this.ensureBindGroupExists(colorTexture);

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 1, b: 1, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    this.commonState.execute(passEncoder);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.setBindGroup(1, this.bindGroup);
    passEncoder.draw(4, 1);
    passEncoder.end();
  }

  private ensureBindGroupExists(colorTexture: GPUTextureView) {
    if (this.previousColorTexture !== colorTexture) {
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
            resource: colorTexture,
          },
        ],
      });

      this.previousColorTexture = colorTexture;
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
