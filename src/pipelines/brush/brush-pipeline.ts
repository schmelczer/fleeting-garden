import { vec2 } from 'gl-matrix';

import { getRenderQualityBrushSize } from '../../config/brush-size';
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
import { TRAIL_SOURCE_TEXTURE_FORMAT } from '../texture-formats';
import shader from './brush.wgsl?raw';

export interface BrushSettings {
  brushSize: number;
  brushAlpha: number;
  brushDiscardThreshold: number;
  brushGrainNoiseScale: number;
  brushGrainNoiseOffsetX: number;
  brushGrainNoiseOffsetY: number;
  brushGrainMinStrength: number;
  brushGrainMaxStrength: number;
}

interface BrushParameters extends BrushSettings {
  internalRenderAreaMegapixels: number;
  pixelRatio?: number;
  selectedColorIndex: number;
}

export const getSafePixelRatio = (pixelRatio: number | undefined): number =>
  typeof pixelRatio === 'number' && Number.isFinite(pixelRatio) && pixelRatio > 0
    ? pixelRatio
    : 1;

const UNIFORM_COUNT = 16;
const MAX_BRUSH_LINE_COUNT = 240;

const setBrushUniformValues = (
  target: Float32Array,
  {
    brushSize,
    brushAlpha,
    brushDiscardThreshold,
    brushGrainNoiseScale,
    brushGrainNoiseOffsetX,
    brushGrainNoiseOffsetY,
    brushGrainMinStrength,
    brushGrainMaxStrength,
    internalRenderAreaMegapixels,
    selectedColorIndex,
    pixelRatio,
  }: BrushParameters
): void => {
  const safePixelRatio = getSafePixelRatio(pixelRatio);
  const brushRadius =
    (getRenderQualityBrushSize(brushSize, internalRenderAreaMegapixels) *
      safePixelRatio) /
    2;

  target[0] = brushRadius;
  target[1] = brushRadius * brushRadius;
  // target[2], target[3] are WGSL alignment padding for brushValue:vec4 — never read by the shader.
  target[4] = selectedColorIndex === 0 ? 1 : 0;
  target[5] = selectedColorIndex === 1 ? 1 : 0;
  target[6] = selectedColorIndex === 2 ? 1 : 0;
  target[7] = brushAlpha;
  target[8] = 1 / Math.max(Number.EPSILON, brushGrainNoiseScale * safePixelRatio);
  target[9] = brushGrainNoiseOffsetX;
  target[10] = brushGrainNoiseOffsetY;
  target[11] = brushDiscardThreshold;
  target[12] = brushGrainMinStrength;
  target[13] = brushGrainMaxStrength;
};

export class BrushPipeline {
  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly bindGroup: GPUBindGroup;
  private readonly renderPipeline: GPURenderPipeline;
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
    this.segments = new LineSegmentBuffer(device, MAX_BRUSH_LINE_COUNT);

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
    this.renderPipeline = device.createRenderPipeline({
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
        entryPoint: 'fragment',
        targets: [
          {
            format: TRAIL_SOURCE_TEXTURE_FORMAT,
            blend: {
              color: { operation: 'max', srcFactor: 'one', dstFactor: 'one' },
              alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' },
            },
          },
        ],
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

  public setParameters(parameters: BrushParameters): void {
    setBrushUniformValues(this.uniformValues, parameters);
    writeBufferIfChanged(
      this.device,
      this.uniforms,
      this.uniformValues,
      this.uniformCache
    );
    this.segments.flush();
  }

  public executeSource(
    commandEncoder: GPUCommandEncoder,
    sourceMapOut: GPUTextureView,
    timestampWrites?: GPURenderPassTimestampWrites
  ): boolean {
    const lineCount = this.segments.activeCount;
    if (lineCount === 0) {
      return false;
    }

    recordBrushPassForE2e();
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: sourceMapOut, loadOp: 'load', storeOp: 'store' }],
      timestampWrites,
    });
    passEncoder.setPipeline(this.renderPipeline);
    this.commonState.execute(passEncoder);
    passEncoder.setBindGroup(1, this.bindGroup);
    passEncoder.setVertexBuffer(0, this.segments.vertexBuffer);
    passEncoder.draw(LINE_SEGMENT_VERTICES, lineCount);
    passEncoder.end();
    return true;
  }

  public destroy(): void {
    this.segments.destroy();
    this.uniforms.destroy();
  }
}

const recordBrushPassForE2e = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const state = window as Window & { __fleetingGardenBrushPasses?: number };
  state.__fleetingGardenBrushPasses = (state.__fleetingGardenBrushPasses ?? 0) + 1;
};
