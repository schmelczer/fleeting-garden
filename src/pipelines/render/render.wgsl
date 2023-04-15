struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragUV : vec2<f32>,
}

@vertex
fn vertex(@builtin(vertex_index) i : u32) -> VertexOutput {
  var pos = array<vec2<f32>, 4>(
    vec2(-1.0, 1.0),
    vec2(-1.0, -1.0),
    vec2(1.0, 1.0),
    vec2(1.0, -1.0),
  );

  var output : VertexOutput;
  output.Position = vec4<f32>(pos[i], 0.0, 1.0);
  output.fragUV = output.Position.xy * 0.5 + 0.5;
  return output;
}


@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var TargetTexture : texture_2d<f32>;


@fragment
fn fragment(@location(0) fragUV: vec2<f32>) -> @location(0) vec4<f32> {
//   return vec4(1.0, 0.0, 0.0, 1.0);
  return textureSample(TargetTexture, mySampler, fragUV);
}
