import { ErrorHandler, Severity } from '../error-handler';

export const smartCompile = (
  device: GPUDevice,
  ...code: Array<string>
): GPUShaderModule => {
  const concatenated = code.join('\n\n');

  const module = device.createShaderModule({
    code: concatenated,
  });

  module.getCompilationInfo().then((info) => {
    if (info.messages.length === 0) {
      return;
    }

    const lines = concatenated.split('\n');
    info.messages.forEach((message) => {
      const sourceLine = lines[message.lineNum - 1] ?? '';
      const fullSource = import.meta.env.DEV ? `\n\nCode:\n${concatenated}\n` : '';
      ErrorHandler.addError(
        {
          info: Severity.INFO,
          warning: Severity.WARNING,
          error: Severity.ERROR,
        }[message.type],
        `${message.message}\n${sourceLine}${fullSource}`
      );
    });
  });

  return module;
};
