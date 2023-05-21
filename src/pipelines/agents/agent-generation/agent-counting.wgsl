struct Counters {
  evenGenerationAlive: atomic<i32>,
  oddGenerationAlive: atomic<i32>,
};

@group(1) @binding(2) var<storage, read_write> counters: Counters;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let id = global_id.x;

  if id >= arrayLength(&agents) {
    return;
  }

  if agents[id].species % 2 == 0 {
    atomicAdd(&counters.evenGenerationAlive, 1);
  } else {
    atomicAdd(&counters.oddGenerationAlive, 1);
  }
}
