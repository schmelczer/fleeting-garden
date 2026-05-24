export enum Severity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
}

export enum ErrorCode {
  WEBGPU_INSECURE_CONTEXT = 'webgpu-insecure-context',
  WEBGPU_UNSUPPORTED = 'webgpu-unsupported',
  WEBGPU_ADAPTER_UNAVAILABLE = 'webgpu-adapter-unavailable',
  WEBGPU_DEVICE_UNAVAILABLE = 'webgpu-device-unavailable',
  WEBGPU_CONTEXT_UNAVAILABLE = 'webgpu-context-unavailable',
  WEBGPU_CONTEXT_CONFIGURATION_FAILED = 'webgpu-context-configuration-failed',
  WEBGPU_UNCAPTURED_ERROR = 'webgpu-uncaptured-error',
  WEBGPU_DEVICE_LOST = 'webgpu-device-lost',
  DOM_ELEMENT_MISSING = 'dom-element-missing',
}

type ErrorMetadataPrimitive = string | number | boolean | null;
type ErrorMetadataValue =
  | ErrorMetadataPrimitive
  | Array<ErrorMetadataValue>
  | { [key: string]: ErrorMetadataValue };
type ErrorMetadata = { [key: string]: ErrorMetadataValue };

interface RuntimeErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class RuntimeError extends Error {
  public readonly code: ErrorCode | string;
  public readonly details: ErrorMetadata;

  public constructor(
    code: ErrorCode | string,
    message: string,
    { cause, details = {} }: RuntimeErrorOptions = {}
  ) {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
    this.details = serializeMetadataValue(details) as ErrorMetadata;

    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

interface ErrorHandlerError {
  severity: Severity;
  message: string;
  code?: ErrorCode | string;
  details?: ErrorMetadata;
}

interface ErrorHandlerErrorOptions {
  code?: ErrorCode | string;
  details?: Record<string, unknown>;
}

interface ErrorHandlerExceptionOptions extends ErrorHandlerErrorOptions {
  fallbackMessage?: string;
  severity?: Severity;
}

const MAX_METADATA_DEPTH = 4;
const UNREADABLE_VALUE = '[Unreadable]';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const safelyRead = (value: Record<string, unknown>, key: string): unknown => {
  try {
    return value[key];
  } catch {
    return undefined;
  }
};

const isIterable = (value: unknown): value is Iterable<unknown> =>
  isRecord(value) && Symbol.iterator in value;

const serializeMetadataValue = (value: unknown, depth = 0): ErrorMetadataValue => {
  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : value.toString();
    case 'bigint':
      return value.toString();
    case 'undefined':
      return null;
    case 'symbol':
      return value.toString();
    case 'function':
      return `[Function ${value.name || 'anonymous'}]`;
  }

  if (depth >= MAX_METADATA_DEPTH) {
    return '[Object]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeMetadataValue(item, depth + 1));
  }

  if (isIterable(value)) {
    try {
      return Array.from(value, (item) => serializeMetadataValue(item, depth + 1));
    } catch {
      return UNREADABLE_VALUE;
    }
  }

  const serialized: ErrorMetadata = {};
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    try {
      serialized[key] = serializeMetadataValue(record[key], depth + 1);
    } catch {
      serialized[key] = UNREADABLE_VALUE;
    }
  }

  return serialized;
};

export const getErrorMessage = (
  exception: unknown,
  fallbackMessage = 'Unknown error'
): string => {
  if (typeof exception === 'string') {
    return exception || fallbackMessage;
  }

  if (exception instanceof Error) {
    const record = exception as unknown as Record<string, unknown>;
    const message = safelyRead(record, 'message');
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }

    const name = safelyRead(record, 'name');
    if (typeof name === 'string' && name.length > 0) {
      return name;
    }

    return fallbackMessage;
  }

  if (isRecord(exception)) {
    const message = safelyRead(exception, 'message');
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }

  if (
    typeof exception === 'number' ||
    typeof exception === 'boolean' ||
    typeof exception === 'bigint' ||
    typeof exception === 'symbol'
  ) {
    return exception.toString();
  }

  return fallbackMessage;
};

export class ErrorHandler {
  private static metadata: ErrorMetadata = {};
  private static onErrorListeners: Array<
    (error: ErrorHandlerError, metadata: ErrorMetadata) => void
  > = [];

  public static addException(
    exception: unknown,
    {
      severity = Severity.ERROR,
      fallbackMessage,
      code,
      details,
    }: ErrorHandlerExceptionOptions = {}
  ) {
    const runtimeError = exception instanceof RuntimeError ? exception : undefined;
    ErrorHandler.addError(severity, getErrorMessage(exception, fallbackMessage), {
      code: code ?? runtimeError?.code,
      details: {
        ...(runtimeError?.details ?? {}),
        ...(details ?? {}),
      },
    });
  }

  public static addError(
    severity: Severity,
    message: string,
    { code, details }: ErrorHandlerErrorOptions = {}
  ) {
    const error: ErrorHandlerError = {
      severity,
      message,
      ...(code === undefined ? {} : { code }),
      ...(details === undefined
        ? {}
        : { details: serializeMetadataValue(details) as ErrorMetadata }),
    };
    ErrorHandler.onErrorListeners.forEach((listener) =>
      listener(error, ErrorHandler.metadata)
    );
  }

  public static addMetadata(key: string, value: unknown) {
    ErrorHandler.metadata[key] = serializeMetadataValue(value);
  }

  public static addOnErrorListener(
    listener: (error: ErrorHandlerError, metadata: ErrorMetadata) => void
  ): () => void {
    ErrorHandler.onErrorListeners.push(listener);
    return () => {
      ErrorHandler.onErrorListeners = ErrorHandler.onErrorListeners.filter(
        (registeredListener) => registeredListener !== listener
      );
    };
  }
}
