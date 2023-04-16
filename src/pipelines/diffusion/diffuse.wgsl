struct Settings {
  size : vec2<f32>,
  diffusionRate : f32,
  decayRate : f32,
  deltaTime : f32,
};

@group(0) @binding(0) var<uniform> settings : Settings;
@group(0) @binding(1) var Sampler: sampler;
@group(0) @binding(2) var trailMap : texture_2d<f32>;

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let current = textureSample(trailMap, Sampler, uv).rgb;

  let neighbours: vec3<f32> = (
      textureSample(trailMap, Sampler, uv + vec2<f32>(0, 1) / settings.size).rgb
    + textureSample(trailMap, Sampler, uv + vec2<f32>(0, -1) / settings.size).rgb
    + textureSample(trailMap, Sampler, uv + vec2<f32>(-1, 0) / settings.size).rgb
    + textureSample(trailMap, Sampler, uv + vec2<f32>(1, 0) / settings.size).rgb
  );

  return vec4(mix(
    current,
    neighbours / 4.0,
    settings.diffusionRate
  ) * (1.0 - settings.decayRate), 1.0);
}
