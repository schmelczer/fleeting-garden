import { setUpFullScreenQuad } from './full-screen-quad';
import { smartCompile } from './smart-compile';

export const NOISE_TEXTURE_SIZE = 2048;

const NOISE_CHANNEL_SEEDS = [0, 1, 2, 3] as const;
const NOISE_CLEAR_VALUE = { r: 1, g: 1, b: 1, a: 1 };
const NOISE_DRAW_INSTANCE_COUNT = 1;
const NOISE_DRAW_VERTEX_COUNT = 3;
const NOISE_HASH_MULTIPLIER = 43758.5453123;
const NOISE_HASH_X = 12.9898;
const NOISE_HASH_Y = 78.233;
const NOISE_TEXTURE_FORMAT = 'r8unorm';

export interface GeneratedNoiseTexture {
  texture: GPUTexture;
  view: GPUTextureView;
}

export const generateNoise = ({
  device,
  width,
  height,
}: {
  device: GPUDevice;
  width: number;
  height: number;
}): GeneratedNoiseTexture => {
  const vertex = setUpFullScreenQuad(device);

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex,
    fragment: {
      module: smartCompile(
        device,
        /* wgsl */ `
        fn random_with_seed(uv: vec2<f32>, seed: f32) -> f32 {
          return fract(sin(dot(
            uv,
            vec2(
              ${NOISE_HASH_X} + seed,
              ${NOISE_HASH_Y} + seed
            )
          )) * ${NOISE_HASH_MULTIPLIER} + seed);
        }

        @fragment
        fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
          return vec4(
            random_with_seed(uv, ${NOISE_CHANNEL_SEEDS[0]}),
            0.0,
            0.0,
            1.0,
          );
        }`
      ),
      entryPoint: 'fragment',
      targets: [
        {
          format: NOISE_TEXTURE_FORMAT,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  const colorTexture = device.createTexture({
    size: {
      width,
      height,
      depthOrArrayLayers: 1,
    },
    format: NOISE_TEXTURE_FORMAT,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: colorTexture.createView(),
        clearValue: NOISE_CLEAR_VALUE,
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  const commandEncoder = device.createCommandEncoder();

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.draw(NOISE_DRAW_VERTEX_COUNT, NOISE_DRAW_INSTANCE_COUNT);
  passEncoder.end();

  device.queue.submit([commandEncoder.finish()]);
  return {
    texture: colorTexture,
    view: colorTexture.createView(),
  };
};
