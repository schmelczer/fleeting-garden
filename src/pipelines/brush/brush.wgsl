struct Settings {
  size: vec2<f32>,
  deltaTime: f32,
  time: f32,
  brushWidth: f32,
  brushBlurWidth: f32
};

@group(0) @binding(0) var<uniform> settings: Settings;
@group(0) @binding(1) var Sampler: sampler;
@group(0) @binding(2) var noise: texture_2d<f32>;

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
  let uv = screenPosition / settings.size;
  let position = uv * 2.0 - 1.0;
  return VertexOutput(vec4(position, 0.0, 1.0), screenPosition, start, end);
}

@fragment
fn fragment(
  @location(0) screenPosition: vec2<f32>,
  @location(1) start: vec2<f32>,
  @location(2) end: vec2<f32>
) -> @location(0) vec4<f32> {
    let pa = (screenPosition - start);
    let direction = (end - start);
    let q = clamp(dot(pa, direction) / dot(direction, direction), 0, 1);
    let noise = textureSample(noise, Sampler, screenPosition / settings.size);

    let distance = length(pa - direction * q) + noise.r * 5;

    if(distance > settings.brushWidth) {
      discard;
    }

    let strength = clamp((settings.brushWidth - distance) / settings.brushBlurWidth, 0, 1);
    return vec4(0, 0, 0, strength);
}
