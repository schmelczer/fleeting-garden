import { createBindGroupCache } from '../../utils/graphics/bind-group-cache';
import {
  createCachedBufferWrite,
  writeBufferIfChanged,
} from '../../utils/graphics/cached-buffer-write';
import { smartCompile } from '../../utils/graphics/smart-compile';
import { CommonState } from '../common-state/common-state';
import { TRAIL_SOURCE_TEXTURE_FORMAT } from '../texture-formats';
import {
  dispatchAgentWorkgroups,
  getAgentWorkgroupSize,
  substituteAgentWorkgroupSize,
} from './agent-dispatch';
import agentSchema from './agent-generation/agent-schema.wgsl?raw';
import shader from './agent.wgsl?raw';

export interface AgentSettings {
  color1ToColor1: number;
  color1ToColor2: number;
  color1ToColor3: number;
  color2ToColor1: number;
  color2ToColor2: number;
  color2ToColor3: number;
  color3ToColor1: number;
  color3ToColor2: number;
  color3ToColor3: number;
  moveSpeed: number;
  turnSpeed: number;
  sensorOffsetAngle: number;
  sensorOffsetDistance: number;
  turnWhenLost: number;
  individualTrailWeight: number;
  forwardRotationScale: number;
  introNearDistanceMin: number;
  introNearSensorOffsetMultiplier: number;
  introTargetAngleBlend: number;
  introProgressCutoff: number;
  introNearDistanceInner: number;
  introTurnRateMultiplier: number;
  introRandomTurnMultiplier: number;
  introStepStopDistance: number;
  randomTimeScale: number;
}

// The Settings struct in WGSL starts with a mat3x3<f32> reactionMatrix.
// In uniform layout each of its 3 columns is stored as a vec3<f32> padded to
// 16 bytes, so the matrix occupies floats [0..12] (with [3], [7], [11] unused
// padding). Remaining scalars pack tightly from float 12 onward.
const UNIFORM_COUNT = 32;
const REACTION_MATRIX_COL0 = 0;
const REACTION_MATRIX_COL1 = 4;
const REACTION_MATRIX_COL2 = 8;
const SCALAR_BASE = 12;

