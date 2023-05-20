struct Settings {
  diffusionRateTrails: f32,
  decayRateTrails: f32,
  diffusionRateBrush: f32,
  decayRateBrush: f32,
};

@group(1) @binding(0) var<uniform> settings: Settings;
@group(1) @binding(1) var Sampler: sampler;
@group(1) @binding(2) var trailMap: texture_2d<f32>;

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var current = textureSample(trailMap, Sampler, uv);
  var change = vec4<f32>(0);
  for (var x: i32 = -1; x <= 1; x++) {
    for (var y: i32 = -1; y <= 1; y++) {
      if (x != 0 || y != 0) {
        let offset = vec2(f32(x), f32(y));
        let neighbour = textureSample(trailMap, Sampler, uv + offset / state.size);
        let random = textureSample(noise, noiseSampler, uv + offset / state.size * 0.5).r;
        
        let difference = clamp(neighbour - current, vec4(0), vec4(1));
        change += vec4(
          length(neighbour.rgb) * pow(random, settings.diffusionRateTrails) * difference.rgb,
          min(1.0, length(neighbour.a)) * pow(random, settings.diffusionRateBrush) * difference.a
        );
      }
    }
  }

  current += change / 4;

  let decayed = vec4(
    current.rgb * settings.decayRateTrails,
    current.a * settings.decayRateBrush
  );
 
  return decayed;
}
