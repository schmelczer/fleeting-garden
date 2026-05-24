import {
  ErrorCode,
  ErrorHandler,
  getErrorMessage,
  RuntimeError,
  Severity,
} from '../error-handler';

const WEBGPU_BROWSER_SUPPORT_MESSAGE =
  'Fleeting Garden needs WebGPU. Try the latest Chrome, Edge, or another browser with WebGPU enabled.';

const REQUESTED_LIMIT_NAMES = [
  'maxBufferSize',
  'maxStorageBufferBindingSize',
  'maxComputeWorkgroupsPerDimension',
] as const satisfies ReadonlyArray<keyof GPUSupportedLimits>;

const getRequiredLimits = (
  limits: GPUSupportedLimits
): Record<(typeof REQUESTED_LIMIT_NAMES)[number], number> =>
  Object.fromEntries(REQUESTED_LIMIT_NAMES.map((name) => [name, limits[name]])) as Record<
    (typeof REQUESTED_LIMIT_NAMES)[number],
    number
  >;

const getAdapterInfo = (adapter: GPUAdapter): Record<string, unknown> => {
  try {
    const info = adapter.info;
    return {
      architecture: info.architecture,
      description: info.description,
      device: info.device,
      isFallbackAdapter: info.isFallbackAdapter,
      subgroupMaxSize: info.subgroupMaxSize,
      subgroupMinSize: info.subgroupMinSize,
      vendor: info.vendor,
    };
  } catch (error) {
    return {
      unavailableReason: getErrorMessage(error),
    };
  }
};

const requestAdapter = async (
  gpu: GPU,
  options?: GPURequestAdapterOptions
): Promise<GPUAdapter | null> => {
  try {
    return await gpu.requestAdapter(options);
  } catch (error) {
    throw new RuntimeError(
      ErrorCode.WEBGPU_ADAPTER_UNAVAILABLE,
      'Could not request a WebGPU adapter.',
      {
        cause: error,
        details: {
          causeMessage: getErrorMessage(error),
          powerPreference: options?.powerPreference ?? 'default',
        },
      }
    );
  }
};

export const initializeGpu = async (): Promise<GPUDevice> => {
  if (window.isSecureContext === false) {
    throw new RuntimeError(
      ErrorCode.WEBGPU_INSECURE_CONTEXT,
      'WebGPU requires a secure context. Open Fleeting Garden over HTTPS or from localhost.'
    );
  }

  const gpu = navigator.gpu;
  if (!gpu) {
    throw new RuntimeError(ErrorCode.WEBGPU_UNSUPPORTED, WEBGPU_BROWSER_SUPPORT_MESSAGE, {
      details: {
        hasNavigatorGpu: false,
        isSecureContext: window.isSecureContext,
      },
    });
  }

  const adapter =
    (await requestAdapter(gpu, {
      powerPreference: 'high-performance',
    })) ?? (await requestAdapter(gpu));

  if (!adapter) {
    throw new RuntimeError(
      ErrorCode.WEBGPU_ADAPTER_UNAVAILABLE,
      'WebGPU is available, but this browser could not provide a compatible GPU adapter.'
    );
  }

  const requiredLimits = getRequiredLimits(adapter.limits);
  const requiredFeatures: Array<GPUFeatureName> = [];
  if (adapter.features.has('timestamp-query')) {
    requiredFeatures.push('timestamp-query');
  }
  ErrorHandler.addMetadata('webgpuAdapter', {
    features: Array.from(adapter.features).sort(),
    info: getAdapterInfo(adapter),
    requiredFeatures,
    requiredLimits,
  });

  let gpuDevice: GPUDevice;
  try {
    gpuDevice = await adapter.requestDevice({
      requiredFeatures,
      requiredLimits,
    });
  } catch (error) {
    throw new RuntimeError(
      ErrorCode.WEBGPU_DEVICE_UNAVAILABLE,
      'Could not create a WebGPU device for this adapter.',
      {
        cause: error,
        details: {
          causeMessage: getErrorMessage(error),
          requiredFeatures,
          requiredLimits,
        },
      }
    );
  }

  gpuDevice.addEventListener('uncapturederror', (event: GPUUncapturedErrorEvent) =>
    ErrorHandler.addException(event.error, {
      code: ErrorCode.WEBGPU_UNCAPTURED_ERROR,
      severity: Severity.ERROR,
    })
  );

  gpuDevice.lost.then((info) => {
    if (info.reason === 'destroyed') {
      return;
    }

    ErrorHandler.addError(Severity.ERROR, info.message || 'The WebGPU device was lost.', {
      code: ErrorCode.WEBGPU_DEVICE_LOST,
      details: {
        reason: info.reason,
      },
    });
  });

  return gpuDevice;
};
