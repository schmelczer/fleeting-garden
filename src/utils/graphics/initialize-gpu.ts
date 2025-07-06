import { ErrorHandler, Severity } from '../error-handler';

export const initializeGpu = async (): Promise<GPUDevice> => {
  const gpu = navigator.gpu;
  if (!gpu) {
    throw new Error('WebGPU is not supported in your browser');
  }

  const adapter = await gpu.requestAdapter({
    powerPreference: 'high-performance',
  });

  if (!adapter) {
    throw new Error('Could not request adatper');
  }

  ErrorHandler.addMetadata('features', adapter.features);
  ErrorHandler.addMetadata('limits', adapter.limits);

  const gpuDevice = await adapter.requestDevice({
    requiredLimits: {
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxComputeWorkgroupsPerDimension: adapter.limits.maxComputeWorkgroupsPerDimension,
    },
  });

  gpuDevice.addEventListener('uncapturederror', (event: GPUUncapturedErrorEvent) =>
    ErrorHandler.addError(Severity.ERROR, event.error.message)
  );

  return gpuDevice;
};
