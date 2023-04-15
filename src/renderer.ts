import { Agent } from './pipelines/agents/agent';
import { AgentPipeline } from './pipelines/agents/agent-pipeline';
import { DiffusionPipeline } from './pipelines/diffusion/diffusion-pipeline';
import { RenderPipeline } from './pipelines/render/render-pipeline';
import { settings } from './settings';
import { randomBetween } from './utils/random-between';

import { vec2 } from 'gl-matrix';

export default class Renderer {
  private context: GPUCanvasContext;
  private adapter: GPUAdapter;
  private device: GPUDevice;
  private queue: GPUQueue;

  private agentPipeline: AgentPipeline;
  private renderPipeline: RenderPipeline;
  private diffusionPipeline: any;

  private preferredCanvasFormat: GPUTextureFormat;
  private trailMapA?: GPUTexture;
  private trailMapB?: GPUTexture;

  public constructor(private canvas: HTMLCanvasElement) {}

  async start() {
    await this.initialize();
    requestAnimationFrame(this.render.bind(this));
  }

  private async initialize(): Promise<void> {
    await this.initializeDevice();

    this.resize();
    window.addEventListener('resize', this.resize.bind(this));

    const agents: Array<Agent> = new Array(settings.numAgents).fill(0).map(() => ({
      position: vec2.fromValues(randomBetween(0, 500), randomBetween(0, 500)),
      angle: randomBetween(0, Math.PI * 2),
    }));

    this.agentPipeline = new AgentPipeline(this.device, agents);
    this.renderPipeline = new RenderPipeline(
      this.context,
      this.device,
      this.preferredCanvasFormat
    );
    this.diffusionPipeline = new DiffusionPipeline(this.device);
  }

  private resize() {
    const devicePixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * devicePixelRatio;

    this.trailMapA?.destroy();
    this.trailMapA = this.device.createTexture({
      size: {
        width: this.canvas.width,
        height: this.canvas.height,
        depthOrArrayLayers: 1,
      },
      format: 'rgba16float',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.trailMapB?.destroy();
    this.trailMapB = this.device.createTexture({
      size: {
        width: this.canvas.width,
        height: this.canvas.height,
        depthOrArrayLayers: 1,
      },
      format: 'rgba16float',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  private async initializeDevice(): Promise<void> {
    const gpu = navigator.gpu;
    if (!gpu) {
      throw new Error('WebGPU is not supported');
    }

    this.adapter = await gpu.requestAdapter();
    this.device = await this.adapter.requestDevice(); // could request more resources
    this.queue = this.device.queue;

    this.context = this.canvas.getContext('webgpu') as any;
    this.preferredCanvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.preferredCanvasFormat,
      alphaMode: 'premultiplied',
    });
  }

  private render(time: DOMHighResTimeStamp) {
    this.agentPipeline.setParameters({
      width: this.canvas.width,
      height: this.canvas.height,
      time,
      deltaTime: 0.016,
      sensorAngleDegrees: 45,
      ...settings,
    });
    const commandEncoder = this.device.createCommandEncoder();

    this.agentPipeline.execute(commandEncoder, this.trailMapA, this.trailMapB);
    this.diffusionPipeline.execute(commandEncoder, this.trailMapB, this.trailMapA);
    this.renderPipeline.execute(commandEncoder, this.trailMapB);
    [this.trailMapA, this.trailMapB] = [this.trailMapB, this.trailMapA];

    this.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(this.render.bind(this));
  }
}
