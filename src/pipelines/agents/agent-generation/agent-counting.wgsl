struct Settings {
  agentCount: u32 // might be smaller than the length of the agents array
};

@group(1) @binding(0) var<uniform> settings: Settings;

struct Counters {
  evenGenerationAlive: atomic<u32>,
  oddGenerationAlive: atomic<u32>,
};

@group(1) @binding(2) var<storage, read_write> counters: Counters;


@compute @workgroup_size(64)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(num_workgroups) workgroup_count: vec3<u32>
) {
  let id = global_id.x + global_id.y * (workgroup_count.x * 64) + global_id.z * (workgroup_count.x * workgroup_count.y * 64);

  if id >= settings.agentCount {
    return;
  }

  if agents[id].generation % 2 == 0 {
    atomicAdd(&counters.evenGenerationAlive, 1);
  } else {
    atomicAdd(&counters.oddGenerationAlive, 1);
  }

  // atomicStore(&counters.evenGenerationAlive, settings.agentCount);
  // atomicStore(&counters.oddGenerationAlive,  workgroup_count.y);
}
