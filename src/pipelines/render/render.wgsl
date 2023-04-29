struct Settings {
  size: vec2<f32>,
  deltaTime: f32,
  time: f32,
  brushColor: vec3<f32>,
  speciesColorA: vec3<f32>,
  speciesColorB: vec3<f32>,
};

@group(0) @binding(0) var<uniform> settings: Settings;
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var TargetTexture: texture_2d<f32>;

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let traces = textureSample(TargetTexture, mySampler, uv);

  let speciesAStrength = traces.r;
  let speciesBStrength = traces.g;
  let brushStrength = traces.a;
  return vec4(
    settings.speciesColorA * speciesAStrength +
    settings.speciesColorB * speciesBStrength +
    settings.brushColor * brushStrength,
    1
  );
}
