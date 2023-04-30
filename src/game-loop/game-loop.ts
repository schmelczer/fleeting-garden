import { Agent } from '../pipelines/agents/agent';
import { AgentPipeline } from '../pipelines/agents/agent-pipeline';
import { BrushPipeline } from '../pipelines/brush/brush-pipeline';
import { DiffusionPipeline } from '../pipelines/diffusion/diffusion-pipeline';
import { RenderPipeline } from '../pipelines/render/render-pipeline';
import { settings } from '../settings';
import { DeltaTimeCalculator } from '../utils/delta-time-calculator';
import { Random } from '../utils/random';

import { vec2 } from 'gl-matrix';

export default class GameLoop {
  private readonly deltaTimeCalculator = new DeltaTimeCalculator();

  private readonly agentPipeline: AgentPipeline;
  private readonly renderPipeline: RenderPipeline;
  private readonly brushPipeline: BrushPipeline;
  private readonly diffusionPipeline: DiffusionPipeline;

  private trailMapA?: GPUTexture;
  private trailMapB?: GPUTexture;

  private hasFinished = false;
  private readonly hasFinishedPromise: Promise<void> = new Promise(
    (resolve) => (this.resolveHasFinished = resolve)
  );
  private resolveHasFinished: () => void;

  private isSwipeActive = false;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly device: GPUDevice
  ) {
    const context = this.canvas.getContext('webgpu') as any;
    context.configure({
      device: this.device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: 'premultiplied',
    });

    this.resize();

    this.agentPipeline = new AgentPipeline(this.device, this.spawnAgents());
    this.brushPipeline = new BrushPipeline(this.device);
    this.diffusionPipeline = new DiffusionPipeline(this.device);
    this.renderPipeline = new RenderPipeline(context, this.device);

    window.addEventListener('resize', this.resize.bind(this));
    window.addEventListener('mousemove', this.onSwipe.bind(this));
    window.addEventListener('mousedown', (_) => (this.isSwipeActive = true));
    window.addEventListener('mouseup', (_) => {
      this.isSwipeActive = false;
      this.brushPipeline.clearSwipes();
    });
  }

  public async start(): Promise<void> {
    requestAnimationFrame(this.render.bind(this));
    return this.hasFinishedPromise;
  }

  private onSwipe(event: MouseEvent) {
    if (!this.isSwipeActive) {
      return;
    }

    this.brushPipeline.addSwipe(
      vec2.fromValues(event.clientX, this.canvas.height - event.clientY)
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
      const radius = Random.randomBetween(0, settings.startingRadius / ratio);
      const angle = Random.randomBetween(0, Math.PI * 2);
      const center = vec2.fromValues(0.5, 0.5);

      const delta = vec2.fromValues(Math.cos(angle) * radius, Math.sin(angle) * radius);
      vec2.divide(delta, delta, size);

      const position = vec2.add(vec2.create(), center, delta);

      return {
        position,
        angle: angle + Math.PI,
        species: 0,
        timeToLive: Random.randomBetween(10, 15000),
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

  private render(time: DOMHighResTimeStamp) {
    if (this.hasFinished) {
      return;
    }

    const deltaTime = this.deltaTimeCalculator.calculateDeltaTimeInSeconds(time);

    const params = {
      canvasSize: vec2.fromValues(this.canvas.width, this.canvas.height),
      time,
      deltaTime,
      ...settings,
    };

    [
      this.agentPipeline,
      this.brushPipeline,
      this.diffusionPipeline,
      this.renderPipeline,
    ].forEach((pipeline) => pipeline.setParameters(params));

    const commandEncoder = this.device.createCommandEncoder();

    for (let i = 0; i < settings.renderSpeed; i++) {
      this.agentPipeline.execute(commandEncoder, this.trailMapA, this.trailMapB);
      this.brushPipeline.execute(commandEncoder, this.trailMapB);
      this.diffusionPipeline.execute(commandEncoder, this.trailMapB, this.trailMapA);
      this.renderPipeline.execute(commandEncoder, this.trailMapA);
      [this.trailMapA, this.trailMapB] = [this.trailMapB, this.trailMapA];
    }

    this.device.queue.submit([commandEncoder.finish()]);

    // await sleep(200);
    requestAnimationFrame(this.render.bind(this));
  }

  public destroy() {
    this.hasFinished = true;

    this.agentPipeline?.destroy();
    this.brushPipeline?.destroy();
    this.diffusionPipeline?.destroy();
    this.renderPipeline?.destroy();

    this.trailMapA?.destroy();
    this.trailMapB?.destroy();

    this.resolveHasFinished();
  }
}
