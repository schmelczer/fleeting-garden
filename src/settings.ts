interface Settings {
  agentCount: number;
  renderSpeed: number;
  startingRadius: number;
  trailWeight: number;
  decayRate: number;
  diffusionRate: number;
  moveSpeed: number;
  turnSpeed: number;
  sensorAngleDegrees: number;
  sensorOffsetDst: number;
  swipeRadius: number;
  swipeBlur: number;
}

export const settings: Settings = {
  agentCount: 1_000,
  renderSpeed: 1,
  startingRadius: 0.15,

  decayRate: 0.02,
  diffusionRate: 0.8,

  trailWeight: 5,
  moveSpeed: 0.025,
  turnSpeed: 6,
  sensorAngleDegrees: 30,
  sensorOffsetDst: 0.025,

  swipeRadius: 0.003,
  swipeBlur: 0.002,
};
