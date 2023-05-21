import random from '../../../utils/graphics/random.wgsl';
import { smartCompile } from '../../../utils/graphics/smart-compile';
import { CommonState } from '../../common-state/common-state';
import { AGENT_SIZE_IN_BYTES, Agent } from './agent';
import countingShader from './agent-counting.wgsl';
import firstGenerationShader from './agent-first-generation.wgsl';
import agentGenerationShader from './agent-generation.wgsl';
import agentSchema from './agent-schema.wgsl';
import { GenerationCounts } from './generation-counts';

import { vec2 } from 'gl-matrix';

export class AgentGenerationPipeline {
  private static readonly WORKGROUP_SIZE = 64;
  private static readonly UNIFORM_COUNT = 4;
  private static readonly COUNTER_COUNT = 3;

  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly uniforms: GPUBuffer;
  private readonly bindGroup: GPUBindGroup;

  private readonly firstGenerationPipeline: GPUComputePipeline;
  private readonly nextGenerationPipeline: GPUComputePipeline;
  private readonly countingPipeline: GPUComputePipeline;

  public readonly agentsBuffer: GPUBuffer;
  public readonly countersBuffer: GPUBuffer;
  public readonly countersStagingBuffer: GPUBuffer;

  public constructor(
    private readonly device: GPUDevice,
    private readonly commonState: CommonState,
    private readonly agentCount: number
  ) {
    if (agentCount <= 0 || agentCount != Math.floor(agentCount)) {
      throw new Error('Agent count must be a positive integer');
    }

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
      ],
    });

    this.agentsBuffer = this.device.createBuffer({
      size: agentCount * AGENT_SIZE_IN_BYTES,
      usage: GPUBufferUsage.STORAGE,
    });

    this.countersBuffer = this.device.createBuffer({
      size: AgentGenerationPipeline.COUNTER_COUNT * Int32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    this.countersStagingBuffer = this.device.createBuffer({
      size: AgentGenerationPipeline.COUNTER_COUNT * Int32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    this.uniforms = this.device.createBuffer({
      size: AgentGenerationPipeline.UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

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
          resource: {
            buffer: this.agentsBuffer,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: this.countersBuffer,
          },
        },
      ],
    });

    this.firstGenerationPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [commonState.bindGroupLayout, this.bindGroupLayout],
      }),
      compute: {
        module: smartCompile(
          device,
          CommonState.shaderCode,
          random,
          agentSchema,
          firstGenerationShader
        ),
        entryPoint: 'main',
      },
    });

    this.nextGenerationPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [commonState.bindGroupLayout, this.bindGroupLayout],
      }),
      compute: {
        module: smartCompile(
          device,
          CommonState.shaderCode,
          random,
          agentSchema,
          agentGenerationShader
        ),
        entryPoint: 'main',
      },
    });

    this.countingPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [commonState.bindGroupLayout, this.bindGroupLayout],
      }),
      compute: {
        module: smartCompile(
          device,
          CommonState.shaderCode,
          random,
          agentSchema,
          countingShader
        ),
        entryPoint: 'main',
      },
    });
  }

  public spawnFirstGeneration(): void {
    const commandEncoder = this.device.createCommandEncoder();

    const passEncoder = commandEncoder.beginComputePass();
    this.commonState.execute(passEncoder);
    passEncoder.setPipeline(this.firstGenerationPipeline);
    passEncoder.setBindGroup(1, this.bindGroup);
    passEncoder.dispatchWorkgroups(
      Math.ceil(this.agentCount / AgentGenerationPipeline.WORKGROUP_SIZE)
    );
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  public spawnNextGeneration(center: vec2, radius: number, generationId: number): void {
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([...center, radius, generationId])
    );

    const commandEncoder = this.device.createCommandEncoder();

    const passEncoder = commandEncoder.beginComputePass();
    this.commonState.execute(passEncoder);
    passEncoder.setPipeline(this.nextGenerationPipeline);
    passEncoder.setBindGroup(1, this.bindGroup);
    passEncoder.dispatchWorkgroups(
      Math.ceil(this.agentCount / AgentGenerationPipeline.WORKGROUP_SIZE)
    );
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  public async countAgents(): Promise<GenerationCounts> {
    this.device.queue.writeBuffer(this.countersBuffer, 0, new Int32Array([0, 0]));

    const commandEncoder = this.device.createCommandEncoder();

    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.countingPipeline);
    this.commonState.execute(passEncoder);
    passEncoder.setBindGroup(1, this.bindGroup);
    passEncoder.dispatchWorkgroups(
      Math.ceil(this.agentCount / AgentGenerationPipeline.WORKGROUP_SIZE)
    );
    passEncoder.end();

    commandEncoder.copyBufferToBuffer(
      this.countersBuffer,
      0,
      this.countersStagingBuffer,
      0,
      AgentGenerationPipeline.COUNTER_COUNT * Int32Array.BYTES_PER_ELEMENT
    );

    this.device.queue.submit([commandEncoder.finish()]);

    await this.countersStagingBuffer.mapAsync(GPUMapMode.READ);

    const data = new Int32Array(this.countersStagingBuffer.getMappedRange().slice(0));
    this.countersStagingBuffer.unmap();
    return {
      evenGenerationCount: data[0],
      oddGenerationCount: data[1],
    };
  }

  public destroy() {
    this.uniforms.destroy();
    this.countersBuffer.destroy();
    this.countersStagingBuffer.destroy();
    this.agentsBuffer.destroy();
  }
}
