const AGENT_WORKGROUP_KINDS = ['simulation', 'eraser', 'resize', 'compaction'] as const;

export type AgentWorkgroupKind = (typeof AGENT_WORKGROUP_KINDS)[number];

const AGENT_WORKGROUP_SIZE_TARGETS = {
  // Keep shader-specific targets conservative. Using the device maximum can
  // hurt occupancy and makes compaction's workgroup scan more expensive.
  simulation: 256,
  eraser: 256,
  resize: 256,
  compaction: 256,
} satisfies Record<AgentWorkgroupKind, number>;

export const getAgentWorkgroupSize = (
  device: GPUDevice,
  kind: AgentWorkgroupKind = 'simulation'
): number => {
  const deviceLimit = Math.max(
    1,
    Math.floor(
      Math.min(
        device.limits.maxComputeInvocationsPerWorkgroup,
        device.limits.maxComputeWorkgroupSizeX
      )
    )
  );
  return Math.min(AGENT_WORKGROUP_SIZE_TARGETS[kind], deviceLimit);
};

export const getMinAgentWorkgroupSize = (device: GPUDevice): number =>
  Math.min(...AGENT_WORKGROUP_KINDS.map((kind) => getAgentWorkgroupSize(device, kind)));

export const substituteAgentWorkgroupSize = (
  device: GPUDevice,
  shaderCode: string,
  kind: AgentWorkgroupKind = 'simulation'
): string =>
  shaderCode.replaceAll(
    '__AGENT_WORKGROUP_SIZE__',
    String(getAgentWorkgroupSize(device, kind))
  );

export const dispatchAgentWorkgroups = (
  passEncoder: GPUComputePassEncoder,
  workgroupSize: number,
  agentCount: number
): void => {
  passEncoder.dispatchWorkgroups(Math.ceil(agentCount / workgroupSize), 1);
};
