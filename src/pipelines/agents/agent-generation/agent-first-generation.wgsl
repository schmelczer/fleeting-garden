@compute @workgroup_size(64)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(num_workgroups) workgroup_count: vec3<u32>
) {
  let id = global_id.x + global_id.y * (workgroup_count.x * 64) + global_id.z * (workgroup_count.x * workgroup_count.y * 64);

  if id >= arrayLength(&agents) {
    return;
  }

  let random = textureSampleLevel(
    noise,
    noiseSampler,
    vec2(f32(id % 1999) / 2000, f32(id) / 1999 / 2000),
    0
  );

  let position = random.xy * state.size;
  let center = state.size / 2.0;
  let direction = position - center;

  agents[id] = Agent(
    state.size / 2.0,
    atan2(direction.y, direction.x),
    0,
  );
}
