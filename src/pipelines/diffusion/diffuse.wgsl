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
@group(0) @binding(3) var noiseMap: texture_2d<f32>;

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var current = textureSample(trailMap, Sampler, uv);
  let noise = textureSample(noiseMap, Sampler, uv);

  let neighbours: vec4<f32> = (
      textureSample(trailMap, Sampler, uv + vec2<f32>(0, 1) / settings.size)
    + textureSample(trailMap, Sampler, uv + vec2<f32>(0, -1) / settings.size)
    + textureSample(trailMap, Sampler, uv + vec2<f32>(-1, 0) / settings.size)
    + textureSample(trailMap, Sampler, uv + vec2<f32>(1, 0) / settings.size)
  ) / 4;


    var q = vec4<f32>(0);
    for (var x: i32 = -1; x <= 1; x++) {
      for (var y: i32 = -1; y <= 1; y++) {
        if (x != 0 || y != 0) {
          let offset = vec2(f32(x), f32(y));
          let neighbour = textureSample(trailMap, Sampler, uv + offset / settings.size);
          // let noise = textureSample(noiseMap, Sampler, uv + offset / settings.size * 0.5).r;
          let noise = random(uv + offset / settings.size * 0.5);
          let difference = neighbour - current;

          q += vec4(
            min(1.0, length(neighbour.rgb)) * pow(noise, settings.diffusionRateTrails) * difference.rgb,
            min(1.0, length(neighbour.a)) * pow(noise, settings.diffusionRateBrush) * difference.a
          );
        }
      }
    }
    current += q / 4;

  let noise1 = random(uv);


  let decayed = vec4(
    current.rgb,
    current.a
  ) - vec4(vec3(settings.decayRateTrails), settings.decayRateBrush) * settings.deltaTime * ((noise1 - 0.5) * 0.25 + 1);
 
  return clamp(decayed, vec4(0), vec4(1));
}
