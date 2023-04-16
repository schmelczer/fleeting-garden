@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var TargetTexture : texture_2d<f32>;


@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return textureSample(TargetTexture, mySampler, uv) * 10.0;
}
