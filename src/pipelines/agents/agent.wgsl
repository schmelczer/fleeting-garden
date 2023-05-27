struct Settings {
  brushTrailWeight: f32,
  moveRate: f32,
  turnRate: f32,

  sensorAngle: f32,
  sensorOffset: f32,

  currentGenerationAggression: f32,
  nextGenerationAggression: f32,
  isNextGenerationOdd: f32,

  center: vec2<f32>,
  radius: f32,

  turnWhenGoingInTheRightDirection: f32,
  turnWhenLost: f32,
  individualTrailWeight: f32,
  deinfectionProbability: f32,

  agentCount: f32 // might be smaller than the length of the agents array
};


@group(1) @binding(0) var<uniform> settings: Settings;

// even generation's trail -> red channel
// odd generation's trail -> green channel
// unused -> blue channel
// brush -> alpha channel
@group(1) @binding(2) var trailMapIn: texture_2d<f32>;
@group(1) @binding(3) var trailMapOut: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(64)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(num_workgroups) workgroup_count: vec3<u32>
) {
  let id = global_id.x + global_id.y * (workgroup_count.x * 64) + global_id.z * (workgroup_count.x * workgroup_count.y * 64);

  if id >= u32(settings.agentCount) {
    return;
  }

  var agent = agents[id];

  let random = textureSampleLevel(
    noise,
    noiseSampler,
    vec2(f32(id) % 23647 / 2000,
    state.time % 6294 / 2000),
    0
  ).a;

  let isFromCurrentGeneration = abs(agent.generation - settings.isNextGenerationOdd);
  let isFromOddGeneration = agent.generation == 1.0;

  let trailForward = sense(agent.position, agent.angle, settings.sensorOffset, 0);
  let trailLeft = sense(agent.position, agent.angle, settings.sensorOffset, settings.sensorAngle);
  let trailRight = sense(agent.position, agent.angle, settings.sensorOffset, -settings.sensorAngle);

  var weightForward: f32 = isFromCurrentGeneration * trailForward.a * settings.brushTrailWeight;
  var weightLeft: f32 = isFromCurrentGeneration * trailLeft.a * settings.brushTrailWeight;
  var weightRight: f32 = isFromCurrentGeneration * trailRight.a * settings.brushTrailWeight;

  let agression = isFromCurrentGeneration * settings.currentGenerationAggression + (1.0 - isFromCurrentGeneration) * settings.nextGenerationAggression; 
  if (isFromOddGeneration) {
    weightForward += trailForward.g + agression * trailForward.r;
    weightLeft += trailLeft.g + agression * trailLeft.r;
    weightRight += trailRight.g + agression * trailRight.r;
  } else {
    weightForward += trailForward.r + agression * trailForward.g;
    weightLeft += trailLeft.r + agression * trailLeft.g;
    weightRight += trailRight.r + agression * trailRight.g;
  }

  var rotation: f32 = 0;
  if weightForward > weightLeft && weightForward > weightRight {
    rotation = (random - 0.5) * settings.turnWhenGoingInTheRightDirection * settings.turnRate * state.deltaTime;
  } else if weightLeft < weightRight {
    rotation = -min(settings.sensorAngle, settings.turnRate * state.deltaTime);
  } else if weightRight < weightLeft {
    rotation = min(settings.sensorAngle, settings.turnRate * state.deltaTime);
  } else {
    rotation = (random - 0.5) * settings.turnWhenLost * settings.turnRate * state.deltaTime;
  }

  let direction = vec2(cos(agent.angle), sin(agent.angle));
  var nextPosition = agent.position + direction * settings.moveRate * state.deltaTime;
  nextPosition = clamp(nextPosition, vec2<f32>(0, 0), state.size);
  if nextPosition.x == 0 || nextPosition.x == state.size.x || nextPosition.y == 0 || nextPosition.y == state.size.y {
    rotation = 3.14159265359 + random - 0.5;
  }

  var trail = vec4<f32>(settings.individualTrailWeight, 0, 0, 0);
  if isFromOddGeneration {
    trail = vec4(0, settings.individualTrailWeight, 0, 0);
  }

  var trailBelow = textureLoad(trailMapIn, vec2<i32>(agent.position), 0);

  if settings.radius > 0 && length(settings.center - agent.position) < settings.radius {
    agents[id].generation = settings.isNextGenerationOdd;
    
    // clear trail map below so the agent won't die immediately
    if (settings.isNextGenerationOdd == 1.0) {
      trailBelow.g += trailBelow.r;
      trailBelow.r = 0;
    } else {
      trailBelow.r += trailBelow.g;
      trailBelow.g = 0;
    }

    textureStore(trailMapOut, vec2<i32>(agent.position), trailBelow);
    return;
  }

  let next = vec4(trail.rgb + trailBelow.rgb, trailBelow.a);
  textureStore(trailMapOut, vec2<i32>(nextPosition), next);

  if isFromOddGeneration {
    if next.g < next.r && (isFromCurrentGeneration == 1.0 || (isFromCurrentGeneration == 0.0 && random < settings.deinfectionProbability)) {
      agent.generation = 0;
    }
  } else {
    if next.r < next.g && (isFromCurrentGeneration == 1.0 || (isFromCurrentGeneration == 0.0 && random < settings.deinfectionProbability)) {
      agent.generation = 1;
    }
  }

  agent.position = nextPosition;
  agent.angle += rotation;
  agents[id] = agent;
}

fn sense(agentPosition: vec2<f32>, agentAngle: f32, sensorOffset: f32, sensorOffsetAngle: f32) -> vec4<f32> {
  let sensorAngle = agentAngle + sensorOffsetAngle;
  let sensorDirection = vec2(cos(sensorAngle), sin(sensorAngle));
  let sensorPosition = vec2<i32>(agentPosition + sensorDirection * sensorOffset);
  return textureLoad(trailMapIn, sensorPosition, 0); 
}
