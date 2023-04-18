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
}

export const settings: Settings = {
  agentCount: 1_000_000,
  renderSpeed: 2,
  startingRadius: 0.15,
  trailWeight: 5,

  decayRate: 0.05,
  diffusionRate: 0.3,

  moveSpeed: 0.025,
  turnSpeed: 6,
  sensorAngleDegrees: 30,
  sensorOffsetDst: 0.025,
};
