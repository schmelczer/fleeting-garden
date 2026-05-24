import { appConfig } from '../../config';
import { setUpFullScreenQuad } from './full-screen-quad';
import { smartCompile } from './smart-compile';

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
              ${appConfig.pipelines.common.noiseHashX} + seed,
              ${appConfig.pipelines.common.noiseHashY} + seed
            )
          )) * ${appConfig.pipelines.common.noiseHashMultiplier} + seed);
        }

        @fragment
        fn fragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
          return vec4(
            random_with_seed(uv, ${appConfig.pipelines.common.noiseChannelSeeds[0]}),
            0.0,
            0.0,
            1.0,
          );
        }`
      ),
      entryPoint: 'fragment',
      targets: [
        {
          format: appConfig.pipelines.common.noiseTextureFormat,
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
    format: appConfig.pipelines.common.noiseTextureFormat,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: colorTexture.createView(),
        clearValue: appConfig.pipelines.common.noiseClearValue,
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  const commandEncoder = device.createCommandEncoder();

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.draw(
    appConfig.pipelines.common.noiseDrawVertexCount,
    appConfig.pipelines.common.noiseDrawInstanceCount
  );
  passEncoder.end();

  device.queue.submit([commandEncoder.finish()]);
  return {
    texture: colorTexture,
    view: colorTexture.createView(),
  };
};
