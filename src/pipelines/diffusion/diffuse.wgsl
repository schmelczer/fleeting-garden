struct Settings {
  inverseDiffusionRateTrails: f32,
  decayRateTrails: f32,
  diffusionNeighborScale: f32,
  brushDecayAlphaMultiplier: f32,
  brushDecayAlphaSubtract: f32,
  padding0: f32,
  padding1: f32,
  padding2: f32,
};

const WORKGROUP_SIZE_X = __WORKGROUP_SIZE__u;
const WORKGROUP_SIZE_Y = __WORKGROUP_SIZE__u;
// Half a quantization step of rgba8unorm (1/255 ≈ 0.00392). Subtracted from
// RGB each frame so multiplicative decay can fall through the unorm
// quantization floor; without it, the smallest nonzero level (1/255) is a
// fixed point and trails never reach pure black.
const TRAIL_RGB_DECAY_SUBTRACT: f32 = 0.00196;
// One-pixel halo on each side so the 3x3 neighbourhood read in the main pass
// can be served from workgroup memory without bounds checks for interior tiles.
const TILE_SIZE_X = WORKGROUP_SIZE_X + 2u;
const TILE_SIZE_Y = WORKGROUP_SIZE_Y + 2u;
const TILE_TEXEL_COUNT = TILE_SIZE_X * TILE_SIZE_Y;
// 1.0 / 2^32, used to map a 32-bit hash to [0, 1).
const HASH_TO_UNIT_FLOAT: f32 = 2.3283064365386963e-10;

@group(0) @binding(0) var<uniform> settings: Settings;
@group(0) @binding(1) var trailMap: texture_2d<f32>;
@group(0) @binding(2) var trailMapOut: texture_storage_2d<rgba8unorm, write>;
// Per-frame deposit accumulator written sparsely by agents. Summed with
// trailMap at tile-load so deposits propagate through the diffusion kernel
// in the same frame.
@group(0) @binding(3) var depositMap: texture_2d<f32>;

var<workgroup> tile: array<vec4<f32>, TILE_TEXEL_COUNT>;
var<workgroup> tileTrailStrength: array<f32, TILE_TEXEL_COUNT>;

@compute @workgroup_size(__WORKGROUP_SIZE__, __WORKGROUP_SIZE__)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>,
  @builtin(workgroup_id) workgroup_id: vec3<u32>
) {
  let textureSize = vec2<i32>(textureDimensions(trailMap, 0));
  let textureBound = textureSize - vec2<i32>(1, 1);
  let localLinearIndex = local_id.y * WORKGROUP_SIZE_X + local_id.x;
  let workgroupOrigin = workgroup_id.xy * vec2<u32>(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y);

  for (var tileIndex = localLinearIndex; tileIndex < TILE_TEXEL_COUNT; tileIndex += WORKGROUP_SIZE_X * WORKGROUP_SIZE_Y) {
    let tilePosition = vec2<u32>(tileIndex % TILE_SIZE_X, tileIndex / TILE_SIZE_X);
    let sourcePixel = clamp(
      vec2<i32>(workgroupOrigin + tilePosition) - vec2<i32>(1, 1),
      vec2<i32>(0, 0),
      textureBound
    );
    let texel = textureLoad(trailMap, sourcePixel, 0)
      + textureLoad(depositMap, sourcePixel, 0);
    tile[tileIndex] = texel;
    tileTrailStrength[tileIndex] = length(texel.rgb);
  }

  workgroupBarrier();

  let pixel = vec2<i32>(i32(global_id.x), i32(global_id.y));
  if pixel.x >= textureSize.x || pixel.y >= textureSize.y {
    return;
  }

  let centerTilePosition = local_id.xy + vec2<u32>(1u, 1u);
  let c = centerTilePosition.y * TILE_SIZE_X + centerTilePosition.x;
  let rowNorth = c - TILE_SIZE_X;
  let rowSouth = c + TILE_SIZE_X;

  // Batch-load all 8 neighbour texels and strengths into registers up front
  // so the compiler can schedule LDS reads in parallel.
  let current = tile[c];
  let nTL = tile[rowNorth - 1u];
  let nT  = tile[rowNorth];
  let nTR = tile[rowNorth + 1u];
  let nL  = tile[c - 1u];
  let nR  = tile[c + 1u];
  let nBL = tile[rowSouth - 1u];
  let nB  = tile[rowSouth];
  let nBR = tile[rowSouth + 1u];

  let sTL = tileTrailStrength[rowNorth - 1u];
  let sT  = tileTrailStrength[rowNorth];
  let sTR = tileTrailStrength[rowNorth + 1u];
  let sL  = tileTrailStrength[c - 1u];
  let sR  = tileTrailStrength[c + 1u];
  let sBL = tileTrailStrength[rowSouth - 1u];
  let sB  = tileTrailStrength[rowSouth];
  let sBR = tileTrailStrength[rowSouth + 1u];

  let random = random_from_pixel(pixel);
  let trailWeight = diffusion_weight(random, settings.inverseDiffusionRateTrails);

  let propagated =
      propagate_value(nTL, sTL, current, trailWeight)
    + propagate_value(nT,  sT,  current, trailWeight)
    + propagate_value(nTR, sTR, current, trailWeight)
    + propagate_value(nL,  sL,  current, trailWeight)
    + propagate_value(nR,  sR,  current, trailWeight)
    + propagate_value(nBL, sBL, current, trailWeight)
    + propagate_value(nB,  sB,  current, trailWeight)
    + propagate_value(nBR, sBR, current, trailWeight);

  let updated = current + propagated * settings.diffusionNeighborScale;
  let decayed = clamp(vec4(
    updated.rgb * settings.decayRateTrails - vec3(TRAIL_RGB_DECAY_SUBTRACT),
    updated.a * settings.brushDecayAlphaMultiplier - settings.brushDecayAlphaSubtract
  ), vec4(0), vec4(1));

  textureStore(trailMapOut, pixel, decayed);
}

