import { Random } from '../../random';
import { smartCompile } from '../../smart-compile';
import { setUpFullScreenQuad } from '../full-screen-quad/full-screen-quad';
import noise from './noise.wgsl';

export const generateNoise = ({
  device,
  width = 1024,
  height = 1024,
  octaves = 8,
  lacunarity = 2,
  amplitude = 0.5,
  gain = 0.5,
}: {
  device: GPUDevice;
  width?: number;
  height?: number;
  octaves?: number;
  lacunarity?: number;
  amplitude?: number;
  gain?: number;
}) => {
  const { buffer, vertex } = setUpFullScreenQuad(device);
  const quadVertexBuffer = buffer;

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex,
    fragment: {
      module: smartCompile(device, noise),
      entryPoint: 'fragment',
      constants: {
        octaves,
        lacunarity,
        amplitude,
        gain,
        seedR: Random.getRandom(),
        seedG: Random.getRandom(),
        seedB: Random.getRandom(),
        seedA: Random.getRandom(),
      },
      targets: [
        {
          format: 'rgba16float',
        },
      ],
    },
    primitive: {
      topology: 'triangle-strip',
    },
  });

  const colorTexture = device.createTexture({
    size: {
      width,
      height,
      depthOrArrayLayers: 1,
    },
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: colorTexture.createView(),
        clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  const commandEncoder = device.createCommandEncoder();

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.setVertexBuffer(0, quadVertexBuffer);
  passEncoder.draw(4, 1);
  passEncoder.end();

  device.queue.submit([commandEncoder.finish()]);

  return colorTexture;
};
