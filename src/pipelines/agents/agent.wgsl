const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
const INV_TAU: f32 = 0.15915494309;

const CHANNEL_MASKS = array<vec3<f32>, 3>(
  vec3<f32>(1.0, 0.0, 0.0),
  vec3<f32>(0.0, 1.0, 0.0),
  vec3<f32>(0.0, 0.0, 1.0),
);

struct Settings {
  // Columns are indexed by source colorIndex; each column holds the per-target
  // weights (colorXToColor1, colorXToColor2, colorXToColor3).
  reactionMatrix: mat3x3<f32>,
  moveRate: f32,
  turnRate: f32,
  sensorAngleSin: f32,
  sensorAngleCos: f32,
  sensorOffset: f32,
  turnWhenLost: f32,
  individualTrailWeight: f32,
  agentCount: u32,
  introProgress: f32,
  forwardRotationScale: f32,
  introNearDistanceInner: f32,
  introNearDistanceMin: f32,
  introNearSensorOffsetMultiplier: f32,
  introTargetAngleBlend: f32,
  introProgressCutoff: f32,
  introTurnRateMultiplier: f32,
  introRandomTurnMultiplier: f32,
  introMoveRate: f32,
  introStepStopDistance: f32,
  randomTimeSeed: u32,
};

@group(1) @binding(0) var<uniform> settings: Settings;
@group(1) @binding(2) var trailMapIn: texture_2d<f32>;
@group(1) @binding(3) var trailMapOut: texture_storage_2d<rgba8unorm, write>;

struct AgentMovement {
  rotation: f32,
  step: vec2<f32>,
}

@compute @workgroup_size(agentWorkgroupSize)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>
) {
  let id = get_id(global_id);

  if id >= settings.agentCount {
    return;
  }

  let colorIndex = agents[id].colorIndex;
  if colorIndex < 0.0 || colorIndex >= 2.5 {
    return;
  }

  let position = agents[id].position;
  let angle = agents[id].angle;
  var targetPosition = vec2<f32>(-1.0, -1.0);
  var hasIntroTarget = false;
  if settings.introProgress < settings.introProgressCutoff {
    targetPosition = agents[id].targetPosition;
    hasIntroTarget = targetPosition.x >= 0.0 && targetPosition.y >= 0.0;
    if hasIntroTarget && settings.introProgress < agents[id].introDelay {
      return;
    }
  }

  let channelMask = get_channel_mask(colorIndex);
  let reactionMask = get_reaction_mask(colorIndex);
  let randomSeed = random_seed(id);
  let maxPosition = state.size - vec2<f32>(1.0, 1.0);

  var movement = AgentMovement(0.0, vec2<f32>(0.0, 0.0));
  if hasIntroTarget {
    movement = intro_decide(id, position, angle, targetPosition, randomSeed);
  } else {
    movement = steady_decide(position, angle, reactionMask, randomSeed, maxPosition);
  }

  agent_finalize(id, position, angle, channelMask, randomSeed, maxPosition, movement);
}

// Steady-state-only entry point used after introProgress >= introProgressCutoff.
// Drops the intro target reads, atan2/smoothstep math, and introDelay check —
// once intro completes those paths are dead for the rest of the session.
@compute @workgroup_size(agentWorkgroupSize)
fn mainSteady(
  @builtin(global_invocation_id) global_id: vec3<u32>
) {
  let id = get_id(global_id);

  if id >= settings.agentCount {
    return;
  }

  let colorIndex = agents[id].colorIndex;
  if colorIndex < 0.0 || colorIndex >= 2.5 {
    return;
  }

  let position = agents[id].position;
  let angle = agents[id].angle;
  let channelMask = get_channel_mask(colorIndex);
  let reactionMask = get_reaction_mask(colorIndex);
  let randomSeed = random_seed(id);
  let maxPosition = state.size - vec2<f32>(1.0, 1.0);

  let movement = steady_decide(position, angle, reactionMask, randomSeed, maxPosition);
  agent_finalize(id, position, angle, channelMask, randomSeed, maxPosition, movement);
}

fn steady_decide(
  position: vec2<f32>,
  angle: f32,
  reactionMask: vec3<f32>,
  randomSeed: u32,
  maxPosition: vec2<f32>
) -> AgentMovement {
  let randomTurn = random_float(randomSeed);
  let direction = vec2(cos(angle), sin(angle));

  let forwardSensor = sensor_position(position, direction, settings.sensorOffset, maxPosition);
  let leftSensor = sensor_position(
    position,
    rotate_direction(direction, settings.sensorAngleSin, settings.sensorAngleCos),
    settings.sensorOffset,
    maxPosition
  );
  let rightSensor = sensor_position(
    position,
    rotate_direction(direction, -settings.sensorAngleSin, settings.sensorAngleCos),
    settings.sensorOffset,
    maxPosition
  );

  let trailForward = textureLoad(trailMapIn, forwardSensor, 0);
  let trailLeft = textureLoad(trailMapIn, leftSensor, 0);
  let trailRight = textureLoad(trailMapIn, rightSensor, 0);

  let weightForward = dot(trailForward.rgb, reactionMask);
  let weightLeft = dot(trailLeft.rgb, reactionMask);
  let weightRight = dot(trailRight.rgb, reactionMask);

  var rotation = (randomTurn - 0.5) * settings.turnWhenLost;
  if weightForward >= weightLeft && weightForward >= weightRight {
    rotation = rotation * settings.forwardRotationScale;
  } else {
    rotation += sign(weightLeft - weightRight) * settings.turnRate;
  }

  return AgentMovement(rotation, direction * settings.moveRate);
}

