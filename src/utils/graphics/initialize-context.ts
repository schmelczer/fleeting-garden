import { ErrorCode, getErrorMessage, RuntimeError } from '../error-handler';

export const initializeContext = ({
  device,
  canvas,
  format,
}: {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  format: GPUTextureFormat;
}): GPUCanvasContext => {
  const context = canvas.getContext('webgpu');

  if (!context) {
    throw new RuntimeError(
      ErrorCode.WEBGPU_CONTEXT_UNAVAILABLE,
      'Could not create a WebGPU canvas context.',
      {
        details: {
          canvasHeight: canvas.height,
          canvasWidth: canvas.width,
        },
      }
    );
  }

  try {
    context.configure({
      device: device,
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      alphaMode: 'opaque',
    });
  } catch (error) {
    throw new RuntimeError(
      ErrorCode.WEBGPU_CONTEXT_CONFIGURATION_FAILED,
      'Could not configure the WebGPU canvas context.',
      {
        cause: error,
        details: {
          causeMessage: getErrorMessage(error),
          canvasHeight: canvas.height,
          canvasWidth: canvas.width,
        },
      }
    );
  }

  return context;
};
