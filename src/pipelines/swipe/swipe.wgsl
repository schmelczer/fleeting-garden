struct Settings {
  size : vec2<f32>,
  swipe : vec2<f32>,
  swipeRadius : f32,
  isSwipeActive : f32,
};

@group(0) @binding(0) var<uniform> settings : Settings;
@group(0) @binding(1) var Sampler: sampler;
@group(0) @binding(2) var trailMap : texture_2d<f32>;

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var current = textureSample(trailMap, Sampler, uv);
  
  if (
    settings.isSwipeActive == 1.0 &&
    length((uv - settings.swipe) * normalize(settings.size)) < settings.swipeRadius
  ) {
    current = vec4<f32>(1);
  }

  return current;
}
