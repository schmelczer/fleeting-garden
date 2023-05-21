export const initializeContext = ({
  device,
  canvas,
}: {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
}): GPUCanvasContext => {
  const context = canvas.getContext('webgpu') as any as GPUCanvasContext;

  context.configure({
    device: device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    alphaMode: 'premultiplied',
  });

  return context;
};
