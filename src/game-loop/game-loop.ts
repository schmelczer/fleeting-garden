import { AgentPipeline } from '../pipelines/agents/agent-pipeline';
import { BrushPipeline } from '../pipelines/brush/brush-pipeline';
import { CommonState } from '../pipelines/common-state/common-state';
import { CopyPipeline } from '../pipelines/copy/copy-pipeline';
import { DiffusionPipeline } from '../pipelines/diffusion/diffusion-pipeline';
import { RenderPipeline } from '../pipelines/render/render-pipeline';
import { settings } from '../settings';
import { DeltaTimeCalculator } from '../utils/delta-time-calculator';
import { spawnAgents } from './spawn-agents';

import { vec2 } from 'gl-matrix';

export default class GameLoop {
  private readonly deltaTimeCalculator = new DeltaTimeCalculator();

  private readonly commonState: CommonState;
  private readonly copyPipeline: CopyPipeline;
  private readonly agentPipeline: AgentPipeline;
  private readonly renderPipeline: RenderPipeline;
  private readonly brushPipeline: BrushPipeline;
  private readonly diffusionPipeline: DiffusionPipeline;

  private trailMapA?: GPUTexture;
  private trailMapB?: GPUTexture;
  private trailMapAView?: GPUTextureView;
  private trailMapBView?: GPUTextureView;

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

    this.commonState = new CommonState(this.device);
    this.copyPipeline = new CopyPipeline(this.device);
    this.agentPipeline = new AgentPipeline(
      this.device,
      spawnAgents(this.canvasSize, settings.agentCount),
      this.commonState
    );
    this.brushPipeline = new BrushPipeline(this.device, this.commonState);
    this.diffusionPipeline = new DiffusionPipeline(this.device, this.commonState);
    this.renderPipeline = new RenderPipeline(context, this.device, this.commonState);

    window.addEventListener('resize', this.resize.bind(this));
    window.addEventListener('mousemove', this.onSwipe.bind(this));
    window.addEventListener('mousedown', (e) => {
      this.isSwipeActive = true;
      this.onSwipe(e);
    });
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

  private resize() {
    const devicePixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * devicePixelRatio;

    this.trailMapA?.destroy();
    this.trailMapA = this.createTrailMap();
    this.trailMapAView = this.trailMapA.createView();

    this.trailMapB?.destroy();
    this.trailMapB = this.createTrailMap();
    this.trailMapBView = this.trailMapB.createView();
  }

  private createTrailMap(): GPUTexture {
    return this.device.createTexture({
      format: 'rgba16float',
      dimension: '2d',
      mipLevelCount: 1,
      size: {
        width: this.canvas.width,
        height: this.canvas.height,
        depthOrArrayLayers: 1,
      },
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

    this.commonState.setParameters(this.canvasSize, deltaTime, time);

    [
      this.agentPipeline,
      this.brushPipeline,
      this.diffusionPipeline,
      this.renderPipeline,
    ].forEach((pipeline) => pipeline.setParameters(settings));

    const commandEncoder = this.device.createCommandEncoder();

    for (let i = 0; i < settings.renderSpeed; i++) {
      this.copyPipeline.execute(commandEncoder, this.trailMapAView, this.trailMapBView);
      this.brushPipeline.execute(commandEncoder, this.trailMapBView);
      this.agentPipeline.execute(commandEncoder, this.trailMapAView, this.trailMapBView);
      this.diffusionPipeline.execute(
        commandEncoder,
        this.trailMapBView,
        this.trailMapAView
      );
      this.renderPipeline.execute(commandEncoder, this.trailMapAView);
    }

    this.device.queue.submit([commandEncoder.finish()]);

    // await sleep(200);
    requestAnimationFrame(this.render.bind(this));
  }

  public destroy() {
    this.hasFinished = true;

    this.copyPipeline?.destroy();
    this.agentPipeline?.destroy();
    this.brushPipeline?.destroy();
    this.diffusionPipeline?.destroy();
    this.renderPipeline?.destroy();
    this.commonState?.destroy();

    this.trailMapA?.destroy();
    this.trailMapB?.destroy();

    this.resolveHasFinished();
  }

  private get canvasSize(): vec2 {
    return vec2.fromValues(this.canvas.width, this.canvas.height);
  }
}
