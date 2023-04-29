struct Settings {
  size: vec2<f32>,
  deltaTime: f32,
  time: f32,
  
  diffusionRateTrails: f32,
  decayRateTrails: f32,
  diffusionRateBrush: f32,
  decayRateBrush: f32,
};

@group(0) @binding(0) var<uniform> settings: Settings;
@group(0) @binding(1) var Sampler: sampler;
@group(0) @binding(2) var trailMap: texture_2d<f32>;
@group(0) @binding(3) var noise: texture_2d<f32>;

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var current = textureSample(trailMap, Sampler, uv);
  let noise = textureSample(noise, Sampler, uv);

  let neighbours: vec4<f32> = (
      textureSample(trailMap, Sampler, uv + vec2<f32>(0, 1) / settings.size)
    + textureSample(trailMap, Sampler, uv + vec2<f32>(0, -1) / settings.size)
    + textureSample(trailMap, Sampler, uv + vec2<f32>(-1, 0) / settings.size)
    + textureSample(trailMap, Sampler, uv + vec2<f32>(1, 0) / settings.size)
  ) / 4;

  let mixedTrails = mix(
    current.rgb,
    neighbours.rgb,
    settings.diffusionRateTrails + (noise.rgb - vec3(0.5)) * 0.1
  ) * (1.0 - settings.decayRateTrails);

  let mixedBrush = mix(
    current.a,
    neighbours.a,
    settings.diffusionRateBrush + (noise.a - 0.5) * 0.5
  ) * (1.0 - settings.decayRateBrush  - (noise.a - 0.5) * 0.1);


  return clamp(vec4(mixedTrails, mixedBrush), vec4(0), vec4(1));
}
