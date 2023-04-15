struct Agent {
  position: vec2<f32>,
  angle: f32,
}

struct Settings {
  width : i32,
  height : i32,
  trailWeight : f32,
  deltaTime : f32,
  time : f32,

  moveSpeed : f32,
  turnSpeed : f32,
  sensorAngleDegrees : f32,
  sensorOffsetDst : f32,
  sensorSize : f32,
};

@group(0) @binding(0) var<uniform> settings : Settings;
@group(0) @binding(1) var<storage, read_write> agents: array<Agent>;
@group(0) @binding(2) var TrailMapIn : texture_2d<f32>;
@group(0) @binding(3) var TrailMapOut : texture_storage_2d<rgba16float, write>;


// Hash function www.cs.ubc.ca/~rbridson/docs/schechter-sca08-turbulence.pdf
fn hash(state0 : u32) -> u32
{
  var state : u32 = state0;
  state = state ^ 2747636419u;
  state = state * 2654435769u;
  state = state ^ (state >> 16u);
  state = state * 2654435769u;
  state = state ^ (state >> 16u);
  state = state * 2654435769u;
  return state;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
  let id = global_id.x;

  if (id >= arrayLength(&agents)) {
    return;
  }

  var agent = agents[id];



  var random = f32(hash(
    u32(
      agent.position.y * f32(settings.width) + agent.position.x
    )
    + hash(
      id + u32(settings.time * 100000.)
    )
  )) / 4294967295.0;

  // Steer based on sensory data
  let sensorAngleRad : f32 = settings.sensorAngleDegrees * (3.1415 / 180.);
  let weightForward : f32 = sense(agent, 0.);
  let weightLeft : f32 = sense(agent, sensorAngleRad);
  let weightRight : f32 = sense(agent, -sensorAngleRad);

  let randomSteerStrength : f32 = random;
  let turnSpeed : f32 = settings.turnSpeed * 2. * 3.1415;

  // choose random direction
  if (weightForward < weightLeft && weightForward < weightRight) {
   agent.angle = agent.angle + (randomSteerStrength - 0.5) * 2. * turnSpeed * settings.deltaTime;
  }
  // Turn right
  else if (weightRight > weightLeft) {
    agent.angle = agent.angle - randomSteerStrength * turnSpeed * settings.deltaTime;
  }
  // Turn left
  else if (weightLeft > weightRight) {
    agent.angle = agent.angle + randomSteerStrength * turnSpeed * settings.deltaTime;
  }

  // Update position
  let direction : vec2<f32> = vec2<f32>(cos(agent.angle), sin(agent.angle));
  var newPos : vec2<f32> = agent.position + direction * settings.deltaTime * settings.moveSpeed;

  // Clamp position to map boundaries, and pick new random move dir if hit boundary
  if (newPos.x < 0. || newPos.x >= f32(settings.width) || newPos.y < 0. || newPos.y >= f32(settings.height)) {
    // random = hash(random);
    let randomAngle : f32 = random * 2. * 3.1415;

    newPos.x = min(f32(settings.width - 1), max(0., newPos.x));
    newPos.y = min(f32(settings.height - 1), max(0., newPos.y));
    agent.angle = randomAngle;
  } else {
    let offset : i32 = i32() * settings.width * 4 + i32() * 4;
    textureStore(TrailMapOut, vec2<i32>(i32(newPos.x), i32(newPos.y)), vec4(vec3<f32>(1.) * settings.trailWeight * settings.deltaTime, 1.));
  }

 agent.position = newPos;
  agents[id] = agent;
}

fn sense(agent : Agent, sensorAngleOffset : f32) -> f32 {
  let sensorAngle : f32 = agent.angle + sensorAngleOffset;
  let sensorDir : vec2<f32> = vec2<f32>(cos(sensorAngle), sin(sensorAngle));

  let sensorPos : vec2<f32> = agent.position + sensorDir * settings.sensorOffsetDst;
  let sensorCentreX : i32 = i32(sensorPos.x);
  let sensorCentreY : i32 = i32(sensorPos.y);

  var sum : f32 = 0.;

  let senseWeight : vec4<i32> = vec4<i32>(2, 2, 2, 2) - vec4<i32>(1, 1, 1, 1);

  let sensorSize : i32 = i32(settings.sensorSize);
  for (var offsetX : i32 = -sensorSize; offsetX <= sensorSize; offsetX = offsetX + 1) {
    for (var offsetY : i32 = -sensorSize; offsetY <= sensorSize; offsetY = offsetY + 1) {
      let sampleX : i32 = min(settings.width - 1, max(0, sensorCentreX + offsetX));
      let sampleY : i32 = min(settings.height - 1, max(0, sensorCentreY + offsetY));
      sum = sum + dot(vec4<f32>(senseWeight), textureLoad(TrailMapIn,  vec2<i32>(sampleX, sampleY), 1));
    }
  }

  return sum;
}