fn intro_decide(
  id: u32,
  position: vec2<f32>,
  angle: f32,
  targetPosition: vec2<f32>,
  randomSeed: u32
) -> AgentMovement {
  let introTargetOffset = targetPosition - position;
  let introTargetDistance = length(introTargetOffset);
  let targetAngle = atan2(introTargetOffset.y, introTargetOffset.x);
  let nearTitle = 1.0 - smoothstep(
    settings.introNearDistanceInner,
    max(
      settings.introNearDistanceMin,
      settings.sensorOffset * settings.introNearSensorOffsetMultiplier
    ),
    introTargetDistance
  );
  let desiredAngle = mix(
    targetAngle,
    agents[id].targetAngle,
    nearTitle * settings.introTargetAngleBlend
  );
  let introTurn = angle_delta(angle, desiredAngle);

  let rotation = clamp(
      introTurn,
      -settings.turnRate * settings.introTurnRateMultiplier,
      settings.turnRate * settings.introTurnRateMultiplier
    )
    + (random_float(randomSeed + 1013904223u) - 0.5) *
      settings.turnWhenLost *
      settings.introRandomTurnMultiplier;
  let moveRate = min(settings.introMoveRate, introTargetDistance);
  var step = vec2<f32>(0.0, 0.0);
  if introTargetDistance > settings.introStepStopDistance {
    step = introTargetOffset / introTargetDistance * moveRate;
  }
  return AgentMovement(rotation, step);
}

fn agent_finalize(
  id: u32,
  position: vec2<f32>,
  angle: f32,
  channelMask: vec3<f32>,
  randomSeed: u32,
  maxPosition: vec2<f32>,
  movement: AgentMovement
) {
  let nextPosition = clamp(position + movement.step, vec2<f32>(0, 0), maxPosition);
  var rotation = movement.rotation;
  if nextPosition.x == 0 || nextPosition.x == maxPosition.x || nextPosition.y == 0 || nextPosition.y == maxPosition.y {
    rotation = PI + random_float(randomSeed + 22695477u) - 0.5;
  }

  // Writes only this agent's last-writer-wins deposit into a per-frame-cleared
  // depositMap. Storage textures do not blend concurrent compute writes, so
  // overlapping agents intentionally collapse to whichever write wins. The
  // diffusion pass then sums trailMap + depositMap at tile-load time. The
  // rgba8unorm alpha lane is unused, so deposits leave it at zero.
  textureStore(
    trailMapOut,
    vec2<i32>(nextPosition),
    vec4<f32>(channelMask * settings.individualTrailWeight, 0.0)
  );
  agents[id].angle = angle + rotation;
  agents[id].position = nextPosition;
}

fn sensor_position(
  agentPosition: vec2<f32>,
  direction: vec2<f32>,
  sensorOffset: f32,
  maxPosition: vec2<f32>
) -> vec2<i32> {
  return vec2<i32>(clamp(
    agentPosition + direction * sensorOffset,
    vec2<f32>(0, 0),
    maxPosition
  ));
}

fn rotate_direction(direction: vec2<f32>, angleSin: f32, angleCos: f32) -> vec2<f32> {
  return vec2<f32>(
    direction.x * angleCos - direction.y * angleSin,
    direction.x * angleSin + direction.y * angleCos
  );
}

fn get_channel_mask(colorIndex: f32) -> vec3<f32> {
  return CHANNEL_MASKS[u32(clamp(colorIndex, 0.0, 2.0))];
}

fn get_reaction_mask(colorIndex: f32) -> vec3<f32> {
  return settings.reactionMatrix[u32(clamp(colorIndex, 0.0, 2.0))];
}

fn angle_delta(sourceAngle: f32, targetAngle: f32) -> f32 {
  // Wraps to (-π, π] via fract(); replaces atan2(sin(d), cos(d)).
  return (fract((targetAngle - sourceAngle) * INV_TAU + 0.5) - 0.5) * TAU;
}

fn random_seed(id: u32) -> u32 {
  return id * 747796405u + settings.randomTimeSeed * 2891336453u;
}

fn random_float(seed: u32) -> f32 {
  return f32(hash_u32(seed) >> 8u) * (1.0 / 16777216.0);
}

fn hash_u32(seed: u32) -> u32 {
  let value = seed * 747796405u + 2891336453u;
  let word = ((value >> ((value >> 28u) + 4u)) ^ value) * 277803737u;
  return (word >> 22u) ^ word;
}
