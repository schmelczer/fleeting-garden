struct ResizeSettings {
  scale: vec2<f32>,
  agentCount: u32,
};

@group(1) @binding(0) var<uniform> resizeSettings: ResizeSettings;

@compute @workgroup_size(agentWorkgroupSize)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>
) {
  let id = get_id(global_id);

  if id >= resizeSettings.agentCount {
    return;
  }

  let scale = resizeSettings.scale;
  agents[id].position = agents[id].position * scale;
  agents[id].targetPosition = agents[id].targetPosition * scale;
}
