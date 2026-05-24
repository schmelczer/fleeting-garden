import { vec2 } from 'gl-matrix';

import { createBindGroupCache } from '../../utils/graphics/bind-group-cache';
import {
  createCachedBufferWrite,
  writeBufferIfChanged,
} from '../../utils/graphics/cached-buffer-write';
import { smartCompile } from '../../utils/graphics/smart-compile';
import {
  dispatchAgentWorkgroups,
  getAgentWorkgroupSize,
  substituteAgentWorkgroupSize,
} from '../agents/agent-dispatch';
import agentSchema from '../agents/agent-generation/agent-schema.wgsl?raw';
import shader from './eraser-agent.wgsl?raw';

interface Bounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

export class EraserAgentPipeline {
  private static readonly UNIFORM_COUNT = 8;

  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly pipeline: GPUComputePipeline;
  private readonly uniforms: GPUBuffer;
  private readonly uniformValues = new Float32Array(EraserAgentPipeline.UNIFORM_COUNT);
  private readonly uniformUintValues = new Uint32Array(this.uniformValues.buffer);
  private readonly uniformCache = createCachedBufferWrite(
    EraserAgentPipeline.UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT
  );
  private readonly bindGroupCache = createBindGroupCache<[GPUBuffer, GPUTextureView]>(
    (agentsBuffer, eraserMask) =>
      this.device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniforms } },
          { binding: 1, resource: { buffer: agentsBuffer } },
          { binding: 2, resource: eraserMask },
        ],
      })
  );

  private pendingSegmentCount = 0;
  private activeSegmentCount = 0;
  private pendingBounds: Bounds | null = null;
  private agentCount = 0;
  private readonly workgroupSize: number;

  public constructor(
    private readonly device: GPUDevice,
    private readonly getAgentsBuffer: () => GPUBuffer
  ) {
    const emptyBindGroupLayout = device.createBindGroupLayout({ entries: [] });
    this.bindGroupLayout = device.createBindGroupLayout({
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
          buffer: {
            type: 'storage',
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          texture: {
            sampleType: 'float',
          },
        },
      ],
    });

    this.uniforms = this.device.createBuffer({
      size: EraserAgentPipeline.UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.workgroupSize = getAgentWorkgroupSize(device, 'eraser');
    this.pipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [emptyBindGroupLayout, this.bindGroupLayout],
      }),
      compute: {
        module: smartCompile(
          device,
          substituteAgentWorkgroupSize(device, agentSchema, 'eraser'),
          shader
        ),
        entryPoint: 'main',
      },
    });
  }

  public addSwipeSegment(from: vec2, to: vec2): void {
    this.pendingSegmentCount += 1;
    this.pendingBounds = includeSegment(this.pendingBounds, from, to);
  }

  public clearSwipes(): void {
    this.pendingSegmentCount = 0;
    this.activeSegmentCount = 0;
    this.pendingBounds = null;
  }

  public setParameters({
    agentCount,
    eraserMaskAlphaThreshold,
    eraserSize,
    maskSize,
  }: {
    agentCount: number;
    eraserMaskAlphaThreshold: number;
    eraserSize: number;
    maskSize: vec2;
  }): void {
    this.agentCount = agentCount;
    this.activeSegmentCount = this.pendingSegmentCount;
    const activeBounds = expandBoundsToMask(this.pendingBounds, eraserSize / 2, maskSize);
    this.pendingSegmentCount = 0;
    this.pendingBounds = null;

    this.uniformUintValues[0] = Math.max(0, Math.floor(agentCount));
    this.uniformValues[1] = eraserMaskAlphaThreshold;
    this.uniformUintValues[2] = Math.max(0, Math.floor(maskSize[0]));
    this.uniformUintValues[3] = Math.max(0, Math.floor(maskSize[1]));
    this.uniformValues[4] = activeBounds.minX;
    this.uniformValues[5] = activeBounds.minY;
    this.uniformValues[6] = activeBounds.maxX;
    this.uniformValues[7] = activeBounds.maxY;
    writeBufferIfChanged(
      this.device,
      this.uniforms,
      this.uniformValues,
      this.uniformCache
    );
  }

  public hasActiveMask(): boolean {
    return this.activeSegmentCount > 0;
  }

  public execute(
    commandEncoder: GPUCommandEncoder,
    eraserMask: GPUTextureView,
    timestampWrites?: GPUComputePassTimestampWrites
  ): void {
    if (!this.hasActiveMask() || this.agentCount === 0) {
      return;
    }

    const passEncoder = commandEncoder.beginComputePass(
      timestampWrites ? { timestampWrites } : undefined
    );
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(1, this.bindGroupCache(this.getAgentsBuffer(), eraserMask));
    dispatchAgentWorkgroups(passEncoder, this.workgroupSize, this.agentCount);
    passEncoder.end();
  }

  public destroy(): void {
    this.uniforms.destroy();
  }
}

const includeSegment = (bounds: Bounds | null, from: vec2, to: vec2): Bounds => {
  const minX = Math.min(from[0], to[0]);
  const minY = Math.min(from[1], to[1]);
  const maxX = Math.max(from[0], to[0]);
  const maxY = Math.max(from[1], to[1]);
  if (!bounds) {
    return { maxX, maxY, minX, minY };
  }
  return {
    maxX: Math.max(bounds.maxX, maxX),
    maxY: Math.max(bounds.maxY, maxY),
    minX: Math.min(bounds.minX, minX),
    minY: Math.min(bounds.minY, minY),
  };
};

const expandBoundsToMask = (
  bounds: Bounds | null,
  radius: number,
  maskSize: vec2
): Bounds => {
  const maxX = Math.max(0, maskSize[0] - 1);
  const maxY = Math.max(0, maskSize[1] - 1);
  if (!bounds) {
    return { maxX, maxY, minX: 0, minY: 0 };
  }
  return {
    maxX: Math.min(maxX, bounds.maxX + radius),
    maxY: Math.min(maxY, bounds.maxY + radius),
    minX: Math.max(0, bounds.minX - radius),
    minY: Math.max(0, bounds.minY - radius),
  };
};
