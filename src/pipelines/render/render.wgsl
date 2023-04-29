struct Settings {
  size: vec2<f32>,
  deltaTime: f32,
  time: f32,
};

@group(0) @binding(0) var<uniform> settings: Settings;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var TargetTexture: texture_2d<f32>;

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return vec4(textureSample(TargetTexture, mySampler, uv).rgb, 1.0);
  return vec4(0, settings.deltaTime * 0.0, 0.0, 1.0);
}
