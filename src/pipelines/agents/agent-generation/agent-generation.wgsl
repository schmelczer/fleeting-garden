struct Settings {
  center: vec2<f32>,
  radius: f32,
  nextGenerationId: f32,
};

@group(1) @binding(0) var<uniform> settings: Settings;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let id = global_id.x;

  if id >= arrayLength(&agents) {
    return;
  }

  if length(settings.center - agents[id].position) < settings.radius {
    agents[id].species = settings.nextGenerationId;
  }
}
