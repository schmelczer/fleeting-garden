import { vec2 } from 'gl-matrix';

import { createBindGroupCache } from '../../../utils/graphics/bind-group-cache';
import { smartCompile } from '../../../utils/graphics/smart-compile';
import {
  dispatchAgentWorkgroups,
  getAgentWorkgroupSize,
  substituteAgentWorkgroupSize,
} from '../agent-dispatch';
import { AGENT_SIZE_IN_BYTES, getMaxSupportedAgentCount } from '../agent-limits';
import compactionShader from './agent-compaction.wgsl?raw';
import resizeShader from './agent-resize.wgsl?raw';
import agentSchema from './agent-schema.wgsl?raw';

export class AgentGenerationPipeline {
  private static readonly UNIFORM_COUNT = 4;
  private static readonly COUNTER_COUNT = 1;
  private static readonly CLEAR_COMPACTED_TAIL_STRIDE = 4;
  private static readonly ALLOCATION_GROWTH_FACTOR = 1.25;

  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly uniforms: GPUBuffer;
  private readonly bindGroupCache = createBindGroupCache<[GPUBuffer, GPUBuffer]>(
    (active, inactive) =>
      this.device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniforms } },
          { binding: 1, resource: { buffer: active } },
          { binding: 2, resource: { buffer: this.countersBuffer } },
          { binding: 3, resource: { buffer: inactive } },
        ],
      })
  );

  private readonly resizePipeline: GPUComputePipeline;
  private readonly compactionPipeline: GPUComputePipeline;
  private readonly clearCompactedTailPipeline: GPUComputePipeline;
  private readonly resizeWorkgroupSize: number;
  private readonly compactionWorkgroupSize: number;

  private activeAgentsBuffer: GPUBuffer;
  private inactiveAgentsBuffer: GPUBuffer;
  private allocatedMaxAgentCount: number;
  private readonly countersBuffer: GPUBuffer;
  private readonly countersStagingBuffer: GPUBuffer;
  private readonly agentCountUniformValues = new Uint32Array(
    AgentGenerationPipeline.UNIFORM_COUNT
  );
  private readonly resizeUniformBuffer = new ArrayBuffer(
    AgentGenerationPipeline.UNIFORM_COUNT * Uint32Array.BYTES_PER_ELEMENT
  );
  private readonly resizeUniformFloatValues = new Float32Array(this.resizeUniformBuffer);
  private readonly resizeUniformUintValues = new Uint32Array(this.resizeUniformBuffer);

  public constructor(
    private readonly device: GPUDevice,
    initialMaxAgentCount: number,
    private readonly maxAgentCountUpperLimit = Number.POSITIVE_INFINITY
  ) {
    this.allocatedMaxAgentCount = this.clampMaxAgentCount(initialMaxAgentCount);
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
          buffer: {
            type: 'storage',
          },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: 'storage',
          },
        },
      ],
    });

    this.activeAgentsBuffer = this.createAgentsBuffer();
    this.inactiveAgentsBuffer = this.createAgentsBuffer();

    this.countersBuffer = this.device.createBuffer({
      size: AgentGenerationPipeline.COUNTER_COUNT * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    this.countersStagingBuffer = this.device.createBuffer({
      size: AgentGenerationPipeline.COUNTER_COUNT * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    this.uniforms = this.device.createBuffer({
      size: AgentGenerationPipeline.UNIFORM_COUNT * Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.resizeWorkgroupSize = getAgentWorkgroupSize(device, 'resize');
    this.compactionWorkgroupSize = getAgentWorkgroupSize(device, 'compaction');
    const resizeSchema = substituteAgentWorkgroupSize(device, agentSchema, 'resize');
    const compactionSchema = substituteAgentWorkgroupSize(
      device,
      agentSchema,
      'compaction'
    );

    this.resizePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [emptyBindGroupLayout, this.bindGroupLayout],
      }),
      compute: {
        module: smartCompile(device, resizeSchema, resizeShader),
        entryPoint: 'main',
      },
    });

    const compactionModule = smartCompile(
      device,
      compactionSchema,
      compactionShader.replaceAll(
        '__CLEAR_COMPACTED_TAIL_STRIDE__',
        AgentGenerationPipeline.CLEAR_COMPACTED_TAIL_STRIDE.toString()
      )
    );

    this.compactionPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [emptyBindGroupLayout, this.bindGroupLayout],
      }),
      compute: {
        module: compactionModule,
        entryPoint: 'main',
      },
    });

    this.clearCompactedTailPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [emptyBindGroupLayout, this.bindGroupLayout],
      }),
      compute: {
        module: compactionModule,
        entryPoint: 'clearCompactedTail',
      },
    });
  }

  public get agentsBuffer(): GPUBuffer {
    return this.activeAgentsBuffer;
  }

  private createAgentsBuffer(): GPUBuffer {
    return this.device.createBuffer({
      size: this.allocatedMaxAgentCount * AGENT_SIZE_IN_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
  }

  public get maxAgentCount(): number {
    return this.allocatedMaxAgentCount;
  }

  public get maxSupportedAgentCount(): number {
    return this.clampMaxAgentCount(Number.POSITIVE_INFINITY);
  }

  public ensureMaxAgentCount(
    requestedMaxAgentCount: number,
    activeAgentCount: number
  ): number {
    const requestedClampedMaxAgentCount = this.clampMaxAgentCount(requestedMaxAgentCount);
    if (requestedClampedMaxAgentCount <= this.allocatedMaxAgentCount) {
      return this.allocatedMaxAgentCount;
    }

    const nextMaxAgentCount = this.clampMaxAgentCount(
      Math.max(
        requestedClampedMaxAgentCount,
        Math.ceil(
          this.allocatedMaxAgentCount * AgentGenerationPipeline.ALLOCATION_GROWTH_FACTOR
        )
      )
    );
    const previousActiveAgentsBuffer = this.activeAgentsBuffer;
    const previousInactiveAgentsBuffer = this.inactiveAgentsBuffer;
    const previousMaxAgentCount = this.allocatedMaxAgentCount;
    this.allocatedMaxAgentCount = nextMaxAgentCount;
    this.activeAgentsBuffer = this.createAgentsBuffer();
    this.inactiveAgentsBuffer = this.createAgentsBuffer();

    const copyAgentCount = Math.min(
      Math.max(0, Math.floor(activeAgentCount)),
      previousMaxAgentCount,
      nextMaxAgentCount
    );
    if (copyAgentCount > 0) {
      const commandEncoder = this.device.createCommandEncoder();
      commandEncoder.copyBufferToBuffer(
        previousActiveAgentsBuffer,
        0,
        this.activeAgentsBuffer,
        0,
        copyAgentCount * AGENT_SIZE_IN_BYTES
      );
      this.device.queue.submit([commandEncoder.finish()]);
    }

    // GPUBuffer.destroy() defers actual freeing until pending submissions
    // finish, so calling it synchronously after submit is safe.
    previousActiveAgentsBuffer.destroy();
    previousInactiveAgentsBuffer.destroy();
    return this.allocatedMaxAgentCount;
  }

  private clampMaxAgentCount(value: number): number {
    const requestedMaxAgentCount =
      value === Number.POSITIVE_INFINITY
        ? Number.POSITIVE_INFINITY
        : Number.isFinite(value)
          ? Math.floor(value)
          : 0;
    return Math.min(
      getMaxSupportedAgentCount(this.device, this.maxAgentCountUpperLimit),
      Math.max(0, requestedMaxAgentCount)
    );
  }

  public writeAgents(agentOffset: number, data: Float32Array): void {
    this.device.queue.writeBuffer(
      this.activeAgentsBuffer,
      agentOffset * AGENT_SIZE_IN_BYTES,
      data
    );
  }

  public resizeAgents(agentCount: number, scale: vec2): void {
    if (agentCount <= 0 || vec2.equals(scale, vec2.fromValues(1, 1))) {
      return;
    }

    this.resizeUniformFloatValues[0] = scale[0];
    this.resizeUniformFloatValues[1] = scale[1];
    this.resizeUniformUintValues[2] = Math.max(0, Math.floor(agentCount));
    this.device.queue.writeBuffer(this.uniforms, 0, this.resizeUniformBuffer);

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.resizePipeline);
    passEncoder.setBindGroup(1, this.getBindGroup());
    dispatchAgentWorkgroups(passEncoder, this.resizeWorkgroupSize, agentCount);
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  public async compactAgents(agentCount: number): Promise<number> {
    if (agentCount <= 0) {
      return 0;
    }

    this.agentCountUniformValues[0] = agentCount;
    this.device.queue.writeBuffer(this.uniforms, 0, this.agentCountUniformValues);

    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.clearBuffer(this.countersBuffer, 0, Uint32Array.BYTES_PER_ELEMENT);
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.compactionPipeline);
    passEncoder.setBindGroup(1, this.getBindGroup());
    dispatchAgentWorkgroups(passEncoder, this.compactionWorkgroupSize, agentCount);
    passEncoder.setPipeline(this.clearCompactedTailPipeline);
    dispatchAgentWorkgroups(
      passEncoder,
      this.compactionWorkgroupSize,
      Math.ceil(agentCount / AgentGenerationPipeline.CLEAR_COMPACTED_TAIL_STRIDE)
    );
    passEncoder.end();

    commandEncoder.copyBufferToBuffer(
      this.countersBuffer,
      0,
      this.countersStagingBuffer,
      0,
      Uint32Array.BYTES_PER_ELEMENT
    );

    this.device.queue.submit([commandEncoder.finish()]);
    this.swapAgentBuffers();

    await this.countersStagingBuffer.mapAsync(GPUMapMode.READ);
    const compactedCount = new Uint32Array(
      this.countersStagingBuffer.getMappedRange(),
      0,
      1
    )[0];
    this.countersStagingBuffer.unmap();

    return compactedCount;
  }

  private getBindGroup(): GPUBindGroup {
    return this.bindGroupCache(this.activeAgentsBuffer, this.inactiveAgentsBuffer);
  }

  private swapAgentBuffers(): void {
    [this.activeAgentsBuffer, this.inactiveAgentsBuffer] = [
      this.inactiveAgentsBuffer,
      this.activeAgentsBuffer,
    ];
  }

  public destroy() {
    this.uniforms.destroy();
    this.countersBuffer.destroy();
    this.countersStagingBuffer.destroy();
    this.inactiveAgentsBuffer.destroy();
    this.activeAgentsBuffer.destroy();
  }
}
