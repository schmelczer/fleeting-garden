import {
  ErrorHandler,
  getErrorMessage,
  RuntimeError,
  Severity,
} from '../utils/error-handler';

type RuntimeUiError = Parameters<
  Parameters<typeof ErrorHandler.addOnErrorListener>[0]
>[0];

const ERROR_CONTAINER_SELECTOR = '.errors-container';
const ERROR_CONTAINER_CLASS = 'errors-container';

const renderRuntimeMessage = (container: HTMLElement, error: RuntimeUiError): void => {
  const message = document.createElement('pre');
  message.className = error.severity;
  message.textContent = error.code ? `${error.message}\n${error.code}` : error.message;
  message.setAttribute('role', error.severity === Severity.ERROR ? 'alert' : 'status');
  message.setAttribute(
    'aria-live',
    error.severity === Severity.ERROR ? 'assertive' : 'polite'
  );
  container.append(message);

  if (error.severity === Severity.ERROR) {
    message.tabIndex = -1;
    message.focus({ preventScroll: true });
  }
};

const getRuntimeUiError = (exception: unknown): RuntimeUiError => ({
  severity: Severity.ERROR,
  message: getErrorMessage(exception),
  ...(exception instanceof RuntimeError ? { code: exception.code } : {}),
});

export class ErrorPresenter {
  public constructor(private readonly container: HTMLElement) {
    container.setAttribute('aria-live', 'assertive');
  }

  public render(error: RuntimeUiError): void {
    renderRuntimeMessage(this.container, error);
  }

  public static renderStartup(exception: unknown): void {
    const existingContainer = document.querySelector(ERROR_CONTAINER_SELECTOR);
    const container =
      existingContainer instanceof HTMLElement
        ? existingContainer
        : document.createElement('div');

    if (!(existingContainer instanceof HTMLElement)) {
      container.className = ERROR_CONTAINER_CLASS;
      document.body.append(container);
    }

    container.setAttribute('aria-live', 'assertive');
    renderRuntimeMessage(container, getRuntimeUiError(exception));
  }
}
