import { clamp } from '../../utils/clamp';
import { smartCompile } from '../../utils/graphics/smart-compile';
import { last } from '../../utils/last';
import { CommonState } from '../common-state/common-state';
import { BrushSettings } from './brush-settings';
import shader from './brush.wgsl';

import { vec2 } from 'gl-matrix';

export class BrushPipeline {
  private static readonly UNIFORM_COUNT = 2;
  private static readonly MAX_LINE_COUNT = 20;
  private static readonly VERTICES_PER_LINE_SEGMENT = 6;
  private static readonly ATTRIBUTES_PER_LINE_SEGMENT = 6;

  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly bindGroup: GPUBindGroup;
  private readonly pipeline: GPURenderPipeline;
  private readonly uniforms: GPUBuffer;
  private readonly vertexBuffer: GPUBuffer;

  private linePoints: Array<vec2> = [];
  private actualPoints: Array<vec2> = [];

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
    this.linePoints.push(position);
  }

  public clearSwipes() {
    this.linePoints.length = 0;
  }

  public setParameters({ brushWidth, brushWidthRandomness }: BrushSettings) {
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([brushWidth / 2, (brushWidth / 2) * brushWidthRandomness])
    );

    this.actualPoints = this.linePoints.slice();
    this.linePoints.splice(0, this.linePoints.length - 1);

    if (this.actualPoints.length === 0) {
      return;
    }

    if (this.actualPoints.length === 1) {
      this.actualPoints.push(this.actualPoints[0]); // allow single point swipes
    }

    if (this.actualPoints.length > BrushPipeline.MAX_LINE_COUNT + 1) {
      this.actualPoints = BrushPipeline.subsampleLinePoints(this.actualPoints);
    }

    this.device.queue.writeBuffer(
      this.vertexBuffer,
      0,
      new Float32Array(
        new Array(this.lineCount).fill(0).flatMap((_, i) => {
          const from = this.actualPoints[i];
          const to = this.actualPoints[i + 1];
          const [a, b, c, d] = this.getSegmentBoundingBox(from, to, brushWidth / 2);
          return [a, b, c, b, c, d].flatMap((v) => [...v, ...from, ...to]);
        })
      )
    );
  }

  private static subsampleLinePoints(points: Array<vec2>): Array<vec2> {
    const lines = [];
    for (let i = 0; i < points.length - 2; i++) {
      lines.push({
        from: points[i],
        to: points[i + 1],
        length: vec2.dist(points[i], points[i + 1]),
      });
    }

    const sumLength = lines.reduce((sum, line) => sum + line.length, 0);

    let currentLineIndex = 0;
    let lineLengthSoFar = 0;
    const result: Array<vec2> = [points[0]];
    for (let i = 1; i < BrushPipeline.MAX_LINE_COUNT; i++) {
      const t = (i * sumLength) / (BrushPipeline.MAX_LINE_COUNT + 1);
      while (lineLengthSoFar + lines[currentLineIndex].length < t) {
        lineLengthSoFar += lines[currentLineIndex].length;
        currentLineIndex++;
      }

      const line = lines[currentLineIndex];
      const position = vec2.lerp(
        vec2.create(),
        line.from,
        line.to,
        (t - lineLengthSoFar) / line.length
      );

      result.push(position);
    }

    result.push(last(points));

    return result;
  }

  private getSegmentBoundingBox(from: vec2, to: vec2, width: number): Array<vec2> {
    let dir = vec2.sub(vec2.create(), to, from);
    vec2.normalize(dir, dir);

    if (vec2.len(dir) === 0) {
      dir = vec2.fromValues(1, 0); // allow single point swipes
    }

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

  private get lineCount() {
    return clamp(this.actualPoints.length - 1, 0, BrushPipeline.MAX_LINE_COUNT);
  }
}
