const SpawnMode = { Random: 0, Point: 1, InwardCircle: 2, RandomCircle: 3 };

interface Settings {
  stepsPerFrame: number;
  numAgents: number;
  spawnMode: number;
  trailWeight: number;
  decayRate: number;
  diffuseRate: number;
  moveSpeed: number;
  turnSpeed: number;
  sensorAngleSpacing: number;
  sensorOffsetDst: number;
  sensorSize: number;
}

export const settings: Settings = {
  stepsPerFrame: 2,
  numAgents: 250000,
  spawnMode: SpawnMode.InwardCircle,
  trailWeight: 5,
  decayRate: 0.2,
  diffuseRate: 3,

  moveSpeed: 20,
  turnSpeed: 2,
  sensorAngleSpacing: 30,
  sensorOffsetDst: 35,
  sensorSize: 1,
};
