import { AgentGenerationPipeline } from '../pipelines/agents/agent-generation/agent-generation-pipeline';
import { AgentPipeline } from '../pipelines/agents/agent-pipeline';
import { spawnAgents } from '../pipelines/agents/spawn-agents';
import { BrushPipeline } from '../pipelines/brush/brush-pipeline';
import { CommonState } from '../pipelines/common-state/common-state';
import { CopyPipeline } from '../pipelines/copy/copy-pipeline';
import { DiffusionPipeline } from '../pipelines/diffusion/diffusion-pipeline';
import { RenderPipeline } from '../pipelines/render/render-pipeline';
import { settings } from '../settings';
import { DeltaTimeCalculator } from '../utils/delta-time-calculator';
import { ResizableTexture } from '../utils/graphics/resizable-texture';
import { sleep } from '../utils/sleep';

import { vec2 } from 'gl-matrix';

export default class GameLoop {
  private readonly deltaTimeCalculator = new DeltaTimeCalculator();

  private readonly trailMapA: ResizableTexture;
  private readonly trailMapB: ResizableTexture;
  private readonly commonState: CommonState;
  private readonly copyPipeline: CopyPipeline;
  private readonly agentGenerationPipeline: AgentGenerationPipeline;
  private readonly agentPipeline: AgentPipeline;
  private readonly renderPipeline: RenderPipeline;
  private readonly brushPipeline: BrushPipeline;
  private readonly diffusionPipeline: DiffusionPipeline;

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
    const context = this.canvas.getContext('webgpu') as any as GPUCanvasContext;
    context.configure({
      device: this.device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: 'premultiplied',
    });

    this.trailMapA = new ResizableTexture(this.device, this.canvasSize);
    this.trailMapB = new ResizableTexture(this.device, this.canvasSize);
    this.resize();

    this.commonState = new CommonState(this.device);
    this.commonState.setParameters(this.canvasSize, 0, 0);

    this.copyPipeline = new CopyPipeline(this.device);

    this.agentGenerationPipeline = new AgentGenerationPipeline(
      this.device,
      this.commonState
    );

    this.agentPipeline = new AgentPipeline(
      this.device,
      this.commonState,
      this.agentGenerationPipeline.generateAgents(settings.agentCount)
    );
    this.brushPipeline = new BrushPipeline(this.device, this.commonState);
    this.diffusionPipeline = new DiffusionPipeline(this.device, this.commonState);
    this.renderPipeline = new RenderPipeline(context, this.device, this.commonState);

    window.addEventListener('resize', this.resize.bind(this));
    canvas.addEventListener('mousemove', this.onSwipe.bind(this));
    canvas.addEventListener('mousedown', (e) => {
      this.brushPipeline.clearSwipes();
      this.isSwipeActive = true;
      this.onSwipe(e);
    });
    window.addEventListener('mouseup', (e) => {
      this.onSwipe(e);
      this.isSwipeActive = false;
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

    const position = vec2.fromValues(
      event.clientX * this.devicePixelRatio,
      this.canvas.height - event.clientY * this.devicePixelRatio
    );
    this.brushPipeline.addSwipe(position);
  }

  private resize() {
    this.canvas.width = this.canvas.clientWidth * this.devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * this.devicePixelRatio;
  }

  private async render(time: DOMHighResTimeStamp) {
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
      this.copyPipeline.execute(
        commandEncoder,
        this.trailMapA.getTextureView(),
        this.trailMapB.getTextureView()
      );
      this.brushPipeline.execute(commandEncoder, this.trailMapB.getTextureView());
      this.agentPipeline.execute(
        commandEncoder,
        this.trailMapA.getTextureView(),
        this.trailMapB.getTextureView()
      );
      this.diffusionPipeline.execute(
        commandEncoder,
        this.trailMapB.getTextureView(),
        this.trailMapA.getTextureView()
      );
      this.renderPipeline.execute(commandEncoder, this.trailMapA.getTextureView());
    }

    this.device.queue.submit([commandEncoder.finish()]);

    if (!this.isSwipeActive) {
      this.brushPipeline.clearSwipes();
    }

    if (settings.simulatedDelayMs > 0) {
      await sleep(settings.simulatedDelayMs);
    }

    // avoid resizing during rendering
    this.trailMapA.resize(this.canvasSize);
    this.trailMapB.resize(this.canvasSize);

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

  private get devicePixelRatio(): number {
    return window.devicePixelRatio || 1;
  }
}
