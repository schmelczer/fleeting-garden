import { getWorkgroupCounts } from '../../utils/graphics/get-workgroup-counts';
import { smartCompile } from '../../utils/graphics/smart-compile';
import { CommonState } from '../common-state/common-state';
import agentSchme from './agent-generation/agent-schema.wgsl';
import { AgentSettings } from './agent-settings';
import shader from './agent.wgsl';

import { vec2 } from 'gl-matrix';

export class AgentPipeline {
  private static readonly WORKGROUP_SIZE = 64;
  private static readonly UNIFORM_COUNT = 17;

  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly pipeline: GPUComputePipeline;
  private readonly uniforms: GPUBuffer;
  private bindGroup?: GPUBindGroup;
  private previousTrailMapIn?: GPUTextureView;
  private previousTrailMapOut?: GPUTextureView;

  private agentCount = 0;

  public constructor(
    private readonly device: GPUDevice,
    private readonly commonState: CommonState,
    private readonly agentsBuffer: GPUBuffer // doesn't get destroyed
  ) {
    this.bindGroupLayout = device.createBindGroupLayout(AgentPipeline.bindGroupLayout);

    this.pipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [commonState.bindGroupLayout, this.bindGroupLayout],
      }),
      compute: {
        module: smartCompile(device, CommonState.shaderCode, agentSchme, shader),
        entryPoint: 'main',
      },
    });

    this.uniforms = this.device.createBuffer({
      size: AgentPipeline.UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  public setParameters({
    brushTrailWeight,
    moveSpeed,
    turnSpeed,
    sensorOffsetAngle,
    sensorOffsetDistance,
    evenGenerationAggression,
    oddGenerationAggression,
    nextGenerationId,
    center,
    radius,
    turnWhenGoingInTheRightDirection,
    turnWhenLost,
    individualTrailWeight,
    deinfectionProbability,
    agentCount,
  }: AgentSettings & {
    evenGenerationAggression: number;
    oddGenerationAggression: number;
    nextGenerationId: number;
    center: vec2;
    radius: number;
    agentCount: number;
  }) {
    this.agentCount = agentCount;
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([
        brushTrailWeight,
        moveSpeed,
        turnSpeed,
        (sensorOffsetAngle * Math.PI) / 180,
        sensorOffsetDistance,
        evenGenerationAggression,
        oddGenerationAggression,
        nextGenerationId,
        ...center,
        radius,
        turnWhenGoingInTheRightDirection,
        turnWhenLost,
        individualTrailWeight,
        deinfectionProbability,
        agentCount,
      ])
    );
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
      ...getWorkgroupCounts(this.device, this.agentCount, AgentPipeline.WORKGROUP_SIZE)
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
