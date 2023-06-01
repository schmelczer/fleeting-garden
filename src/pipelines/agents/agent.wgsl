struct Settings {
  center: vec2<f32>,
  radius: f32,

  brushTrailWeight: f32,
  currentGenerationMoveRate: f32,
  turnRate: f32,

  sensorAngle: f32,
  sensorOffset: f32,

  currentGenerationAggression: f32,
  nextGenerationAggression: f32,
  nextGenerationSensorOffsetDistance: f32,
  nextGenerationMoveRate: f32,
  isNextGenerationOdd: f32,

  turnWhenLost: f32,
  individualTrailWeight: f32,
  infectionProbability: f32,

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
  let id = get_id(global_id, workgroup_count);

  if id >= u32(settings.agentCount) {
    return;
  }

  var agent = agents[id];

  let random = textureSampleLevel(
    noise,
    noiseSampler,
    vec2(
      f32(id) % 23647 / 2000,
      state.time % 3243 / 2000
    ),
    0
  );

  let isFromCurrentGeneration = abs(agent.generation - settings.isNextGenerationOdd);
  let isFromNextGeneration = 1.0 - isFromCurrentGeneration;
  let isFromOddGeneration = agent.generation % 2;

  let sensorOffset = mix(settings.sensorOffset, settings.nextGenerationSensorOffsetDistance, isFromNextGeneration); 
  let moveRate = mix(settings.currentGenerationMoveRate, settings.nextGenerationMoveRate, isFromNextGeneration); 
  let brushWeight = mix(settings.brushTrailWeight, 0, isFromNextGeneration);
  
  let trailForward = sense(agent.position, agent.angle, sensorOffset, 0);
  let trailLeft = sense(agent.position, agent.angle, sensorOffset, settings.sensorAngle);
  let trailRight = sense(agent.position, agent.angle, sensorOffset, -settings.sensorAngle);

  var weightForward = brushWeight * trailForward.a;
  var weightLeft = brushWeight * trailLeft.a;
  var weightRight = brushWeight * trailRight.a;

  let agression = mix(settings.currentGenerationAggression, settings.nextGenerationAggression, isFromNextGeneration) + weightForward; 

  weightForward += mix(trailForward.r + agression * trailForward.g, trailForward.g + agression * trailForward.r, isFromOddGeneration);
  weightLeft += mix(trailLeft.r + agression * trailLeft.g, trailLeft.g + agression * trailLeft.r, isFromOddGeneration);
  weightRight += mix(trailRight.r + agression * trailRight.g, trailRight.g + agression * trailRight.r, isFromOddGeneration);
  
  var rotation: f32;
  if weightForward >= weightLeft && weightForward >= weightRight {
    rotation = 0;
  } else {
    rotation = sign(weightLeft - weightRight) * settings.turnRate;
  }

  let nextPosition = clamp(
    agent.position + vec2(cos(agent.angle), sin(agent.angle)) * moveRate,
    vec2<f32>(0, 0),
    state.size
  );
  if nextPosition.x == 0 || nextPosition.x == state.size.x || nextPosition.y == 0 || nextPosition.y == state.size.y {
    rotation = 3.14159265359 + random.a - 0.5;
  }

  var trail = vec4<f32>(settings.individualTrailWeight, 0, 0, 0);
  if isFromOddGeneration == 1.0 {
    trail = vec4<f32>(0, settings.individualTrailWeight, 0, 0);
  }

  var trailBelow = textureLoad(trailMapIn, vec2<i32>(nextPosition), 0);

  agent.angle += rotation;
  trailBelow += trail;

  if settings.radius > 0 && length(settings.center - agent.position) < settings.radius {
    agent.generation = settings.isNextGenerationOdd;
    
    // clear trail map below so the agent won't die immediately
    // trailBelow.r = (1 - settings.isNextGenerationOdd) * (trailBelow.r + trailBelow.g);
    // trailBelow.g = settings.isNextGenerationOdd * (trailBelow.r + trailBelow.g);
  } else {
    let relativeWeight = mix(trailBelow.g - trailBelow.r, trailBelow.r - trailBelow.g, isFromOddGeneration);
    if (relativeWeight > 0 && (
        (isFromCurrentGeneration == 1.0 && trailBelow.a == 0 && random.b < settings.infectionProbability)
     || (isFromCurrentGeneration == 0.0 && trailBelow.a > 0)
    )) || (trailBelow.a > 0 && isFromCurrentGeneration == 0.0){
      // trailBelow.r = isFromOddGeneration * (trailBelow.r + trailBelow.g);
      // trailBelow.g = (1 - isFromOddGeneration) * (trailBelow.r + trailBelow.g);
      agent.generation = (agent.generation + 1) % 2;
    }
  }

  textureStore(trailMapOut, vec2<i32>(nextPosition), trailBelow);
  agent.position = nextPosition;
  agents[id] = agent;
}

fn sense(agentPosition: vec2<f32>, agentAngle: f32, sensorOffset: f32, sensorOffsetAngle: f32) -> vec4<f32> {
  let sensorAngle = agentAngle + sensorOffsetAngle;
  let sensorPosition = vec2<i32>(agentPosition + vec2(cos(sensorAngle), sin(sensorAngle)) * sensorOffset);
  return textureLoad(trailMapIn, sensorPosition, 0); 
}
