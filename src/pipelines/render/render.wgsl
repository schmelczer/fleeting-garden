struct Settings {
  brushColor: vec3<f32>,
  speciesColorA: vec3<f32>,
  speciesColorB: vec3<f32>,
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

  let speciesAStrength = traces.r;
  let speciesBStrength = traces.g;
  let brushStrength = traces.a;

  let rgbColor = sqrt(vec3(
    settings.speciesColorA * clamp(pow(speciesAStrength, settings.clarity), 0, 1) +
    settings.speciesColorB * clamp(pow(speciesBStrength, settings.clarity), 0, 1) +
    settings.brushColor * brushStrength
  ));

  return vec4(backgroundColor - rgbColor, 1);
}
