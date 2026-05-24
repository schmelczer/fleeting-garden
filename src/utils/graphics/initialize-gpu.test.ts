import { afterEach, describe, expect, it, vi } from 'vitest';

import { initializeGpu } from './initialize-gpu';

const limits = {
  maxBufferSize: 1024,
  maxComputeWorkgroupsPerDimension: 16,
  maxStorageBufferBindingSize: 1024,
} as unknown as GPUSupportedLimits;

const createDevice = (): GPUDevice =>
  ({
    addEventListener: vi.fn(),
    lost: new Promise(() => undefined),
  }) as unknown as GPUDevice;

const createAdapter = (features: Array<GPUFeatureName> = []): GPUAdapter => {
  const device = createDevice();
  return {
    features: new Set(features),
    info: {},
    limits,
    requestDevice: vi.fn().mockResolvedValue(device),
  } as unknown as GPUAdapter;
};

const stubSecureWebGpu = (requestAdapter: GPU['requestAdapter']): void => {
  vi.stubGlobal('window', { isSecureContext: true });
  vi.stubGlobal('navigator', {
    gpu: {
      requestAdapter,
    },
  });
};

describe('initializeGpu', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with the least demanding compatibility adapter request', async () => {
    const adapter = createAdapter();
    const requestAdapter = vi.fn().mockResolvedValue(adapter);
    stubSecureWebGpu(requestAdapter as GPU['requestAdapter']);

    await initializeGpu();

    expect(requestAdapter).toHaveBeenNthCalledWith(1, {
      featureLevel: 'compatibility',
    });
    expect(requestAdapter).toHaveBeenCalledTimes(1);
    expect(adapter.requestDevice).toHaveBeenCalled();
  });

  it('continues trying adapters if one request throws', async () => {
    const adapter = createAdapter();
    const requestAdapter = vi
      .fn()
      .mockRejectedValueOnce(new Error('adapter request failed'))
      .mockResolvedValueOnce(adapter);
    stubSecureWebGpu(requestAdapter as GPU['requestAdapter']);

    await expect(initializeGpu()).resolves.toBeDefined();
    expect(requestAdapter).toHaveBeenCalledTimes(2);
  });

  it('falls back through core and high-performance adapter requests', async () => {
    const adapter = createAdapter();
    const requestAdapter = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(adapter);
    stubSecureWebGpu(requestAdapter as GPU['requestAdapter']);

    await initializeGpu();

    expect(requestAdapter).toHaveBeenNthCalledWith(1, {
      featureLevel: 'compatibility',
    });
    expect(requestAdapter).toHaveBeenNthCalledWith(2, undefined);
    expect(requestAdapter).toHaveBeenNthCalledWith(3, {
      featureLevel: 'compatibility',
      powerPreference: 'high-performance',
    });
    expect(adapter.requestDevice).toHaveBeenCalled();
  });

  it('requests only the core feature when the adapter exposes optional features', async () => {
    const adapter = createAdapter(['core-features-and-limits', 'timestamp-query']);
    const requestAdapter = vi.fn().mockResolvedValue(adapter);
    stubSecureWebGpu(requestAdapter as GPU['requestAdapter']);

    await initializeGpu();

    expect(adapter.requestDevice).toHaveBeenCalledWith({
      requiredFeatures: ['core-features-and-limits'],
    });
  });
});
