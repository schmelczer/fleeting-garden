import { smartCompile } from '../../utils/graphics/smart-compile';
import { CommonState } from '../common-state/common-state';
import { AGENT_SIZE_IN_BYTES, Agent } from './agent';
import { AgentSettings } from './agent-settings';
import shader from './agent.wgsl';

export class AgentPipeline {
  private static readonly WORKGROUP_SIZE = 64;
  private static readonly UNIFORM_COUNT = 5;

  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly pipeline: GPUComputePipeline;
  private readonly uniforms: GPUBuffer;
  private readonly agentsBuffer: GPUBuffer;

  private bindGroup?: GPUBindGroup;
  private previousTrailMapIn?: GPUTextureView;
  private previousTrailMapOut?: GPUTextureView;

  public constructor(
    private readonly device: GPUDevice,
    agents: Array<Agent>,
    private readonly commonState: CommonState
  ) {
    if (agents.length === 0) {
      throw new Error('No agents provided');
    }

    this.bindGroupLayout = device.createBindGroupLayout(AgentPipeline.bindGroupLayout);

    this.pipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [commonState.bindGroupLayout, this.bindGroupLayout],
      }),
      compute: {
        module: smartCompile(device, CommonState.shaderCode, shader),
        entryPoint: 'main',
      },
    });

    this.uniforms = this.device.createBuffer({
      size: AgentPipeline.UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.agentsBuffer = device.createBuffer({
      size: agents.length * AGENT_SIZE_IN_BYTES,
      usage: GPUBufferUsage.STORAGE,
      mappedAtCreation: true,
    });

    new Float32Array(this.agentsBuffer.getMappedRange()).set(
      agents.flatMap((agent) => [
        agent.position[0],
        agent.position[1],
        agent.angle,
        agent.species,
        agent.timeToLive,
        0, // padding
      ])
    );
    this.agentsBuffer.unmap();
  }

  public setParameters({
    brushTrailWeight,
    moveSpeed,
    turnSpeed,
    sensorAngleDegrees,
    sensorOffsetDst,
  }: AgentSettings) {
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([
        brushTrailWeight,
        moveSpeed,
        turnSpeed,
        (sensorAngleDegrees * Math.PI) / 180,
        sensorOffsetDst,
      ])
    );
  }

  public executeRenderPass(
    commandEncoder: GPUCommandEncoder,
    trailMapIn: GPUTextureView,
    trailMapOut: GPUTextureView
  ) {
    this.ensureBindGroupExists(trailMapIn, trailMapOut);

    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.pipeline);
    this.commonState.execute(passEncoder);
    passEncoder.setBindGroup(1, this.bindGroup);
    passEncoder.dispatchWorkgroups(
      Math.ceil(
        this.agentsBuffer.size / AGENT_SIZE_IN_BYTES / AgentPipeline.WORKGROUP_SIZE
      )
    );
    passEncoder.end();
  }

  public execute(
    commandEncoder: GPUCommandEncoder,
    trailMapIn: GPUTextureView,
    trailMapOut: GPUTextureView
  ) {
    this.ensureBindGroupExists(trailMapIn, trailMapOut);

    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.pipeline);
    this.commonState.execute(passEncoder);
    passEncoder.setBindGroup(1, this.bindGroup);
    passEncoder.dispatchWorkgroups(
      Math.ceil(
        this.agentsBuffer.size / AGENT_SIZE_IN_BYTES / AgentPipeline.WORKGROUP_SIZE
      )
    );
    passEncoder.end();
  }

  private ensureBindGroupExists(trailMapIn: GPUTextureView, trailMapOut: GPUTextureView) {
    if (
      this.previousTrailMapIn !== trailMapIn ||
      this.previousTrailMapOut !== trailMapOut
    ) {
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
            resource: trailMapIn,
          },
          {
            binding: 3,
            resource: trailMapOut,
          },
        ],
      });

      this.previousTrailMapIn = trailMapIn;
      this.previousTrailMapOut = trailMapOut;
    }
  }

  public destroy() {
    this.uniforms.destroy();
    this.agentsBuffer.destroy();
  }

  private static get bindGroupLayout(): GPUBindGroupLayoutDescriptor {
    return {
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
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            format: 'rgba16float',
          },
        },
      ],
    };
  }
}
