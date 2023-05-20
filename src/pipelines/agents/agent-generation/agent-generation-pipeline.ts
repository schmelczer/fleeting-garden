import random from '../../../utils/graphics/random.wgsl';
import { smartCompile } from '../../../utils/graphics/smart-compile';
import { CommonState } from '../../common-state/common-state';
import { AGENT_SIZE_IN_BYTES, Agent } from '../agent';
import shader from './agent-generation.wgsl';
import agentSchema from './agent-schema.wgsl';

export class AgentGenerationPipeline {
  private static readonly WORKGROUP_SIZE = 64;

  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly pipeline: GPUComputePipeline;

  private bindGroup?: GPUBindGroup;

  public constructor(
    private readonly device: GPUDevice,
    private readonly commonState: CommonState
  ) {
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: 'storage',
          },
        },
      ],
    });

    this.pipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [commonState.bindGroupLayout, this.bindGroupLayout],
      }),
      compute: {
        module: smartCompile(device, CommonState.shaderCode, random, agentSchema, shader),
        entryPoint: 'main',
      },
    });
  }

  public generateAgents(agentCount: number): GPUBuffer {
    if (agentCount <= 0 || agentCount != Math.floor(agentCount)) {
      throw new Error('Agent count must be a positive integer');
    }

    const agentsBuffer = this.device.createBuffer({
      size: agentCount * AGENT_SIZE_IN_BYTES,
      usage: GPUBufferUsage.STORAGE,
    });

    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 1,
          resource: {
            buffer: agentsBuffer,
          },
        },
      ],
    });

    const commandEncoder = this.device.createCommandEncoder();

    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.pipeline);
    this.commonState.execute(passEncoder);
    passEncoder.setBindGroup(1, this.bindGroup);
    passEncoder.dispatchWorkgroups(
      Math.ceil(agentCount / AgentGenerationPipeline.WORKGROUP_SIZE)
    );
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);
    return agentsBuffer;
  }
}
