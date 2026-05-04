export enum Severity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
}

export interface ErrorHandlerError {
  severity: Severity;
  message: string;
}

export type ErrorMetadata = { [key: string]: any };

export class ErrorHandler {
  private static readonly errors: Array<ErrorHandlerError> = [];
  private static metadata: ErrorMetadata = {};
  private static onErrorListeners: Array<
    (error: ErrorHandlerError, metadata: ErrorMetadata) => void
  > = [];

  public static addException(exception: Error) {
    ErrorHandler.addError(Severity.ERROR, exception.message);
  }

  public static addError(severity: Severity, message: string) {
    ErrorHandler.errors.push({ severity, message });
    ErrorHandler.onErrorListeners.forEach((listener) =>
      listener({ severity, message }, ErrorHandler.metadata)
    );
  }

  public static addMetadata(key: string, value: any) {
    const serialized: Record<string, any> = {};
    for (const k in value) {
      serialized[k] = value[k];
    }
    ErrorHandler.metadata[key] = serialized;
  }

  public static addOnErrorListener(
    listener: (error: ErrorHandlerError, metadata: ErrorMetadata) => void
  ) {
    ErrorHandler.onErrorListeners.push(listener);
  }
}
