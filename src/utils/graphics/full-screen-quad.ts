import { smartCompile } from './smart-compile';

export const setUpFullScreenQuad = (device: GPUDevice): GPUVertexState => ({
  module: smartCompile(
    device,
    /* wgsl */ `
    struct VertexOutput {
      @builtin(position) position: vec4<f32>,
      @location(0) uv: vec2<f32>,
    }

    @vertex
    fn vertex(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
      let positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
      );
      let position = positions[vertexIndex];
      let uv = vec2<f32>(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
      return VertexOutput(vec4(position, 0.0, 1.0), uv);
    }`
  ),
  entryPoint: 'vertex',
});
