struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vertex(@location(0) uv: vec2<f32>) -> VertexOutput {
  let ndc = uv * sourceScaler * vec2(2) - vec2(1);
  return VertexOutput(vec4(ndc.x, -ndc.y, 0, 1), uv);
}

@group(0) @binding(0) var<uniform> sourceScaler: vec2<f32>;
@group(0) @binding(1) var Sampler: sampler;
@group(0) @binding(2) var original: texture_2d<f32>;

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return textureSample(original, Sampler, uv);
}
