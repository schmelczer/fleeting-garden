import { vec2 } from 'gl-matrix';

import { smartCompile } from '../../utils/graphics/smart-compile';
import shader from './copy.wgsl?raw';

export class CopyPipeline {
  private static readonly UNIFORM_COUNT = 2;

  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniforms: GPUBuffer;

  private readonly vertexBuffer: GPUBuffer;

  private bindGroup?: GPUBindGroup;
  private previousTrailMapIn?: GPUTextureView;

  public constructor(private readonly device: GPUDevice) {
    this.bindGroupLayout = device.createBindGroupLayout(CopyPipeline.bindGroupLayout);

    this.uniforms = this.device.createBuffer({
      size: CopyPipeline.UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.vertexBuffer = device.createBuffer({
      size: 2 * 4 * Float32Array.BYTES_PER_ELEMENT, // 4 x vec2<f32>
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    // prettier-ignore
    const vertexData = [
    // U    V
      0.0, 1.0,
      1.0, 1.0,
      0.0, 0.0,
      1.0, 0.0,
    ];
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertexData);
    this.vertexBuffer.unmap();

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      vertex: {
        module: smartCompile(device, shader),
        entryPoint: 'vertex',
        buffers: [
          {
            arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT,
            stepMode: 'vertex',
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x2',
              },
            ],
          },
        ],
      },
      fragment: {
        module: smartCompile(device, shader),
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
  }

  public execute(
    commandEncoder: GPUCommandEncoder,
    trailMapIn: GPUTextureView,
    trailMapOut: GPUTextureView,
    scale: vec2 = vec2.fromValues(1, 1)
  ) {
    this.device.queue.writeBuffer(this.uniforms, 0, new Float32Array(scale));

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: trailMapOut,
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };

    this.ensureBindGroupExists(trailMapIn);
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.draw(4, 1);
    passEncoder.end();
  }

  public destroy() {
    this.vertexBuffer.destroy();
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

  private static get bindGroupLayout(): GPUBindGroupLayoutDescriptor {
    return {
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
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
