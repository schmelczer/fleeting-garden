fn random_with_seed(uv: vec2<f32>, seed: f32) -> f32 {
  return fract(sin(dot(uv, vec2(12.9898 + seed, 78.233 + seed)))* 43758.5453123 + seed);
}

fn random(uv: vec2<f32>) -> f32 {
  return fract(sin(dot(uv, vec2(12.9898, 78.233)))* 43758.5453123);
}

fn hash(state0 : u32) -> f32 {
  var state : u32 = state0;
  state = state ^ 2747636419u;
  state = state * 2654435769u;
  state = state ^ (state >> 16u);
  state = state * 2654435769u;
  state = state ^ (state >> 16u);
  state = state * 2654435769u;
  return f32(state) / 4294967295.0;
}
