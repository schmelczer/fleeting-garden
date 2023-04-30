import { Random } from '../../random';
import { setUpFullScreenQuad } from '../full-screen-quad/full-screen-quad';
import random from '../random.wgsl';
import { smartCompile } from '../smart-compile';
import noise from './noise.wgsl';

const textureCache = new Map<string, GPUTexture>();

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
}): GPUTextureView => {
  const cacheKey = `${width}x${height}x${octaves}x${lacunarity}x${amplitude}x${gain}`;
  if (!textureCache.has(cacheKey)) {
    const { buffer, vertex } = setUpFullScreenQuad(device);
    const quadVertexBuffer = buffer;

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex,
      fragment: {
        module: smartCompile(device, random, noise),
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
    textureCache.set(cacheKey, colorTexture);
  }

  return textureCache.get(cacheKey).createView();
};
