import fragShaderCode from './shaders/triangle.frag.wgsl';
import vertShaderCode from './shaders/triangle.vert.wgsl';

const positions = new Float32Array([1.0, -1.0, 0.0, -1.0, -1.0, 0.0, 0.0, 1.0, 0.0]);
const colors = new Float32Array([1.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 1.0]);

const indices = new Uint16Array([0, 1, 2]);

export default class Renderer {
  canvas: HTMLCanvasElement;

  adapter: GPUAdapter;
  device: GPUDevice;
  queue: GPUQueue;

  context: GPUCanvasContext;
  colorTexture: GPUTexture;
  colorTextureView: GPUTextureView;
  depthTexture: GPUTexture;
  depthTextureView: GPUTextureView;

  positionBuffer: GPUBuffer;
  colorBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  vertModule: GPUShaderModule;
  fragModule: GPUShaderModule;
  pipeline: GPURenderPipeline;

  commandEncoder: GPUCommandEncoder;
  passEncoder: GPURenderPassEncoder;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async start() {
    if (await this.initializeAPI()) {
      this.resizeBackings();
      await this.initializeResources();
      this.render();
    }
  }

  async initializeAPI(): Promise<boolean> {
    try {
      const entry: GPU = navigator.gpu;
      if (!entry) {
        return false;
      }

      this.adapter = await entry.requestAdapter();
      this.device = await this.adapter.requestDevice();
      this.queue = this.device.queue;
    } catch (e) {
      console.error(e);
      return false;
    }

    return true;
  }

  async initializeResources() {
    const createBuffer = (arr: Float32Array | Uint16Array, usage: number) => {
      // 📏 Align to 4 bytes (thanks @chrimsonite)
      const desc = {
        size: (arr.byteLength + 3) & ~3,
        usage,
        mappedAtCreation: true,
      };
      const buffer = this.device.createBuffer(desc);
      const writeArray =
        arr instanceof Uint16Array
          ? new Uint16Array(buffer.getMappedRange())
          : new Float32Array(buffer.getMappedRange());
      writeArray.set(arr);
      buffer.unmap();
      return buffer;
    };

    this.positionBuffer = createBuffer(positions, GPUBufferUsage.VERTEX);
    this.colorBuffer = createBuffer(colors, GPUBufferUsage.VERTEX);
    this.indexBuffer = createBuffer(indices, GPUBufferUsage.INDEX);

    const vsmDesc = {
      code: vertShaderCode,
    };
    this.vertModule = this.device.createShaderModule(vsmDesc);

    const fsmDesc = {
      code: fragShaderCode,
    };
    this.fragModule = this.device.createShaderModule(fsmDesc);

    const positionAttribDesc: GPUVertexAttribute = {
      shaderLocation: 0, // [[location(0)]]
      offset: 0,
      format: 'float32x3',
    };
    const colorAttribDesc: GPUVertexAttribute = {
      shaderLocation: 1, // [[location(1)]]
      offset: 0,
      format: 'float32x3',
    };
    const positionBufferDesc: GPUVertexBufferLayout = {
      attributes: [positionAttribDesc],
      arrayStride: 4 * 3, // sizeof(float) * 3
      stepMode: 'vertex',
    };
    const colorBufferDesc: GPUVertexBufferLayout = {
      attributes: [colorAttribDesc],
      arrayStride: 4 * 3, // sizeof(float) * 3
      stepMode: 'vertex',
    };

    const depthStencil: GPUDepthStencilState = {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus-stencil8',
    };

    const pipelineLayoutDesc = { bindGroupLayouts: [] };
    const layout = this.device.createPipelineLayout(pipelineLayoutDesc);

    const vertex: GPUVertexState = {
      module: this.vertModule,
      entryPoint: 'main',
      buffers: [positionBufferDesc, colorBufferDesc],
    };

    const colorState: GPUColorTargetState = {
      format: 'bgra8unorm',
    };

    const fragment: GPUFragmentState = {
      module: this.fragModule,
      entryPoint: 'main',
      targets: [colorState],
    };

    const primitive: GPUPrimitiveState = {
      frontFace: 'cw',
      cullMode: 'none',
      topology: 'triangle-list',
    };

    const pipelineDesc: GPURenderPipelineDescriptor = {
      layout,

      vertex,
      fragment,

      primitive,
      depthStencil,
    };
    this.pipeline = this.device.createRenderPipeline(pipelineDesc);
  }

  resizeBackings() {
    if (!this.context) {
      this.context = this.canvas.getContext('webgpu') as any;
      const canvasConfig: GPUCanvasConfiguration = {
        device: this.device,
        format: 'bgra8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        alphaMode: 'opaque',
      };
      this.context.configure(canvasConfig);
    }

    const depthTextureDesc: GPUTextureDescriptor = {
      size: [this.canvas.width, this.canvas.height, 1],
      dimension: '2d',
      format: 'depth24plus-stencil8',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    };

    this.depthTexture = this.device.createTexture(depthTextureDesc);
    this.depthTextureView = this.depthTexture.createView();
  }

  encodeCommands() {
    const colorAttachment: GPURenderPassColorAttachment = {
      view: this.colorTextureView,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    };

    const depthAttachment: GPURenderPassDepthStencilAttachment = {
      view: this.depthTextureView,
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
      stencilClearValue: 0,
      stencilLoadOp: 'clear',
      stencilStoreOp: 'store',
    };

    const renderPassDesc: GPURenderPassDescriptor = {
      colorAttachments: [colorAttachment],
      depthStencilAttachment: depthAttachment,
    };

    this.commandEncoder = this.device.createCommandEncoder();

    this.passEncoder = this.commandEncoder.beginRenderPass(renderPassDesc);
    this.passEncoder.setPipeline(this.pipeline);
    this.passEncoder.setViewport(0, 0, this.canvas.width, this.canvas.height, 0, 1);
    this.passEncoder.setScissorRect(0, 0, this.canvas.width, this.canvas.height);
    this.passEncoder.setVertexBuffer(0, this.positionBuffer);
    this.passEncoder.setVertexBuffer(1, this.colorBuffer);
    this.passEncoder.setIndexBuffer(this.indexBuffer, 'uint16');
    this.passEncoder.drawIndexed(3, 1);
    this.passEncoder.end();

    this.queue.submit([this.commandEncoder.finish()]);
  }

  render = () => {
    this.colorTexture = this.context.getCurrentTexture();
    this.colorTextureView = this.colorTexture.createView();

    this.encodeCommands();

    requestAnimationFrame(this.render);
  };
}
