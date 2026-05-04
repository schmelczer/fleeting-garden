import { setUpFullScreenQuad } from './full-screen-quad';
import { smartCompile } from './smart-compile';

const textureCache = new Map<string, GPUTexture>();

export const generateNoise = ({
  device,
  width,
  height,
}: {
  device: GPUDevice;
  width: number;
  height: number;
}): GPUTextureView => {
  const cacheKey = `${width}x${height}`;
  if (!textureCache.has(cacheKey)) {
    const { buffer, vertex } = setUpFullScreenQuad(device);
    const vertexBuffer = buffer;

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex,
      fragment: {
        module: smartCompile(
          device,
          /* wgsl */ `
          fn random_with_seed(uv: vec2<f32>, seed: f32) -> f32 {
            return fract(sin(dot(uv, vec2(12.9898 + seed, 78.233 + seed)))* 43758.5453123 + seed);
          }
          
          @fragment
          fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
            return vec4(
              random_with_seed(uv, 0),
              random_with_seed(uv, 1),
              random_with_seed(uv, 2),
              random_with_seed(uv, 3),
            );
          }`
        ),
        entryPoint: 'fragment',
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
    passEncoder.setVertexBuffer(0, vertexBuffer);
    passEncoder.draw(4, 1);
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
    textureCache.set(cacheKey, colorTexture);
  }

  return textureCache.get(cacheKey)!.createView();
};
