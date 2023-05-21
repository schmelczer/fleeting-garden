struct Settings {
  center: vec2<f32>,
  radius: f32,
  nextGenerationId: f32,
  shape: f32,
};

struct Counters {
  currentGenerationAlive: atomic<i32>,
  nextGenerationAlive: atomic<i32>,
  remaining: atomic<i32>
};

@group(1) @binding(0) var<uniform> settings: Settings;
@group(1) @binding(2) var<storage, read_write> counters: Counters;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let id = global_id.x;

  if id >= arrayLength(&agents) {
    return;
  }

  if agents[id].timeToLive > 0 {
    if agents[id].species == settings.nextGenerationId {
      atomicAdd(&counters.nextGenerationAlive, 1);
    } else {
      atomicAdd(&counters.currentGenerationAlive, 1);
    }
    return; 
  }

  if atomicSub(&counters.remaining, 1) <= 0 {
    return;
  }

  var position: vec2<f32>;
  var angle: f32;

  if settings.shape == 0.0 {
    position = vec2(
      hash(id) * state.size.x,
      hash(id * id) * state.size.y,
    );

    let center = state.size / 2.0;
    let direction = position - center;
    angle = atan2(direction.y, direction.x);
  } else if settings.shape == 1.0 {
    angle = hash(id) * 2.0 * 3.1415;
    let direction = vec2(cos(angle), sin(angle));
    position = settings.center + direction * settings.radius * hash(id * 12 + 3);
  }

  atomicAdd(&counters.nextGenerationAlive, 1);

  agents[id] = Agent(
    position,
    angle,
    settings.nextGenerationId,
    1000000,
  );

}
