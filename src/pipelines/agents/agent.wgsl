struct Agent {
  position: vec2<f32>,
  angle: f32,
  species: f32,
  timeToLive: f32
}

struct Settings {
  brushTrailWeight: f32,
  moveRate: f32,
  turnRate: f32,
  sensorAngle: f32,
  sensorOffset: f32,
};

@group(1) @binding(0) var<uniform> settings: Settings;
@group(1) @binding(1) var<storage, read_write> agents: array<Agent>;
@group(1) @binding(2) var trailMapIn: texture_2d<f32>;
@group(1) @binding(3) var trailMapOut: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let id = global_id.x;

  if (id >= arrayLength(&agents)) {
    return;
  }

  var agent = agents[id];

  if (agent.timeToLive <= 0.) {
    // agent.position = vec2(
    //   random_with_seed(agent.position, f32(id) + state.time),
    //   random_with_seed(agent.position, f32(id) + state.time + 12),
    // );
    // agent.angle = random_with_seed(vec2(agent.angle), f32(id) + state.time);
    // agent.species = 1;
    // agent.timeToLive = 1000;
    // agents[id] = agent;
    // return;
  }

  let random = random_with_seed(agent.position, f32(id) + state.time);
  let trailCurrent = textureLoad(trailMapIn, vec2<i32>(agent.position), 0);

  var weight: f32;
  if(agent.species == 0) {
    weight = trailCurrent.r - trailCurrent.g;
  } else {
    weight = trailCurrent.g - trailCurrent.r;
  }
  if (weight < 0) {
    agent.timeToLive = 0;
    return;
  }

  
  let trailForward = sense(agent.position, agent.angle, settings.sensorOffset, 0);
  let trailLeft = sense(agent.position, agent.angle, settings.sensorOffset, settings.sensorAngle);
  let trailRight = sense(agent.position, agent.angle, settings.sensorOffset, -settings.sensorAngle);

  var weightForward: f32 = trailForward.a * settings.brushTrailWeight;
  var weightLeft: f32 = trailLeft.a * settings.brushTrailWeight;
  var weightRight: f32 = trailRight.a * settings.brushTrailWeight;
  if (agent.species == 0) {
    weightForward += trailForward.r - trailForward.g;
    weightLeft += trailLeft.r - trailLeft.g;
    weightRight += trailRight.r - trailRight.g;
  } else {
    weightForward += trailForward.g - trailForward.r;
    weightLeft += trailLeft.g - trailLeft.r;
    weightRight += trailRight.g - trailRight.r;
  }

  var rotation: f32 = 0;
  if (weightForward < weightLeft && weightForward < weightRight) {
    rotation = (random - 0.5) * 2. * settings.turnRate * state.deltaTime;
  } else if (weightLeft < weightRight) {
    rotation = random * -settings.turnRate * state.deltaTime;
  } else if (weightRight < weightLeft) {
    rotation = random * settings.turnRate * state.deltaTime;
  }

  var nextAngle = agent.angle + rotation;

  let direction = vec2(cos(agent.angle), sin(agent.angle));
  var nextPosition = agent.position + direction * settings.moveRate * state.deltaTime;
  nextPosition = clamp(nextPosition, vec2<f32>(0, 0), state.size);
  if nextPosition.x == 0 || nextPosition.x == state.size.x || nextPosition.y == 0 || nextPosition.y == state.size.y {
    rotation = 3.14159265359 + random - 0.5;
    nextAngle = agent.angle + rotation;
  }

  var trail = vec4<f32>(0, 1, 0, 0);
  if (agent.species == 0) {
    trail = vec4(0.1, 0, 0, 0);
  }

  let current = textureLoad(trailMapIn, vec2<i32>(nextPosition), 0); 
  textureStore(trailMapOut, vec2<i32>(nextPosition), vec4(trail.rgb + current.rgb, 0));

  agent.position = nextPosition;
  agent.angle = nextAngle;
  agent.timeToLive -= state.deltaTime;
  agents[id] = agent;
}

fn sense(agentPosition: vec2<f32>, agentAngle: f32, sensorOffset: f32, sensorOffsetAngle: f32) -> vec4<f32> {
  let sensorAngle = agentAngle + sensorOffsetAngle;
  let sensorDirection = vec2(cos(sensorAngle), sin(sensorAngle));
  let sensorPosition = vec2<i32>(agentPosition + sensorDirection * sensorOffset);
  return textureLoad(trailMapIn, sensorPosition, 0); 
}

fn random_with_seed(uv: vec2<f32>, seed: f32) -> f32 {
  return fract(sin(dot(uv, vec2(12.9898 + seed, 78.233 + seed)))* 43758.5453123 + seed);
}
