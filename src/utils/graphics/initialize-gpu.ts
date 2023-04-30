export const initializeGPU = async (): Promise<GPUDevice> => {
  const gpu = navigator.gpu;
  if (!gpu) {
    throw new Error('WebGPU is not supported');
  }

  const adapter = await gpu.requestAdapter({
    powerPreference: 'high-performance',
  });

  if (!adapter) {
    throw new Error('Could not request adatper');
  }

  return await adapter.requestDevice(); // could request more resources
};
