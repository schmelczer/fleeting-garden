struct Settings {
  size : vec2<f32>,
  swipePrevious : vec2<f32>,
  swipeCurrent : vec2<f32>,
  diffusionRate : f32,
  decayRate : f32,
  deltaTime : f32,
  time : f32,
  swipeRadius : f32,
  swipeBlur : f32,
  isSwipeActive : f32
};

@group(0) @binding(0) var<uniform> settings : Settings;
@group(0) @binding(1) var Sampler: sampler;
@group(0) @binding(2) var trailMap : texture_2d<f32>;

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var current = textureSample(trailMap, Sampler, uv);
  
  let neighbours: vec4<f32> = (
      textureSample(trailMap, Sampler, uv + vec2<f32>(0, 1) / settings.size)
    + textureSample(trailMap, Sampler, uv + vec2<f32>(0, -1) / settings.size)
    + textureSample(trailMap, Sampler, uv + vec2<f32>(-1, 0) / settings.size)
    + textureSample(trailMap, Sampler, uv + vec2<f32>(1, 0) / settings.size)
  );

  if (settings.isSwipeActive == 1.0) {
    let pa = (uv - settings.swipePrevious) * normalize(settings.size);
    let direction = (settings.swipeCurrent - settings.swipePrevious) * normalize(settings.size);
    let q = clamp(dot(pa, direction) / dot(direction, direction), 0, 1);
    let distance = length(pa - direction * q) - settings.swipeRadius;
  
    if(distance < 0) {
      let opacity = -distance / settings.swipeBlur;
      return clamp(vec4(1), current, vec4(1));
    }
  }

  return mix(
    current,
    neighbours / 4.0,
    settings.diffusionRate
  ) * (1.0 - settings.decayRate);
}
