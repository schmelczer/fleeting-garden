interface Settings {
  agentCount: number;
  trailWeight: number;
  decayRate: number;
  diffusionRate: number;
  moveSpeed: number;
  turnSpeed: number;
  sensorAngleDegrees: number;
  sensorOffsetDst: number;
  sensorSize: number;
}

export const settings: Settings = {
  agentCount: 50000,
  trailWeight: 5,

  decayRate: 0.05,
  diffusionRate: 0.2,

  moveSpeed: 0.03,
  turnSpeed: 2,
  sensorAngleDegrees: 45,
  sensorOffsetDst: 35 / 1000,
  sensorSize: 1,
};
