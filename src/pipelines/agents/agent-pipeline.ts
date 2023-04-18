import { AGENT_SIZE_IN_BYTES, Agent } from './agent';
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
        module: device.createShaderModule({
          code: shader,
        }),
        entryPoint: 'main',
      },
    });

    this.uniforms = this.device.createBuffer({
      size: AgentPipeline.UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const serializedAgents = new Float32Array(
      new ArrayBuffer(agents.length * AGENT_SIZE_IN_BYTES)
    );
    agents.forEach((agent, i) => {
      serializedAgents[(i * AGENT_SIZE_IN_BYTES) / Float32Array.BYTES_PER_ELEMENT + 0] =
        agent.position[0];
      serializedAgents[(i * AGENT_SIZE_IN_BYTES) / Float32Array.BYTES_PER_ELEMENT + 1] =
        agent.position[1];
      serializedAgents[(i * AGENT_SIZE_IN_BYTES) / Float32Array.BYTES_PER_ELEMENT + 2] =
        agent.angle;
    });

    this.agentsBuffer = device.createBuffer({
      size: agents.length * AGENT_SIZE_IN_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this.agentsBuffer, 0, serializedAgents.buffer);
  }

  public setParameters({
    width,
    height,
    trailWeight,
    deltaTime,
    time,
    moveSpeed,
    turnSpeed,
    sensorAngleDegrees,
    sensorOffsetDst,
  }: {
    width: number;
    height: number;
    trailWeight: number;
    deltaTime: number;
    time: number;
    moveSpeed: number;
    turnSpeed: number;
    sensorAngleDegrees: number;
    sensorOffsetDst: number;
  }) {
    this.device.queue.writeBuffer(
      this.uniforms,
      0,
      new Float32Array([
        width,
        height,
        trailWeight,
        time,
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
