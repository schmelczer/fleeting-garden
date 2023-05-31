struct Agent {
  position: vec2<f32>,
  angle: f32,
  generation: f32,
}

@group(1) @binding(1) var<storage, read_write> agents: array<Agent>;

fn get_id(global_id: vec3<u32>,  workgroup_count: vec3<u32>) -> u32 {
  return global_id.x + global_id.y * (workgroup_count.x * 64) + global_id.z * (workgroup_count.x * workgroup_count.y * 64);
}    
