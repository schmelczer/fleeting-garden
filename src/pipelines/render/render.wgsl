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

  let evenGenerationStrength = clamp(pow(traces.r, settings.clarity), 0, 1);
  let oddGenerationStrength = clamp(pow(traces.g, settings.clarity), 0, 1);
  let brushStrength = traces.a;

  let agentColor = step(evenGenerationStrength, oddGenerationStrength) * settings.oddGenerationColor * oddGenerationStrength + step(oddGenerationStrength, evenGenerationStrength) * settings.evenGenerationColor * evenGenerationStrength;
  let agentStrength = evenGenerationStrength + oddGenerationStrength;

  let rgbColor = sqrt(
    mix(agentColor, settings.brushColor * brushStrength, clamp(brushStrength - agentStrength, 0, 1))
  );
  return vec4(backgroundColor - rgbColor, 1);
}
