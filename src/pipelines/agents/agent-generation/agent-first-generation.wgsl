@compute @workgroup_size(64)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(num_workgroups) workgroup_count: vec3<u32>
) {
  let id = get_id(global_id, workgroup_count);

  if id >= arrayLength(&agents) {
    return;
  }

  let clusterId = f32(id % 1000);

  let random = textureSampleLevel(
    noise,
    noiseSampler,
    vec2(f32(id % 1999) / 2000, f32(id) / 1999 / 2000),
    0
  );
  
  let randomPosition = textureSampleLevel(
    noise,
    noiseSampler,
    vec2(clusterId / 2000, clusterId / 2000),
    0
  );


  agents[id] = Agent(
    randomPosition.xz * state.size,
    random.r * 3.14 * 2,
    0,
  );
}
