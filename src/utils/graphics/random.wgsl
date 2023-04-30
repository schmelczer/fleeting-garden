fn random_with_seed(uv: vec2<f32>, seed: f32) -> f32 {
  return fract(sin(dot(uv, vec2(12.9898 + seed, 78.233 + seed)))* 43758.5453123 + seed);
}

fn random(uv: vec2<f32>) -> f32 {
  return fract(sin(dot(uv, vec2(12.9898, 78.233)))* 43758.5453123);
}
