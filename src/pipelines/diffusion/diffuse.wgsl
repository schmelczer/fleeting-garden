struct Settings {
  size: vec2<f32>,
  deltaTime: f32,
  time: f32,
  
  diffusionRate: f32,
  decayRate: f32,
};

@group(0) @binding(0) var<uniform> settings: Settings;
@group(0) @binding(1) var Sampler: sampler;
@group(0) @binding(2) var trailMap: texture_2d<f32>;

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var current = textureSample(trailMap, Sampler, uv);
  
  let neighbours: vec4<f32> = (
      textureSample(trailMap, Sampler, uv + vec2<f32>(0, 1) / settings.size)
    + textureSample(trailMap, Sampler, uv + vec2<f32>(0, -1) / settings.size)
    + textureSample(trailMap, Sampler, uv + vec2<f32>(-1, 0) / settings.size)
    + textureSample(trailMap, Sampler, uv + vec2<f32>(1, 0) / settings.size)
  ) / 4;

  let mixed = mix(
    current,
    neighbours,
    settings.diffusionRate
  ) * (1.0 - settings.decayRate);

  return clamp(mixed, vec4(0), vec4(1));
}
