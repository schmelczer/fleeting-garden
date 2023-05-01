import { setUpFullScreenQuad } from '../../utils/graphics/full-screen-quad/full-screen-quad';
import { smartCompile } from '../../utils/graphics/smart-compile';

export class CopyPipeline {
  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly pipeline: GPURenderPipeline;
  private readonly quadVertexBuffer: GPUBuffer;

  private bindGroup?: GPUBindGroup;
  private previousTrailMapIn?: GPUTextureView;

  public constructor(private readonly device: GPUDevice) {
    this.bindGroupLayout = device.createBindGroupLayout(CopyPipeline.bindGroupLayout);

    const { buffer, vertex } = setUpFullScreenQuad(device);
    this.quadVertexBuffer = buffer;

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      vertex,
      fragment: {
        module: smartCompile(
          device,
          /* wgsl */ `
          @group(0) @binding(0) var Sampler: sampler;
          @group(0) @binding(1) var original: texture_2d<f32>;

          @fragment
          fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
              return textureSample(original, Sampler, uv);
          }`
        ),
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
    trailMapOut: GPUTextureView
  ) {
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
    passEncoder.setVertexBuffer(0, this.quadVertexBuffer);
    passEncoder.draw(4, 1);
    passEncoder.end();
  }

  public destroy() {
    this.quadVertexBuffer.destroy();
  }

  private ensureBindGroupExists(trailMapIn: GPUTextureView) {
    if (this.previousTrailMapIn !== trailMapIn) {
      this.bindGroup = this.device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: this.device.createSampler({
              magFilter: 'linear',
              minFilter: 'linear',
            }),
          },
          {
            binding: 1,
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
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {
            type: 'filtering',
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'float',
          },
        },
      ],
    };
  }
}
