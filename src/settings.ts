const SpawnMode = { Random: 0, Point: 1, InwardCircle: 2, RandomCircle: 3 };

interface Settings {
  stepsPerFrame: number;
  agentCount: number;
  spawnMode: number;
  trailWeight: number;
  decayRate: number;
  diffusionRate: number;
  moveSpeed: number;
  turnSpeed: number;
  sensorAngleSpacing: number;
  sensorOffsetDst: number;
  sensorSize: number;
}

export const settings: Settings = {
  stepsPerFrame: 2,
  agentCount: 500000,
  spawnMode: SpawnMode.InwardCircle,
  trailWeight: 5,

  decayRate: 0.05,
  diffusionRate: 0.1,

  moveSpeed: 20,
  turnSpeed: 2,
  sensorAngleSpacing: 30,
  sensorOffsetDst: 35,
  sensorSize: 1,
};
