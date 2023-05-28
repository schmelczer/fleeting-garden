import shader from './full-screen-quad.wgsl';
import { smartCompile } from './smart-compile';

export const setUpFullScreenQuad = (
  device: GPUDevice
): {
  buffer: GPUBuffer;
  vertex: GPUVertexState;
} => {
  const buffer = device.createBuffer({
    size: 4 * 4 * Float32Array.BYTES_PER_ELEMENT, // 4 x vec4<f32>
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  // prettier-ignore
  const vertexData = [
    // posX  posY U    V
      -1.0, -1.0, 0.0, 1.0,
      +1.0, -1.0, 1.0, 1.0,
      -1.0, +1.0, 0.0, 0.0,
      +1.0, +1.0, 1.0, 0.0,
  ];
  new Float32Array(buffer.getMappedRange()).set(vertexData);
  buffer.unmap();

  return {
    buffer,
    vertex: {
      module: smartCompile(
        device,
        /* wgsl */ `
        struct VertexOutput {
          @builtin(position) position: vec4<f32>,
          @location(0) uv: vec2<f32>,
        }
        
        @vertex
        fn vertex(
          @location(0) position: vec2<f32>,
          @location(1) uv: vec2<f32>
        ) -> VertexOutput {
          return VertexOutput(vec4(position, 0.0, 1.0), uv);
        }`
      ),
      entryPoint: 'vertex',
      buffers: [
        {
          arrayStride: 4 * Float32Array.BYTES_PER_ELEMENT,
          stepMode: 'vertex',
          attributes: [
            {
              shaderLocation: 0,
              offset: 0,
              format: 'float32x2',
            },
            {
              shaderLocation: 1,
              offset: 8,
              format: 'float32x2',
            },
          ],
        },
      ],
    },
  };
};
