import { smartCompile } from '../../smart-compile';
import shader from './full-screen-quad.wgsl';

export const setUpFullScreenQuad = (
  device: GPUDevice
): {
  buffer: GPUBuffer;
  vertex: GPUVertexState;
} => {
  const buffer = device.createBuffer({
    size: 4 * 4 * 4, // 4x vec4<f32>
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
      module: smartCompile(device, shader),
      entryPoint: 'vertex',
      buffers: [
        {
          arrayStride: 4 * 4,
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
