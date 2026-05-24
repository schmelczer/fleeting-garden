struct Settings {
  agentCount: u32,
  eraserMaskAlphaThreshold: f32,
  maskWidth: u32,
  maskHeight: u32,
  boundsMin: vec2<f32>,
  boundsMax: vec2<f32>,
};

@group(1) @binding(0) var<uniform> settings: Settings;
@group(1) @binding(2) var eraserMask: texture_2d<f32>;

@compute @workgroup_size(agentWorkgroupSize)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>
) {
  let id = get_id(global_id);

  if id >= settings.agentCount {
    return;
  }

  let colorIndex = agents[id].colorIndex;
  if colorIndex < 0.0 || colorIndex >= 2.5 {
    return;
  }

  let position = agents[id].position;
  if any(position < settings.boundsMin) || any(position > settings.boundsMax) {
    return;
  }

  let maskSize = vec2<i32>(i32(settings.maskWidth), i32(settings.maskHeight));
  let maskPosition = clamp(
    vec2<i32>(position),
    vec2<i32>(0, 0),
    maskSize - vec2<i32>(1, 1)
  );
  let maskSample = textureLoad(eraserMask, maskPosition, 0);

  if maskSample.r < settings.eraserMaskAlphaThreshold {
    agents[id].colorIndex = -1.0;
  }
}
