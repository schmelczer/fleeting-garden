import { describe, expect, it, vi } from 'vitest';

import {
  createCachedBufferWrite,
  updateCachedBufferWrite,
  writeBufferIfChanged,
} from './cached-buffer-write';

describe('cached buffer writes', () => {
  it('compares raw bytes so aliased uint changes are detected', () => {
    const values = new Float32Array(1);
    const uintValues = new Uint32Array(values.buffer);
    const cache = createCachedBufferWrite(values.byteLength);

    uintValues[0] = 0x7fc00001;
    expect(updateCachedBufferWrite(values, cache)).toBe(true);
    expect(updateCachedBufferWrite(values, cache)).toBe(false);

    uintValues[0] = 0x7fc00002;
    expect(Number.isNaN(values[0])).toBe(true);
    expect(updateCachedBufferWrite(values, cache)).toBe(true);
  });

  it('writes to the GPU queue only when the raw buffer changed', () => {
    const values = new Uint32Array([1, 2, 3, 4]);
    const writeBuffer = vi.fn();
    const device = { queue: { writeBuffer } } as unknown as GPUDevice;
    const buffer = {} as GPUBuffer;
    const cache = createCachedBufferWrite(values.byteLength);

    expect(writeBufferIfChanged(device, buffer, values, cache)).toBe(true);
    expect(writeBufferIfChanged(device, buffer, values, cache)).toBe(false);

    values[2] = 5;
    expect(writeBufferIfChanged(device, buffer, values, cache)).toBe(true);
    expect(writeBuffer).toHaveBeenCalledTimes(2);
  });
});
