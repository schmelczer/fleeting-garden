import { CommonParameters } from '../common-parameters';
import { BrushSettings } from './brush-settings';
import shader from './brush.wgsl';

import { vec2 } from 'gl-matrix';

export class BrushPipeline {
  private static readonly UNIFORM_COUNT = 4;
  private static readonly MAX_LINE_COUNT = 100;
  private static readonly VERTICES_PER_LINE_SEGMENT = 6;

  private readonly pipeline: GPURenderPipeline;
  private readonly uniforms: GPUBuffer;
  private readonly vertexBuffer: GPUBuffer;
  private readonly linePoints: Array<vec2> = [];
  private bindGroup: GPUBindGroup;

  public constructor(private readonly device: GPUDevice) {
    this.vertexBuffer = device.createBuffer({
      size:
        BrushPipeline.MAX_LINE_COUNT *
        BrushPipeline.VERTICES_PER_LINE_SEGMENT *
        2 *
        Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({
          code: shader,
        }),
        entryPoint: 'vertex',
        buffers: [
          {
            arrayStride: Float32Array.BYTES_PER_ELEMENT * 2,
            attributes: [
              {
                shaderLocation: 0,
                format: 'float32x2',
                offset: 0,
              },
            ],
          },
        ],
      },
      fragment: {
        module: device.createShaderModule({
          code: shader,
        }),
        entryPoint: 'fragment',
        targets: [
          {
            format: 'rgba16float',
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

    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
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

  public setParameters({
    canvasSize,
    deltaTime,
    time,
  }: CommonParameters & BrushSettings) {
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([canvasSize[0], canvasSize[1], deltaTime, time])
    );

    this.device.queue.writeBuffer(
      this.vertexBuffer,
      0,
      new Float32Array(
        new Array(this.lineCount).fill(0).flatMap((_, i) => {
          const from = this.linePoints[i];
          const to = this.linePoints[i + 1];
          const [a, b, c, d] = this.lineToRectangle(from, to, 0.01);
          return [...a, ...b, ...c, ...b, ...c, ...d];
        })
      )
    );
  }

  private get lineCount() {
    return Math.max(0, this.linePoints.length - 1);
  }

  private lineToRectangle(from: vec2, to: vec2, width: number): [vec2, vec2, vec2, vec2] {
    const dir = vec2.sub(vec2.create(), to, from);
    const perp = vec2.fromValues(dir[1], -dir[0]);
    vec2.normalize(perp, perp);
    vec2.scale(perp, perp, width / 2);
    return [
      vec2.add(vec2.create(), from, perp),
      vec2.sub(vec2.create(), from, perp),
      vec2.add(vec2.create(), to, perp),
      vec2.sub(vec2.create(), to, perp),
    ];
  }

  public execute(commandEncoder: GPUCommandEncoder, trailMapOut: GPUTexture) {
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: trailMapOut.createView(),
          clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
          loadOp: 'load',
          storeOp: 'store',
        },
      ],
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.draw(this.lineCount * BrushPipeline.VERTICES_PER_LINE_SEGMENT, 1);
    passEncoder.end();

    this.linePoints.splice(0, this.linePoints.length - 1); // clear the array
  }
}
