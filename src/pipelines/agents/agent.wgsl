struct Agent {
  position: vec2<f32>,
  angle: f32,
  species: f32,
  timeToLive: f32
}

struct Settings {
  size: vec2<f32>,
  deltaTime: f32,
  time: f32,

  trailWeight: f32,
  moveRate: f32,
  turnRate: f32,
  sensorAngle: f32,
  sensorOffsetDst: f32,
};

@group(0) @binding(0) var<uniform> settings: Settings;
@group(0) @binding(1) var<storage, read_write> agents: array<Agent>;
@group(0) @binding(2) var TrailMapIn: texture_2d<f32>;
@group(0) @binding(3) var TrailMapOut: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let id = global_id.x;

  if (id >= arrayLength(&agents)) {
    return;
  }

  var agent = agents[id];

  let random = random(id + u32(settings.time * 10000 + agent.position.y * 10 + agent.position.x));

  let weightForward: f32 = sense(agent, 0.);
  let weightLeft: f32 = sense(agent, settings.sensorAngle);
  let weightRight: f32 = sense(agent, -settings.sensorAngle);

  if (weightForward < weightLeft && weightForward < weightRight) {
    agent.angle += (random - 0.5) * 2. * settings.turnRate;
  } else if (weightLeft < weightRight) {
    agent.angle -= random * settings.turnRate;
  } else if (weightRight < weightLeft) {
    agent.angle += random * settings.turnRate;
  }

  let direction = vec2(cos(agent.angle), sin(agent.angle));
  var newPos = agent.position + direction / normalize(settings.size) * settings.moveRate;
  newPos = clamp(newPos, vec2<f32>(0, 0), vec2<f32>(1, 1));
  if (newPos.x == 0. || newPos.x == 1. || newPos.y == 0. || newPos.y == 1.) {
    agent.angle += 3.14159265359 + random - 0.5;
  }

  textureStore(
    TrailMapOut, 
    vec2<i32>(newPos * settings.size),
    vec4(1)
  );

  agent.position = newPos;
  agents[id] = agent;
}

fn sense(agent: Agent, sensorAngleOffset: f32) -> f32 {
  let sensorAngle: f32 = agent.angle + sensorAngleOffset;
  let sensorDir: vec2<f32> = vec2(cos(sensorAngle), sin(sensorAngle)) / normalize(settings.size);
  let sensorPos: vec2<f32> = agent.position + sensorDir * settings.sensorOffsetDst;
  return textureLoad(TrailMapIn, vec2<i32>(sensorPos * settings.size), 0).x;  
}

fn random(state0: u32) -> f32 {
  var state: u32 = state0;
  state = state ^ 2747636419u;
  state = state * 2654435769u;
  state = state ^ (state >> 16u);
  state = state * 2654435769u;
  state = state ^ (state >> 16u);
  state = state * 2654435769u;
  return f32(state) / 4294967295.0;
}
