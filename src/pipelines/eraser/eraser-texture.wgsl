struct Settings {
  eraserRadiusSquared: f32,
  lineDistanceEpsilon: f32,
  clearRed: f32,
  clearGreen: f32,
  clearBlue: f32,
  clearAlpha: f32,
  eraserRadius: f32,
};

@group(1) @binding(0) var<uniform> settings: Settings;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) screenPosition: vec2<f32>,
  @location(1) @interpolate(flat) start: vec2<f32>,
  @location(2) @interpolate(flat) direction: vec2<f32>,
  @location(3) @interpolate(flat) inverseLengthSquared: f32,
}

struct EraserCombinedTargets {
  @location(0) mask: vec4<f32>,
  @location(1) source: vec4<f32>,
  @location(2) trail: vec4<f32>,
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
  if denominator > settings.lineDistanceEpsilon {
    inverseLengthSquared = 1.0 / denominator;
    normalizedDirection = direction * inverseSqrt(denominator);
  }
  let screenPosition = segment_vertex_position(vertexIndex, start, end, normalizedDirection, settings.eraserRadius);
  let uv = screenPosition / state.size;
  let position = vec2(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  return VertexOutput(vec4(position, 0.0, 1.0), screenPosition, start, direction, inverseLengthSquared);
}

@fragment
fn fragmentCombined(
  @location(0) screenPosition: vec2<f32>,
  @location(1) @interpolate(flat) start: vec2<f32>,
  @location(2) @interpolate(flat) direction: vec2<f32>,
  @location(3) @interpolate(flat) inverseLengthSquared: f32
) -> EraserCombinedTargets {
  let distanceSquared = distance_squared_from_segment(
    screenPosition,
    start,
    direction,
    inverseLengthSquared
  );
  if distanceSquared > settings.eraserRadiusSquared {
    discard;
  }

  let cleared = getEraserClearValue();
  return EraserCombinedTargets(getEraserMaskValue(), cleared, cleared);
}

fn getEraserMaskValue() -> vec4<f32> {
  return vec4<f32>(settings.clearAlpha, 0.0, 0.0, 1.0);
}

fn getEraserClearValue() -> vec4<f32> {
  return vec4<f32>(
    settings.clearRed,
    settings.clearGreen,
    settings.clearBlue,
    settings.clearAlpha
  );
}
