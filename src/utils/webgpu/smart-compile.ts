export const smartCompile = (device: GPUDevice, code: string) => {
  const module = device.createShaderModule({
    code,
  });

  module
    .getCompilationInfo()
    .then((info) =>
      info.messages.forEach((message) =>
        console.warn(message.type, message.message, code.split('\n')[message.lineNum - 1])
      )
    );

  return module;
};
