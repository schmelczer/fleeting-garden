export const smartCompile = (device: GPUDevice, ...code: Array<string>) => {
  const concatenated = code.join('\n\n');

  const module = device.createShaderModule({
    code: concatenated,
  });

  module
    .getCompilationInfo()
    .then((info) =>
      info.messages.forEach((message) =>
        console.warn(
          message.type,
          message.message,
          concatenated.split('\n')[message.lineNum - 1]
        )
      )
    );

  return module;
};
