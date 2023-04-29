import { smartCompile } from '../../utils/smart-compile';
import { CommonParameters } from '../common-parameters';
import { AGENT_SIZE_IN_BYTES, Agent } from './agent';
import { AgentSettings } from './agent-settings';
import shader from './agent.wgsl';

export class AgentPipeline {
  private static readonly WORKGROUP_SIZE = 64;
  private static readonly UNIFORM_COUNT = 10;

  private readonly pipeline: GPUComputePipeline;
  private readonly uniforms: GPUBuffer;
  private readonly agentsBuffer: GPUBuffer;

  private bindGroup?: GPUBindGroup;
  private previousTrailMapIn?: GPUTexture;
  private previousTrailMapOut?: GPUTexture;

  public constructor(private readonly device: GPUDevice, agents: Array<Agent>) {
    if (agents.length === 0) {
      throw new Error('No agents provided');
    }

    this.pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: smartCompile(device, shader),
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
    canvasSize,
    deltaTime,
    time,
    trailWeight,
    moveSpeed,
    turnSpeed,
    sensorAngleDegrees,
    sensorOffsetDst,
  }: CommonParameters & AgentSettings) {
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([
        canvasSize[0],
        canvasSize[1],
        deltaTime,
        time,
        trailWeight,
        moveSpeed * deltaTime,
        turnSpeed * deltaTime,
        (sensorAngleDegrees * Math.PI) / 180,
        sensorOffsetDst,
      ])
    );
  }

  public execute(
    commandEncoder: GPUCommandEncoder,
    trailMapIn: GPUTexture,
    trailMapOut: GPUTexture
  ) {
    this.ensureBindGroupExists(trailMapIn, trailMapOut);

    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.dispatchWorkgroups(
      Math.ceil(
        this.agentsBuffer.size / AGENT_SIZE_IN_BYTES / AgentPipeline.WORKGROUP_SIZE
      )
    );
    passEncoder.end();
  }

  private ensureBindGroupExists(trailMapIn: GPUTexture, trailMapOut: GPUTexture) {
    if (
      this.previousTrailMapIn !== trailMapIn ||
      this.previousTrailMapOut !== trailMapOut
    ) {
      this.bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
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
            resource: trailMapIn.createView(),
          },
          {
            binding: 3,
            resource: trailMapOut.createView(),
          },
        ],
      });

      this.previousTrailMapIn = trailMapIn;
      this.previousTrailMapOut = trailMapOut;
    }
  }
}
