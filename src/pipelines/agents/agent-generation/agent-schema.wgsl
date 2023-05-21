struct Agent {
  position: vec2<f32>,
  angle: f32,
  generation: f32,
}

@group(1) @binding(1) var<storage, read_write> agents: array<Agent>;
