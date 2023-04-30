override octaves: i32;
override amplitude: f32;
override gain: f32;
override lacunarity: f32;

override seedR: f32;
override seedG: f32;
override seedB: f32;
override seedA: f32;

@fragment
fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return vec4(
    fbm(uv, seedR),
    fbm(uv, seedG),
    fbm(uv, seedB),
    fbm(uv, seedA),
  );
}

fn fbm(uv: vec2<f32>, seed: f32) -> f32 {
  var st = uv;
  var v = 0.0;
  var a = amplitude;

  let shift = vec2(100.0);
  let rot = mat2x2(cos(0.5), sin(0.5),
                  -sin(0.5), cos(0.50));

  for (var i = 0; i < octaves; i++) {
    v += a * noise(st, seed);
    st *= rot * lacunarity;
    st += shift;
    a *= gain;
  }

  return v;
}

fn noise (st: vec2<f32>, seed: f32) -> f32 {
  let i = floor(st);
  let f = fract(st);

  let a = random_with_seed(i, seed);
  let b = random_with_seed(i + vec2(1.0, 0.0), seed);
  let c = random_with_seed(i + vec2(0.0, 1.0), seed);
  let d = random_with_seed(i + vec2(1.0, 1.0), seed);

  let u = f * f * (3.0 - 2.0 * f);

  return mix(a, b, u.x) +
          (c - a)* u.y * (1.0 - u.x) +
          (d - b) * u.x * u.y;
}
