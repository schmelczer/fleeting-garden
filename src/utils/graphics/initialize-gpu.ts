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

interface AdapterRequestAttempt {
  label: string;
  options?: GPURequestAdapterOptions;
}

const ADAPTER_REQUEST_ATTEMPTS: ReadonlyArray<AdapterRequestAttempt> = [
  {
    label: 'compatibility-default',
    options: { featureLevel: 'compatibility' },
  },
  {
    label: 'core-default',
  },
  {
    label: 'compatibility-high-performance',
    options: { featureLevel: 'compatibility', powerPreference: 'high-performance' },
  },
  {
    label: 'core-high-performance',
    options: { powerPreference: 'high-performance' },
  },
] as const;

const getRelevantLimits = (
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

const getRequiredFeatures = (adapter: GPUAdapter): Array<GPUFeatureName> => {
  const requiredFeatures: Array<GPUFeatureName> = [];

  if (adapter.features.has('core-features-and-limits')) {
    requiredFeatures.push('core-features-and-limits');
  }

  return requiredFeatures;
};

type AdapterRequestOutcome = 'adapter' | 'unavailable' | 'error';

const describeAdapterRequest = (
  attempt: AdapterRequestAttempt,
  outcome: AdapterRequestOutcome,
  causeMessage?: string
): Record<string, unknown> => ({
  label: attempt.label,
  featureLevel: attempt.options?.featureLevel ?? 'core',
  powerPreference: attempt.options?.powerPreference ?? 'default',
  outcome,
  ...(causeMessage === undefined ? {} : { causeMessage }),
});

const requestAdapter = async (
  gpu: GPU
): Promise<{
  adapter: GPUAdapter | null;
  attempts: Array<Record<string, unknown>>;
}> => {
  const attempts: Array<Record<string, unknown>> = [];

  for (const attempt of ADAPTER_REQUEST_ATTEMPTS) {
    try {
      const adapter = await gpu.requestAdapter(attempt.options);
      attempts.push(describeAdapterRequest(attempt, adapter ? 'adapter' : 'unavailable'));

      if (adapter) {
        return { adapter, attempts };
      }
    } catch (error) {
      attempts.push(describeAdapterRequest(attempt, 'error', getErrorMessage(error)));
    }
  }

  return { adapter: null, attempts };
};

const formatAdapterAttemptSummary = (
  attempts: Array<Record<string, unknown>>
): string => {
  if (attempts.length === 0) {
    return 'No adapter requests were attempted.';
  }

  return `Adapter attempts: ${attempts
    .map((attempt) => `${attempt.label}: ${attempt.outcome}`)
    .join('; ')}`;
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

  const { adapter, attempts } = await requestAdapter(gpu);
  ErrorHandler.addMetadata('webgpuAdapterRequest', {
    attempts,
    selectedAttempt: attempts[attempts.length - 1]?.label ?? null,
  });

  if (!adapter) {
    throw new RuntimeError(
      ErrorCode.WEBGPU_ADAPTER_UNAVAILABLE,
      [
        'WebGPU is available, but this browser could not provide a compatible GPU adapter.',
        formatAdapterAttemptSummary(attempts),
      ].join('\n'),
      {
        details: {
          attempts,
          hasNavigatorGpu: true,
          isSecureContext: window.isSecureContext,
          platform: navigator.platform,
          userAgent: navigator.userAgent,
        },
      }
    );
  }

  const requiredFeatures = getRequiredFeatures(adapter);
  ErrorHandler.addMetadata('webgpuAdapter', {
    features: Array.from(adapter.features).sort(),
    info: getAdapterInfo(adapter),
    requiredFeatures,
    relevantLimits: getRelevantLimits(adapter.limits),
  });

  let gpuDevice: GPUDevice;
  try {
    gpuDevice = await adapter.requestDevice({
      requiredFeatures,
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
