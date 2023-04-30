struct Settings {
  size: vec2<f32>,
  deltaTime: f32,
  time: f32,
  brushColor: vec3<f32>,
  speciesColorA: vec3<f32>,
  speciesColorB: vec3<f32>,
};

@group(0) @binding(0) var<uniform> settings: Settings;
@group(0) @binding(1) var Sampler: sampler;
@group(0) @binding(2) var trailMap: texture_2d<f32>;
@group(0) @binding(3) var noiseMap: texture_2d<f32>;

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let traces = textureSample(trailMap, Sampler, uv);
  let noise = textureSample(noiseMap, Sampler, uv);

  let speciesAStrength = traces.r;
  let speciesBStrength = traces.g;
  let brushStrength = traces.a;

  let rgbColor = sqrt(vec3(
    settings.speciesColorA * speciesAStrength +
    settings.speciesColorB * speciesBStrength +
    settings.brushColor * brushStrength
  ));


  let bg = vec3(0.9) + 0.2 * (noise.r - 0.5);
  
  
  return vec4(bg - rgbColor, 1);
}
