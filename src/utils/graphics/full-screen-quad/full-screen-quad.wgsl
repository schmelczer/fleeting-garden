struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
}

@vertex
fn vertex(
  @location(0) position : vec2<f32>,
  @location(1) uv : vec2<f32>
) -> VertexOutput {
  return VertexOutput(vec4(position, 0.0, 1.0), uv);
}
