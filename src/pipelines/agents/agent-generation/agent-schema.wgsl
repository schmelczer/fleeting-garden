struct Agent {
  position: vec2<f32>,
  angle: f32,
  colorIndex: f32,
  targetPosition: vec2<f32>,
  targetAngle: f32,
  introDelay: f32,
}

@group(1) @binding(1) var<storage, read_write> agents: array<Agent>;

const agentWorkgroupSize = __AGENT_WORKGROUP_SIZE__u;

fn get_id(global_id: vec3<u32>) -> u32 {
  return global_id.x;
}
