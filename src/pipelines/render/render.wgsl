struct Settings {
  brushColor: vec3<f32>,
  evenGenerationColor: vec3<f32>,
  oddGenerationColor: vec3<f32>,
  clarity: f32,
};

@group(1) @binding(0) var<uniform> settings: Settings;
@group(1) @binding(1) var Sampler: sampler;
@group(1) @binding(2) var trailMap: texture_2d<f32>;

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let traces = textureSample(trailMap, Sampler, uv);
  let random = textureSample(noise, noiseSampler, uv);

  let backgroundColor = vec3(0.9) + 0.075 * random.r;

  let evenGenerationStrength = clarity(traces.r);
  let oddGenerationStrength = clarity(traces.g);
  let brushStrength = traces.a;

  let color = max(
    mix(
      evenGenerationStrength * settings.evenGenerationColor,
      oddGenerationStrength * settings.oddGenerationColor,
      oddGenerationStrength / (evenGenerationStrength + oddGenerationStrength + 0.000001)
    ),
    brushStrength * settings.brushColor);

  let strength = max(evenGenerationStrength, max(oddGenerationStrength, brushStrength));

  return vec4(mix(backgroundColor, color, strength), 1);
}

fn clarity(strength: f32) -> f32 {
  return sign(strength);
}
