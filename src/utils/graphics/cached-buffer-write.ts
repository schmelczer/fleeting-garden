interface CachedBufferWrite {
  hasValue: boolean;
  previous: Uint8Array;
}

export const createCachedBufferWrite = (byteLength: number): CachedBufferWrite => ({
  hasValue: false,
  previous: new Uint8Array(byteLength),
});

export const updateCachedBufferWrite = (
  values: ArrayBufferView,
  cache: CachedBufferWrite
): boolean => {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  if (bytes.length !== cache.previous.length) {
    throw new Error('Cached buffer write length mismatch');
  }

  let hasChanged = !cache.hasValue;
  for (let i = 0; i < bytes.length && !hasChanged; i++) {
    hasChanged = bytes[i] !== cache.previous[i];
  }

  if (!hasChanged) {
    return false;
  }

  cache.previous.set(bytes);
  cache.hasValue = true;
  return true;
};

export const writeBufferIfChanged = (
  device: GPUDevice,
  buffer: GPUBuffer,
  values: ArrayBufferView,
  cache: CachedBufferWrite
): boolean => {
  if (!updateCachedBufferWrite(values, cache)) {
    return false;
  }

  device.queue.writeBuffer(buffer, 0, values);
  return true;
};
