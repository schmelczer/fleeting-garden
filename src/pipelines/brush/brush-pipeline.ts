import { catmullRomInterpolation } from '../../utils/catmull-rom-interpolation';
import { generateFbmNoise } from '../../utils/graphics/fbm-noise/fbm-noise';
import { smartCompile } from '../../utils/graphics/smart-compile';
import { CommonState } from '../common-state/common-state';
import { BrushSettings } from './brush-settings';
import shader from './brush.wgsl';

import { vec2 } from 'gl-matrix';

export class BrushPipeline {
  private static readonly UNIFORM_COUNT = 2;
  private static readonly MAX_LINE_COUNT = 100;
  private static readonly VERTICES_PER_LINE_SEGMENT = 6;
  private static readonly ATTRIBUTES_PER_LINE_SEGMENT = 6;

  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly bindGroup: GPUBindGroup;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniforms: GPUBuffer;
  private readonly vertexBuffer: GPUBuffer;

  private linePoints: Array<vec2> = [];
  private previousPoints: Array<vec2> = [];
  private nextPoint: vec2 | null = null;

  public constructor(
    private readonly device: GPUDevice,
    private readonly commonState: CommonState
  ) {
    this.bindGroupLayout = device.createBindGroupLayout(BrushPipeline.bindGroupLayout);

    this.vertexBuffer = device.createBuffer({
      size:
        BrushPipeline.MAX_LINE_COUNT *
        BrushPipeline.VERTICES_PER_LINE_SEGMENT *
        BrushPipeline.ATTRIBUTES_PER_LINE_SEGMENT *
        Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [commonState.bindGroupLayout, this.bindGroupLayout],
      }),
      vertex: {
        module: smartCompile(device, CommonState.shaderCode, shader),
        entryPoint: 'vertex',
        buffers: [
          {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 6,
            attributes: [
              {
                shaderLocation: 0,
                format: 'float32x2',
                offset: 0,
              },
              {
                shaderLocation: 1,
                format: 'float32x2',
                offset: Float32Array.BYTES_PER_ELEMENT * 2,
              },
              {
                shaderLocation: 2,
                format: 'float32x2',
                offset: Float32Array.BYTES_PER_ELEMENT * 4,
              },
            ],
          },
        ],
      },
      fragment: {
        module: smartCompile(device, CommonState.shaderCode, shader),
        entryPoint: 'fragment',
        targets: [
          {
            format: 'rgba16float',
            blend: {
              color: {
                operation: 'add',
                srcFactor: 'zero',
                dstFactor: 'one',
              },
              alpha: {
                operation: 'max',
                srcFactor: 'one',
                dstFactor: 'one',
              },
            },
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    this.uniforms = this.device.createBuffer({
      size: BrushPipeline.UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.uniforms,
          },
        },
      ],
    });
  }

  public addSwipe(position: vec2) {
    this.nextPoint = position;
    // this.linePoints.push(position);
  }

  public clearSwipes() {
    this.linePoints.length = 0;
    this.previousPoints.length = 0;
    this.nextPoint = null;
  }

  public setParameters({ brushWidth, brushWidthRandomness }: BrushSettings) {
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([brushWidth / 2, brushWidthRandomness])
    );

    if (this.nextPoint == null) {
      return;
    }
    this.previousPoints.push(this.nextPoint);
    if (this.previousPoints.length < 3) {
      return;
    }

    this.linePoints = [];
    for (let t = 0; t < 1; t += 1 / BrushPipeline.MAX_LINE_COUNT) {
      this.linePoints.push(
        catmullRomInterpolation(
          this.previousPoints[0],
          this.previousPoints[1],
          this.previousPoints[2],
          this.nextPoint,
          t
        )
      );
    }

    this.previousPoints.splice(0, this.previousPoints.length - 3);

    this.device.queue.writeBuffer(
      this.vertexBuffer,
      0,
      new Float32Array(
        new Array(this.lineCount).fill(0).flatMap((_, i) => {
          const from = this.linePoints[i];
          const to = this.linePoints[i + 1];
          const [a, b, c, d] = this.getSegmentBoundingBox(from, to, brushWidth / 2);
          return [a, b, c, b, c, d].flatMap((v) => [...v, ...from, ...to]);
        })
      )
    );
  }

  private get lineCount() {
    return Math.max(0, this.linePoints.length - 1);
  }

  private getSegmentBoundingBox(from: vec2, to: vec2, width: number): Array<vec2> {
    const dir = vec2.sub(vec2.create(), to, from);
    vec2.normalize(dir, dir);

    const perp = vec2.fromValues(dir[1], -dir[0]);

    vec2.scale(dir, dir, width);
    vec2.scale(perp, perp, width);

    const offsetStart = vec2.sub(vec2.create(), from, dir);
    const offsetEnd = vec2.add(vec2.create(), to, dir);

    return [
      vec2.add(vec2.create(), offsetStart, perp),
      vec2.sub(vec2.create(), offsetStart, perp),
      vec2.add(vec2.create(), offsetEnd, perp),
      vec2.sub(vec2.create(), offsetEnd, perp),
    ];
  }

  public execute(commandEncoder: GPUCommandEncoder, trailMapOut: GPUTextureView) {
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: trailMapOut,
          loadOp: 'load',
          storeOp: 'store',
        },
      ],
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    this.commonState.execute(passEncoder);
    passEncoder.setBindGroup(1, this.bindGroup);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.draw(BrushPipeline.VERTICES_PER_LINE_SEGMENT * this.lineCount, 1);
    passEncoder.end();

    this.linePoints.splice(0, this.linePoints.length - 1);
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
      ],
    };
  }
}
