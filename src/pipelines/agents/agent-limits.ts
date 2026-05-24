import { getMinAgentWorkgroupSize } from './agent-dispatch';

export const AGENT_FLOAT_COUNT = 8;
export const AGENT_SIZE_IN_BYTES = AGENT_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT;

const AGENT_LAYOUT = {
  positionX: 0,
  positionY: 1,
  angle: 2,
  colorIndex: 3,
  targetPositionX: 4,
  targetPositionY: 5,
  targetAngle: 6,
  introDelay: 7,
} as const;

export interface AgentLayoutValues {
  angle: number;
  colorIndex: number;
  introDelay: number;
  positionX: number;
  positionY: number;
  targetAngle: number;
  targetPositionX: number;
  targetPositionY: number;
}

export const writeAgentValues = (
  target: Float32Array,
  agentIndex: number,
  values: AgentLayoutValues
): void => {
  const base = agentIndex * AGENT_FLOAT_COUNT;
  target[base + AGENT_LAYOUT.positionX] = values.positionX;
  target[base + AGENT_LAYOUT.positionY] = values.positionY;
  target[base + AGENT_LAYOUT.angle] = values.angle;
  target[base + AGENT_LAYOUT.colorIndex] = values.colorIndex;
  target[base + AGENT_LAYOUT.targetPositionX] = values.targetPositionX;
  target[base + AGENT_LAYOUT.targetPositionY] = values.targetPositionY;
  target[base + AGENT_LAYOUT.targetAngle] = values.targetAngle;
  target[base + AGENT_LAYOUT.introDelay] = values.introDelay;
};

export const getMaxSupportedAgentCount = (
  device: GPUDevice,
  maxAgentCountUpperLimit = Number.POSITIVE_INFINITY
): number => {
  const storageBufferBindingSize =
    device.limits.maxStorageBufferBindingSize ?? device.limits.maxBufferSize;
  const upperLimit = Number.isFinite(maxAgentCountUpperLimit)
    ? Math.floor(maxAgentCountUpperLimit)
    : Number.POSITIVE_INFINITY;

  return Math.max(
    0,
    Math.min(
      upperLimit,
      Math.floor(device.limits.maxBufferSize / AGENT_SIZE_IN_BYTES),
      Math.floor(storageBufferBindingSize / AGENT_SIZE_IN_BYTES),
      Math.floor(device.limits.maxComputeWorkgroupsPerDimension) *
        getMinAgentWorkgroupSize(device)
    )
  );
};
