import { Agent } from './pipelines/agents/agent';
import { AgentPipeline } from './pipelines/agents/agent-pipeline';
import { DiffusionPipeline } from './pipelines/diffusion/diffusion-pipeline';
import { RenderPipeline } from './pipelines/render/render-pipeline';
import { SwipePipeline } from './pipelines/swipe/swipe-pipeline';
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
  private diffusionPipeline: DiffusionPipeline;
  private swipePipeline: SwipePipeline;

  private preferredCanvasFormat: GPUTextureFormat;
  private trailMapA?: GPUTexture;
  private trailMapB?: GPUTexture;

  private previousTime?: DOMHighResTimeStamp = null;
  private swipeLocation?: vec2;
  private isSwipeActive = false;

  public constructor(private canvas: HTMLCanvasElement) {}

  async start() {
    await this.initializeDevice();

    this.resize();
    window.addEventListener('resize', this.resize.bind(this));
    window.addEventListener('mousemove', this.onSwipe.bind(this));
    window.addEventListener('mousedown', (_) => (this.isSwipeActive = true));
    window.addEventListener('mouseup', (_) => (this.isSwipeActive = false));

    requestAnimationFrame(this.render.bind(this));

    this.agentPipeline = new AgentPipeline(this.device, this.spawnAgents());
    this.renderPipeline = new RenderPipeline(
      this.context,
      this.device,
      this.preferredCanvasFormat
    );
    this.swipePipeline = new SwipePipeline(this.device);
    this.diffusionPipeline = new DiffusionPipeline(this.device);
  }

  private onSwipe(event: MouseEvent) {
    const position = vec2.fromValues(event.clientX, event.clientY);
    this.swipeLocation = vec2.divide(
      position,
      position,
      vec2.fromValues(this.canvas.width, this.canvas.height)
    );
  }

  private spawnAgents(): Array<Agent> {
    const minSize = Math.min(this.canvas.width, this.canvas.height);
    const ratio = Math.max(this.canvas.width, this.canvas.height) / minSize;
    const size = vec2.fromValues(
      this.canvas.width / minSize,
      this.canvas.height / minSize
    );
    vec2.normalize(size, size);
    return new Array(settings.agentCount).fill(0).map(() => {
      const radius = randomBetween(0, settings.startingRadius / ratio);
      const angle = randomBetween(0, Math.PI * 2);
      const center = vec2.fromValues(0.5, 0.5);

      const delta = vec2.fromValues(Math.cos(angle) * radius, Math.sin(angle) * radius);
      vec2.divide(delta, delta, size);

      const position = vec2.add(vec2.create(), center, delta);

      return {
        position,
        angle: angle + Math.PI,
      };
    });
  }

  private resize() {
    const devicePixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * devicePixelRatio;

    this.trailMapA?.destroy();
    this.trailMapA = this.createTrailMap();

    this.trailMapB?.destroy();
    this.trailMapB = this.createTrailMap();
  }

  private createTrailMap(): GPUTexture {
    return this.device.createTexture({
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
    const deltaTime = this.calculateDeltaTime(time);

    this.agentPipeline.setParameters({
      width: this.canvas.width,
      height: this.canvas.height,
      time,
      deltaTime,
      ...settings,
    });
    this.swipePipeline.setParameters({
      width: this.canvas.width,
      height: this.canvas.height,
      isSwipeActive: this.isSwipeActive,
      swipe: this.swipeLocation,
      ...settings,
    });
    this.diffusionPipeline.setParameters({
      width: this.canvas.width,
      height: this.canvas.height,
      deltaTime,
      ...settings,
    });
    const commandEncoder = this.device.createCommandEncoder();

    for (let i = 0; i < settings.renderSpeed; i++) {
      this.agentPipeline.execute(commandEncoder, this.trailMapA, this.trailMapB);
      this.diffusionPipeline.execute(commandEncoder, this.trailMapB, this.trailMapA);
      if (this.isSwipeActive) {
        this.swipePipeline.execute(commandEncoder, this.trailMapA, this.trailMapB);
        this.renderPipeline.execute(commandEncoder, this.trailMapB);
      } else {
        this.renderPipeline.execute(commandEncoder, this.trailMapA);
        [this.trailMapA, this.trailMapB] = [this.trailMapB, this.trailMapA];
      }
    }

    this.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(this.render.bind(this));
  }

  private calculateDeltaTime(time: DOMHighResTimeStamp): number {
    if (this.previousTime === null) {
      this.previousTime = time;
    }
    const deltaTime = time - this.previousTime;
    this.previousTime = time;
    return deltaTime / 1000;
  }
}
