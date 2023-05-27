export const getWorkgroupCounts = (
  device: GPUDevice,
  invocationCount: number,
  workgroupSize: number
): [number, number, number] => {
  const workgroupCount = Math.ceil(invocationCount / workgroupSize);

  const workgroupCountX = Math.min(
    device.limits.maxComputeWorkgroupsPerDimension,
    workgroupCount
  );

  const workgroupCountY = Math.min(
    device.limits.maxComputeWorkgroupsPerDimension,
    Math.ceil(workgroupCount / workgroupCountX)
  );

  const workgroupCountZ = Math.min(
    device.limits.maxComputeWorkgroupsPerDimension,
    Math.ceil(workgroupCount / workgroupCountX / workgroupCountY)
  );

  if (workgroupCountX * workgroupCountY * workgroupCountZ < workgroupCount) {
    throw new Error('Cannot have this many invocations');
  }

  return [workgroupCountX, workgroupCountY, workgroupCountZ];
};
