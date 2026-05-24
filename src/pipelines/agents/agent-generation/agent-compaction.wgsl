struct Settings {
  agentCount: u32,
  padding0: u32,
  padding1: u32,
  padding2: u32,
};

struct Counters {
  aliveAgentCount: atomic<u32>,
};

const clearCompactedTailStride = __CLEAR_COMPACTED_TAIL_STRIDE__u;

@group(1) @binding(0) var<uniform> settings: Settings;
@group(1) @binding(2) var<storage, read_write> counters: Counters;
@group(1) @binding(3) var<storage, read_write> compactedAgents: array<Agent>;

var<workgroup> workgroupCompactedOffset: u32;
var<workgroup> scanData: array<u32, agentWorkgroupSize>;
var<workgroup> clearAliveAgentCount: u32;

@compute @workgroup_size(agentWorkgroupSize)
fn main(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>
) {
  let id = get_id(global_id);
  let lid = local_id.x;

  var isAlive = false;
  var agent: Agent;
  if id < settings.agentCount {
    isAlive = agents[id].colorIndex >= 0.0 && agents[id].colorIndex < 2.5;
    if isAlive {
      agent = agents[id];
    }
  }

  // Hillis-Steele inclusive prefix sum across the workgroup. Replaces a
  // per-thread atomicAdd to a workgroup counter, eliminating serialization
  // on dense workgroups.
  scanData[lid] = select(0u, 1u, isAlive);
  workgroupBarrier();

  var offset: u32 = 1u;
  while offset < agentWorkgroupSize {
    let own = scanData[lid];
    var contribution: u32 = 0u;
    if lid >= offset {
      contribution = scanData[lid - offset];
    }
    workgroupBarrier();
    scanData[lid] = own + contribution;
    workgroupBarrier();
    offset = offset * 2u;
  }

  let inclusivePrefix = scanData[lid];
  let workgroupAliveTotal = scanData[agentWorkgroupSize - 1u];
  let exclusivePrefix = inclusivePrefix - select(0u, 1u, isAlive);

  if lid == 0u {
    if workgroupAliveTotal > 0u {
      workgroupCompactedOffset = atomicAdd(&counters.aliveAgentCount, workgroupAliveTotal);
    } else {
      workgroupCompactedOffset = 0u;
    }
  }

  workgroupBarrier();

  if isAlive {
    compactedAgents[workgroupCompactedOffset + exclusivePrefix] = agent;
  }
}

@compute @workgroup_size(agentWorkgroupSize)
fn clearCompactedTail(
  @builtin(global_invocation_id) global_id: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>
) {
  let id = get_id(global_id);

  if local_id.x == 0u {
    clearAliveAgentCount = atomicLoad(&counters.aliveAgentCount);
  }

  workgroupBarrier();

  let firstClearId = clearAliveAgentCount + id * clearCompactedTailStride;
  for (var offset = 0u; offset < clearCompactedTailStride; offset += 1u) {
    let clearId = firstClearId + offset;
    if clearId < settings.agentCount {
      compactedAgents[clearId].colorIndex = -1.0;
    }
  }
}
