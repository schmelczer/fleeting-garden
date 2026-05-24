const SEGMENT_LENGTH_EPSILON: f32 = 0.0001;

struct Settings {
  brushRadius: f32,
  brushRadiusSquared: f32,
  // padding to 16-byte alignment for the following vec4
  _pad0: f32,
  _pad1: f32,
  brushValue: vec4<f32>,
  brushGrainNoiseScale: f32,
  brushGrainNoiseOffsetX: f32,
  brushGrainNoiseOffsetY: f32,
  brushDiscardThreshold: f32,
  brushGrainMinStrength: f32,
  brushGrainMaxStrength: f32,
};

@group(1) @binding(0) var<uniform> settings: Settings;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) screenPosition: vec2<f32>,
  @location(1) @interpolate(flat) start: vec2<f32>,
  @location(2) @interpolate(flat) direction: vec2<f32>,
  @location(3) @interpolate(flat) inverseLengthSquared: f32,
}

struct BrushTargets {
  @location(0) source: vec4<f32>,
}

@vertex
fn vertex(
  @builtin(vertex_index) vertexIndex: u32,
  @location(0) start: vec2<f32>,
  @location(1) end: vec2<f32>
) -> VertexOutput {
  let direction = end - start;
  let denominator = dot(direction, direction);
  var inverseLengthSquared = 0.0;
  var normalizedDirection = vec2<f32>(1.0, 0.0);
  if denominator > SEGMENT_LENGTH_EPSILON {
    inverseLengthSquared = 1.0 / denominator;
    normalizedDirection = direction * inverseSqrt(denominator);
  }
  let screenPosition = segment_vertex_position(vertexIndex, start, end, normalizedDirection, settings.brushRadius);
  let uv = screenPosition / state.size;
  let position = vec2(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  return VertexOutput(vec4(position, 0.0, 1.0), screenPosition, start, direction, inverseLengthSquared);
}

@fragment
fn fragment(
  @location(0) screenPosition: vec2<f32>,
  @location(1) @interpolate(flat) start: vec2<f32>,
  @location(2) @interpolate(flat) direction: vec2<f32>,
  @location(3) @interpolate(flat) inverseLengthSquared: f32
) -> BrushTargets {
  let strength = brushStrength(screenPosition, start, direction, inverseLengthSquared);

  if(strength < settings.brushDiscardThreshold) {
    discard;
  }

  let color = brushOutput(strength);
  return BrushTargets(color);
}

fn brushStrength(
  screenPosition: vec2<f32>,
  start: vec2<f32>,
  direction: vec2<f32>,
  inverseLengthSquared: f32
) -> f32 {
  let distanceSquared = distance_squared_from_segment(
    screenPosition,
    start,
    direction,
    inverseLengthSquared
  );
  if distanceSquared > settings.brushRadiusSquared {
    return 0.0;
  }

  let maxGrainStrength = max(settings.brushGrainMinStrength, settings.brushGrainMaxStrength);
  if maxGrainStrength < settings.brushDiscardThreshold {
    return 0.0;
  }

  // smoothstep(0.35, 1.0, sqrt(d²/r²)) reparameterized to squared distance:
  // squaring the edges gives smoothstep(0.1225·r², r², d²), avoiding the sqrt.
  let safeRadiusSquared = max(settings.brushRadiusSquared, 0.0001);
  let feather = 1.0 - smoothstep(0.1225 * safeRadiusSquared, safeRadiusSquared, distanceSquared);
  if feather <= 0.0 {
    return 0.0;
  }

  if settings.brushGrainMinStrength == settings.brushGrainMaxStrength {
    return settings.brushGrainMinStrength * feather;
  }

  let grainNoise = textureSampleLevel(
    noise,
    noiseSampler,
    screenPosition * settings.brushGrainNoiseScale +
      vec2(settings.brushGrainNoiseOffsetX, settings.brushGrainNoiseOffsetY),
    0.0
  ).r;
  let grainStrength = mix(
    settings.brushGrainMinStrength,
    settings.brushGrainMaxStrength,
    grainNoise
  );
  return grainStrength * feather;
}

fn brushOutput(strength: f32) -> vec4<f32> {
  return vec4(settings.brushValue.rgb * strength, settings.brushValue.a * strength);
}
