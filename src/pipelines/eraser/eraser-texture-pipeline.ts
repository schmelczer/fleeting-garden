import { vec2 } from 'gl-matrix';

import {
  createCachedBufferWrite,
  writeBufferIfChanged,
} from '../../utils/graphics/cached-buffer-write';
import { smartCompile } from '../../utils/graphics/smart-compile';
import { CommonState } from '../common-state/common-state';
import {
  LINE_SEGMENT_VERTEX_BUFFER_LAYOUT,
  LINE_SEGMENT_VERTICES,
  LineSegmentBuffer,
} from '../common/line-segment-buffer';
import lineSegmentShader from '../common/line-segment.wgsl?raw';
import {
  ERASER_MASK_TEXTURE_FORMAT,
  TRAIL_SOURCE_TEXTURE_FORMAT,
} from '../texture-formats';
import shader from './eraser-texture.wgsl?raw';

interface EraserTextureParameters {
  eraserSize: number;
  eraserLineDistanceEpsilon: number;
  eraserClearRed: number;
  eraserClearGreen: number;
  eraserClearBlue: number;
  eraserClearAlpha: number;
}

const UNIFORM_COUNT = 8;
const MAX_ERASER_TEXTURE_LINE_COUNT = 384;
const TARGET_FORMATS: Array<GPUTextureFormat> = [
  ERASER_MASK_TEXTURE_FORMAT,
  TRAIL_SOURCE_TEXTURE_FORMAT,
  TRAIL_SOURCE_TEXTURE_FORMAT,
];

export class EraserTexturePipeline {
  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly bindGroup: GPUBindGroup;
  private readonly combinedPipeline: GPURenderPipeline;
  private readonly uniforms: GPUBuffer;
  private readonly uniformValues = new Float32Array(UNIFORM_COUNT);
  private readonly uniformCache = createCachedBufferWrite(
    UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT
  );
  private readonly segments: LineSegmentBuffer;

  public constructor(
    private readonly device: GPUDevice,
    private readonly commonState: CommonState
  ) {
    this.segments = new LineSegmentBuffer(device, MAX_ERASER_TEXTURE_LINE_COUNT);

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    });

    const shaderModule = smartCompile(
      device,
      CommonState.shaderCode,
      lineSegmentShader,
      shader
    );
    this.combinedPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.commonState.bindGroupLayout, this.bindGroupLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vertex',
        buffers: [LINE_SEGMENT_VERTEX_BUFFER_LAYOUT],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentCombined',
        targets: TARGET_FORMATS.map((format) => ({ format })),
      },
      primitive: { topology: 'triangle-list' },
    });

    this.uniforms = device.createBuffer({
      size: UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniforms } }],
    });
  }

  public addSwipeSegment(from: vec2, to: vec2): void {
    this.segments.add(from, to);
  }

  public clearSwipes(): void {
    this.segments.clear();
  }

  public setParameters({
    eraserSize,
    eraserLineDistanceEpsilon,
    eraserClearRed,
    eraserClearGreen,
    eraserClearBlue,
    eraserClearAlpha,
  }: EraserTextureParameters): void {
    const eraserRadius = eraserSize / 2;

    this.uniformValues[0] = eraserRadius * eraserRadius;
    this.uniformValues[1] = eraserLineDistanceEpsilon;
    this.uniformValues[2] = eraserClearRed;
    this.uniformValues[3] = eraserClearGreen;
    this.uniformValues[4] = eraserClearBlue;
    this.uniformValues[5] = eraserClearAlpha;
    this.uniformValues[6] = eraserRadius;
    writeBufferIfChanged(
      this.device,
      this.uniforms,
      this.uniformValues,
      this.uniformCache
    );

    this.segments.flush();
  }

  public executeCombined(
    commandEncoder: GPUCommandEncoder,
    eraserMaskOut: GPUTextureView,
    sourceMapOut: GPUTextureView,
    trailMapOut: GPUTextureView,
    timestampWrites?: GPURenderPassTimestampWrites
  ): void {
    const lineCount = this.segments.activeCount;
    if (lineCount === 0) {
      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: eraserMaskOut,
            clearValue: { r: 1, g: 1, b: 1, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        timestampWrites,
      });
      passEncoder.end();
      return;
    }

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: eraserMaskOut,
          clearValue: { r: 1, g: 1, b: 1, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
        { view: sourceMapOut, loadOp: 'load', storeOp: 'store' },
        { view: trailMapOut, loadOp: 'load', storeOp: 'store' },
      ],
      timestampWrites,
    });
    passEncoder.setPipeline(this.combinedPipeline);
    this.commonState.execute(passEncoder);
    passEncoder.setBindGroup(1, this.bindGroup);
    passEncoder.setVertexBuffer(0, this.segments.vertexBuffer);
    passEncoder.draw(LINE_SEGMENT_VERTICES, lineCount);
    passEncoder.end();
  }

  public destroy(): void {
    this.segments.destroy();
    this.uniforms.destroy();
  }
}
