struct Settings {
  inverseDiffusionRateTrails: f32,
  decayRateTrails: f32,
  inverseDiffusionRateBrush: f32,
  decayRateBrush: f32,
};


@group(1) @binding(0) var<uniform> settings: Settings;
@group(1) @binding(1) var Sampler: sampler;
@group(1) @binding(2) var trailMap: texture_2d<f32>;


@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var current = textureSample(trailMap, Sampler, uv);

  current += (
        propagate(uv, vec2(-1.0, -1.0), current)
      + propagate(uv, vec2(-1.0, 1.0), current)
      + propagate(uv, vec2(1.0, -1.0), current)
      + propagate(uv, vec2(1.0, 1.0), current)

      + propagate(uv, vec2(-1.0, 0.0), current)
      + propagate(uv, vec2(0.0, -1.0), current)
      + propagate(uv, vec2(1.0, 0.0), current)
      + propagate(uv, vec2(0.0, 1.0), current)
  ) / 8;

  let decayed = clamp(vec4(
    current.rgb * settings.decayRateTrails,
    max(0, current.a + (current.a - 1.001) * settings.decayRateBrush)
  ), vec4(0), vec4(1));
 
  return decayed;
}


fn propagate(uv: vec2<f32>, offset: vec2<f32>, currentColor: vec4<f32>) -> vec4<f32> {
  let neighbour = textureSample(trailMap, Sampler, uv + offset / state.size);
  var random = textureSample(noise, noiseSampler, uv + offset / state.size * 0.5).r;
  let difference = clamp(neighbour - currentColor, vec4(0), vec4(1));

  return vec4(
    vec3(length(neighbour.rgb) * pow(random, settings.inverseDiffusionRateTrails)),
    length(neighbour.a) * pow(random, settings.inverseDiffusionRateBrush)
  ) * difference;
}