export class AgentPipeline {
  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly pipelineFull: GPUComputePipeline;
  private readonly pipelineSteady: GPUComputePipeline;
  private readonly uniforms: GPUBuffer;
  private readonly workgroupSize: number;
  private useSteadyPipeline = false;
  private readonly uniformValues = new Float32Array(UNIFORM_COUNT);
  private readonly uniformUintValues = new Uint32Array(this.uniformValues.buffer);
  private readonly uniformCache = createCachedBufferWrite(
    UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT
  );
  private readonly bindGroupCache = createBindGroupCache<
    [GPUBuffer, GPUTextureView, GPUTextureView]
  >((agentsBuffer, trailMapIn, trailMapOut) =>
    this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: { buffer: agentsBuffer } },
        { binding: 2, resource: trailMapIn },
        { binding: 3, resource: trailMapOut },
      ],
    })
  );

  private agentCount = 0;

  public constructor(
    private readonly device: GPUDevice,
    private readonly commonState: CommonState,
    private readonly getAgentsBuffer: () => GPUBuffer
  ) {
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: 'float' },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { format: TRAIL_SOURCE_TEXTURE_FORMAT },
        },
      ],
    });

    this.workgroupSize = getAgentWorkgroupSize(device, 'simulation');
    const shaderModule = smartCompile(
      device,
      CommonState.shaderCode,
      substituteAgentWorkgroupSize(device, agentSchema, 'simulation'),
      shader
    );
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [commonState.bindGroupLayout, this.bindGroupLayout],
    });
    this.pipelineFull = device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });
    this.pipelineSteady = device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'mainSteady',
      },
    });

    this.uniforms = device.createBuffer({
      size: UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  public setParameters({
    deltaTime,
    moveSpeed,
    turnSpeed,
    sensorOffsetAngle,
    sensorOffsetDistance,
    turnWhenLost,
    individualTrailWeight,
    color1ToColor1,
    color1ToColor2,
    color1ToColor3,
    color2ToColor1,
    color2ToColor2,
    color2ToColor3,
    color3ToColor1,
    color3ToColor2,
    color3ToColor3,
    forwardRotationScale,
    introNearDistanceInner,
    introNearDistanceMin,
    introNearSensorOffsetMultiplier,
    introTargetAngleBlend,
    introProgressCutoff,
    introTurnRateMultiplier,
    introRandomTurnMultiplier,
    introMoveSpeed,
    introStepStopDistance,
    randomTimeScale,
    time,
    agentCount,
    introProgress,
  }: AgentSettings & {
    deltaTime: number;
    time: number;
    agentCount: number;
    introMoveSpeed: number;
    introProgress?: number;
  }) {
    this.agentCount = agentCount;
    const resolvedIntroProgress = introProgress ?? 1;
    // Once the intro target phase ends nothing reads intro fields again, so the
    // steady-only pipeline can replace the full one for the rest of the session.
    this.useSteadyPipeline = resolvedIntroProgress >= introProgressCutoff;
    // Reaction matrix: column N holds the weights for source colorIndex == N.
    this.uniformValues[REACTION_MATRIX_COL0] = color1ToColor1;
    this.uniformValues[REACTION_MATRIX_COL0 + 1] = color1ToColor2;
    this.uniformValues[REACTION_MATRIX_COL0 + 2] = color1ToColor3;
    this.uniformValues[REACTION_MATRIX_COL1] = color2ToColor1;
    this.uniformValues[REACTION_MATRIX_COL1 + 1] = color2ToColor2;
    this.uniformValues[REACTION_MATRIX_COL1 + 2] = color2ToColor3;
    this.uniformValues[REACTION_MATRIX_COL2] = color3ToColor1;
    this.uniformValues[REACTION_MATRIX_COL2 + 1] = color3ToColor2;
    this.uniformValues[REACTION_MATRIX_COL2 + 2] = color3ToColor3;
    this.uniformValues[SCALAR_BASE + 0] = moveSpeed * deltaTime;
    this.uniformValues[SCALAR_BASE + 1] = turnSpeed * deltaTime;
    const sensorAngle = (sensorOffsetAngle * Math.PI) / 180;
    this.uniformValues[SCALAR_BASE + 2] = Math.sin(sensorAngle);
    this.uniformValues[SCALAR_BASE + 3] = Math.cos(sensorAngle);
    this.uniformValues[SCALAR_BASE + 4] = sensorOffsetDistance;
    this.uniformValues[SCALAR_BASE + 5] = turnWhenLost;
    this.uniformValues[SCALAR_BASE + 6] = individualTrailWeight;
    this.uniformUintValues[SCALAR_BASE + 7] = Math.max(0, Math.floor(agentCount));
    this.uniformValues[SCALAR_BASE + 8] = resolvedIntroProgress;
    this.uniformValues[SCALAR_BASE + 9] = forwardRotationScale;
    this.uniformValues[SCALAR_BASE + 10] = introNearDistanceInner;
    this.uniformValues[SCALAR_BASE + 11] = introNearDistanceMin;
    this.uniformValues[SCALAR_BASE + 12] = introNearSensorOffsetMultiplier;
    this.uniformValues[SCALAR_BASE + 13] = introTargetAngleBlend;
    this.uniformValues[SCALAR_BASE + 14] = introProgressCutoff;
    this.uniformValues[SCALAR_BASE + 15] = introTurnRateMultiplier;
    this.uniformValues[SCALAR_BASE + 16] = introRandomTurnMultiplier;
    this.uniformValues[SCALAR_BASE + 17] = introMoveSpeed * deltaTime;
    this.uniformValues[SCALAR_BASE + 18] = introStepStopDistance;
    this.uniformUintValues[SCALAR_BASE + 19] =
      Math.max(0, Math.floor(time * randomTimeScale)) >>> 0;
    writeBufferIfChanged(
      this.device,
      this.uniforms,
      this.uniformValues,
      this.uniformCache
    );
  }

  public execute(
    commandEncoder: GPUCommandEncoder,
    trailMapIn: GPUTextureView,
    trailMapOut: GPUTextureView,
    timestampWrites?: GPUComputePassTimestampWrites
  ) {
    if (this.agentCount <= 0) {
      return;
    }

    const passEncoder = commandEncoder.beginComputePass(
      timestampWrites ? { timestampWrites } : undefined
    );
    passEncoder.setPipeline(
      this.useSteadyPipeline ? this.pipelineSteady : this.pipelineFull
    );
    this.commonState.execute(passEncoder);
    passEncoder.setBindGroup(
      1,
      this.bindGroupCache(this.getAgentsBuffer(), trailMapIn, trailMapOut)
    );
    dispatchAgentWorkgroups(passEncoder, this.workgroupSize, this.agentCount);
    passEncoder.end();
  }

  public destroy() {
    this.uniforms.destroy();
  }
}