fn propagate_value(
  neighbour: vec4<f32>,
  neighbourStrength: f32,
  current: vec4<f32>,
  trailWeight: f32
) -> vec4<f32> {
  let difference = clamp(neighbour - current, vec4(0), vec4(1));
  return vec4(
    vec3(neighbourStrength * trailWeight),
    neighbour.a * trailWeight
  ) * difference;
}

fn random_from_pixel(pixel: vec2<i32>) -> f32 {
  let p = vec2<u32>(pixel);
  var hash = p.x * 1664525u + p.y * 1013904223u + 374761393u;
  hash = (hash ^ (hash >> 16u)) * 2246822519u;
  hash = (hash ^ (hash >> 13u)) * 3266489917u;
  hash = hash ^ (hash >> 16u);
  return f32(hash) * HASH_TO_UNIT_FLOAT;
}

// Approximates pow(r, inverseRate) piecewise between powers (r, r^2, r^4, r^8, r^16)
// so we can vary diffusion sharpness without paying for a real pow() per pixel.
fn diffusion_weight(
  r: f32,
  inverseRate: f32
) -> f32 {
  if inverseRate < 1.0 {
    let rootApproximation = r / max(0.5 + r * 0.5, 0.0001);
    return mix(
      rootApproximation,
      r,
      clamp((inverseRate - 0.5) * 2.0, 0.0, 1.0)
    );
  }
  let r2 = r * r;
  if inverseRate < 2.0 {
    return mix(r, r2, inverseRate - 1.0);
  }
  let r4 = r2 * r2;
  if inverseRate < 4.0 {
    // (inverseRate - 2.0) / (4.0 - 2.0)
    return mix(r2, r4, (inverseRate - 2.0) * 0.5);
  }
  let r8 = r4 * r4;
  if inverseRate < 8.0 {
    // (inverseRate - 4.0) / (8.0 - 4.0)
    return mix(r4, r8, (inverseRate - 4.0) * 0.25);
  }
  let r16 = r8 * r8;
  // (inverseRate - 8.0) / (16.0 - 8.0); past 16, falls off as 16/inverseRate.
  return mix(r8, r16, clamp((inverseRate - 8.0) * 0.125, 0.0, 1.0))
    * min(1.0, 16.0 / inverseRate);
}
