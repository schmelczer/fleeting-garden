import { createBindGroupCache } from '../../utils/graphics/bind-group-cache';
import {
  createCachedBufferWrite,
  writeBufferIfChanged,
} from '../../utils/graphics/cached-buffer-write';
import { setUpFullScreenQuad } from '../../utils/graphics/full-screen-quad';
import { smartCompile } from '../../utils/graphics/smart-compile';
import { rgbChannelToUnit, type RgbColor } from '../../utils/rgb-color';
import shader from './render.wgsl?raw';

export interface RenderSettings {
  clarity: number;
  renderTraceNormalizationFloor: number;
  renderBrushColorBase: number;
  renderBrushColorStrengthMultiplier: number;
}

// 3 channel colors (vec3 + f32 padding) + bg color (vec3) + 4 scalars,
// rounded up to 20 floats for 16-byte uniform alignment.
const UNIFORM_COUNT = 20;

export class RenderPipeline {
  private readonly bindGroupLayout: GPUBindGroupLayout;
  private readonly pipeline: GPURenderPipeline;
  private readonly noSourcePipeline: GPURenderPipeline;
  private readonly uniforms: GPUBuffer;
  private readonly uniformValues = new Float32Array(UNIFORM_COUNT);
  private readonly uniformCache = createCachedBufferWrite(
    UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT
  );

  private readonly getBindGroup = createBindGroupCache<[GPUTextureView, GPUTextureView]>(
    (colorTexture, sourceTexture) =>
      this.device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniforms } },
          { binding: 2, resource: colorTexture },
          { binding: 3, resource: sourceTexture },
        ],
      })
  );

  public constructor(
    private readonly context: GPUCanvasContext,
    private readonly device: GPUDevice,
    private readonly canvasFormat: GPUTextureFormat
  ) {
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
      ],
    });

    const shaderModule = smartCompile(device, shader);
    const vertex = setUpFullScreenQuad(device);
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });
    this.pipeline = this.createPipeline(
      pipelineLayout,
      vertex,
      shaderModule,
      this.canvasFormat,
      'fragment'
    );
    this.noSourcePipeline = this.createPipeline(
      pipelineLayout,
      vertex,
      shaderModule,
      this.canvasFormat,
      'fragmentNoSource'
    );

    this.uniforms = device.createBuffer({
      size: UNIFORM_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private createPipeline(
    layout: GPUPipelineLayout,
    vertex: GPUVertexState,
    shaderModule: GPUShaderModule,
    format: GPUTextureFormat,
    fragmentEntryPoint: string
  ): GPURenderPipeline {
    return this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: shaderModule,
        entryPoint: fragmentEntryPoint,
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  public setParameters({
    channelColors,
    backgroundColor,
    clarity,
    renderTraceNormalizationFloor,
    renderBrushColorBase,
    renderBrushColorStrengthMultiplier,
  }: RenderSettings & {
    channelColors: [RgbColor, RgbColor, RgbColor];
    backgroundColor: RgbColor;
  }) {
    const [a, b, c] = channelColors;
    this.uniformValues[0] = rgbChannelToUnit(a[0]);
    this.uniformValues[1] = rgbChannelToUnit(a[1]);
    this.uniformValues[2] = rgbChannelToUnit(a[2]);
    // uniformValues[3], [7], [11] are WGSL vec3→vec4 alignment padding.
    this.uniformValues[4] = rgbChannelToUnit(b[0]);
    this.uniformValues[5] = rgbChannelToUnit(b[1]);
    this.uniformValues[6] = rgbChannelToUnit(b[2]);
    this.uniformValues[8] = rgbChannelToUnit(c[0]);
    this.uniformValues[9] = rgbChannelToUnit(c[1]);
    this.uniformValues[10] = rgbChannelToUnit(c[2]);
    this.uniformValues[12] = rgbChannelToUnit(backgroundColor[0]);
    this.uniformValues[13] = rgbChannelToUnit(backgroundColor[1]);
    this.uniformValues[14] = rgbChannelToUnit(backgroundColor[2]);
    this.uniformValues[15] = clarity;
    this.uniformValues[16] = renderTraceNormalizationFloor;
    this.uniformValues[17] = renderBrushColorBase;
    this.uniformValues[18] = renderBrushColorStrengthMultiplier;
    writeBufferIfChanged(
      this.device,
      this.uniforms,
      this.uniformValues,
      this.uniformCache
    );
  }

  public execute(
    commandEncoder: GPUCommandEncoder,
    colorTexture: GPUTextureView,
    sourceTexture: GPUTextureView,
    useSourceTexture = true,
    timestampWrites?: GPURenderPassTimestampWrites
  ): GPUTexture {
    const canvasTexture = this.context.getCurrentTexture();
    this.encodePass(
      commandEncoder,
      colorTexture,
      sourceTexture,
      canvasTexture.createView(),
      useSourceTexture,
      timestampWrites
    );
    return canvasTexture;
  }

  public executeToView(
    commandEncoder: GPUCommandEncoder,
    colorTexture: GPUTextureView,
    sourceTexture: GPUTextureView,
    outputTexture: GPUTextureView,
    useSourceTexture = true,
    timestampWrites?: GPURenderPassTimestampWrites
  ) {
    this.encodePass(
      commandEncoder,
      colorTexture,
      sourceTexture,
      outputTexture,
      useSourceTexture,
      timestampWrites
    );
  }

  private encodePass(
    commandEncoder: GPUCommandEncoder,
    colorTexture: GPUTextureView,
    sourceTexture: GPUTextureView,
    output: GPUTextureView,
    useSourceTexture: boolean,
    timestampWrites?: GPURenderPassTimestampWrites
  ) {
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: output,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      timestampWrites,
    });
    passEncoder.setPipeline(this.getPipeline(useSourceTexture));
    passEncoder.setBindGroup(0, this.getBindGroup(colorTexture, sourceTexture));
    passEncoder.draw(3, 1);
    passEncoder.end();
  }

  private getPipeline(useSourceTexture: boolean): GPURenderPipeline {
    return useSourceTexture ? this.pipeline : this.noSourcePipeline;
  }

  public destroy() {
    this.uniforms.destroy();
  }
}
