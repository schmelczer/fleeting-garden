struct Settings {
  brushTrailWeight: f32,
  moveRate: f32,
  turnRate: f32,
  sensorAngle: f32,
  sensorOffset: f32,
  evenGenerationAggression: f32,
  oddGenerationAggression: f32,
  nextGenerationId: f32
};

@group(1) @binding(0) var<uniform> settings: Settings;
@group(1) @binding(2) var trailMapIn: texture_2d<f32>;
@group(1) @binding(3) var trailMapOut: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let id = global_id.x;

  if (id >= arrayLength(&agents)) {
    return;
  }

  var agent = agents[id];

  let random = hash(id + u32(state.time % 107 * 1673.7));
  let trailCurrent = textureLoad(trailMapIn, vec2<i32>(agent.position), 0);

  var weight: f32;

  // even generation id -> red channel
  // odd generation id -> green channel

  let isFromEvenGeneration = agent.generation % 2 == 0;
  
  let trailForward = sense(agent.position, agent.angle, settings.sensorOffset, 0);
  let trailLeft = sense(agent.position, agent.angle, settings.sensorOffset, settings.sensorAngle);
  let trailRight = sense(agent.position, agent.angle, settings.sensorOffset, -settings.sensorAngle);

  var weightForward: f32 = trailForward.a * settings.brushTrailWeight;
  var weightLeft: f32 = trailLeft.a * settings.brushTrailWeight;
  var weightRight: f32 = trailRight.a * settings.brushTrailWeight;
  if (isFromEvenGeneration) {
    weightForward += trailForward.r + settings.evenGenerationAggression * trailForward.g;
    weightLeft += trailLeft.r + settings.evenGenerationAggression * trailLeft.g;
    weightRight += trailRight.r + settings.evenGenerationAggression * trailRight.g;
  } else {
    weightForward += trailForward.g + settings.oddGenerationAggression * trailForward.r;
    weightLeft += trailLeft.g + settings.oddGenerationAggression * trailLeft.r;
    weightRight += trailRight.g + settings.oddGenerationAggression * trailRight.r;
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

  var trail = vec4<f32>(0, 0.1, 0, 0);
  if (isFromEvenGeneration) {
    trail = vec4(0.1, 0, 0, 0);
  }

  let current = textureLoad(trailMapIn, vec2<i32>(nextPosition), 0);
  let next = vec4(trail.rgb + current.rgb, current.a);
  textureStore(trailMapOut, vec2<i32>(nextPosition), next);

  
  if(isFromEvenGeneration) {
    if next.r < next.g {
      if agent.generation == settings.nextGenerationId {
        // agent.generation -= 1;
      } else {
        agent.generation += 1;
      }
    }
  } else {
    if next.g < next.r {
       if agent.generation == settings.nextGenerationId {
        // agent.generation -= 1;
      } else {
        agent.generation += 1;
      }
    }
  }

  agent.position = nextPosition;
  agent.angle = nextAngle;
  agents[id] = agent;
}

fn sense(agentPosition: vec2<f32>, agentAngle: f32, sensorOffset: f32, sensorOffsetAngle: f32) -> vec4<f32> {
  let sensorAngle = agentAngle + sensorOffsetAngle;
  let sensorDirection = vec2(cos(sensorAngle), sin(sensorAngle));
  let sensorPosition = vec2<i32>(agentPosition + sensorDirection * sensorOffset);
  return textureLoad(trailMapIn, sensorPosition, 0); 
}
