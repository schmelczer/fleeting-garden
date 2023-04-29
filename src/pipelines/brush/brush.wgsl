struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>
}

@vertex
fn vertex(
  @location(0) uv : vec2<f32>
) -> VertexOutput {
  let position = uv * 2.0 - 1.0;
  return VertexOutput(vec4(position, 0.0, 1.0), uv);
}

struct Settings {
  size : vec2<f32>,
  deltaTime : f32,
  time : f32
};

@group(0) @binding(0) var<uniform> settings : Settings;

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return vec4(1, settings.size.x  * 0, 0, 1);
}
