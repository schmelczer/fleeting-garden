import { ErrorHandler, Severity } from '../error-handler';

export const smartCompile = (
  device: GPUDevice,
  ...code: Array<string>
): GPUShaderModule => {
  const concatenated = code.join('\n\n');

  const module = device.createShaderModule({
    code: concatenated,
  });

  module.getCompilationInfo().then((info) =>
    info.messages.forEach((message) =>
      ErrorHandler.addError(
        {
          info: Severity.INFO,
          warning: Severity.WARNING,
          error: Severity.ERROR,
        }[message.type],
        `${message.message}\n${
          concatenated.split('\n')[message.lineNum - 1]
        }\n\nCode:\n${concatenated}\n`
      )
    )
  );

  return module;
};
