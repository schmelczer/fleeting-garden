struct Settings {
  brushWidth: f32,
  brushWidthRandomness: f32
};

@group(1) @binding(0) var<uniform> settings: Settings;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) screenPosition: vec2<f32>,
  @location(1) start: vec2<f32>,
  @location(2) end: vec2<f32>
}

@vertex
fn vertex(
  @location(0) screenPosition: vec2<f32>,
  @location(1) @interpolate(flat) start: vec2<f32>,
  @location(2) @interpolate(flat) end: vec2<f32>
) -> VertexOutput {
  let uv = screenPosition / state.size;
  let position = uv * 2.0 - 1.0;
  return VertexOutput(vec4(position, 0.0, 1.0), screenPosition, start, end);
}

@fragment
fn fragment(
  @location(0) screenPosition: vec2<f32>,
  @location(1) start: vec2<f32>,
  @location(2) end: vec2<f32>
) -> @location(0) vec4<f32> {
    var distance = distanceFromLine(screenPosition, start, end);
    let noise = textureSample(noise, noiseSampler, screenPosition / state.size / 50);
    distance += noise.r * settings.brushWidthRandomness;

    if(distance > settings.brushWidth) {
      discard;
    }

    return vec4(0, 0, 0, 1);
}

fn distanceFromLine(position: vec2<f32>, start: vec2<f32>, end: vec2<f32>) -> f32 {
  let pa = position - start;
  let direction = end - start;
  let q = clamp(dot(pa, direction) / dot(direction, direction), 0, 1);
  return length(pa - direction * q);
}
