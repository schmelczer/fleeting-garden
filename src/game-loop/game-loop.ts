import { AgentGenerationPipeline } from '../pipelines/agents/agent-generation/agent-generation-pipeline';
import { AgentPipeline } from '../pipelines/agents/agent-pipeline';
import { BrushPipeline } from '../pipelines/brush/brush-pipeline';
import { CommonState } from '../pipelines/common-state/common-state';
import { CopyPipeline } from '../pipelines/copy/copy-pipeline';
import { DiffusionPipeline } from '../pipelines/diffusion/diffusion-pipeline';
import { RenderPipeline } from '../pipelines/render/render-pipeline';
import { settings } from '../settings';
import { DeltaTimeCalculator } from '../utils/delta-time-calculator';
import { initializeContext } from '../utils/graphics/initialize-context';
import { ResizableTexture } from '../utils/graphics/resizable-texture';
import { sleep } from '../utils/sleep';
import { GamePresentation } from './game-presentation';
import { GameRules } from './game-rules';

import { vec2 } from 'gl-matrix';

export default class GameLoop {
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
    private readonly device: GPUDevice,
    private readonly deltaTimeCalculator: DeltaTimeCalculator,
    private readonly gameRules: GameRules
  ) {
    const context = initializeContext({ device, canvas });

    this.trailMapA = new ResizableTexture(this.device, this.canvasSize);
    this.trailMapB = new ResizableTexture(this.device, this.canvasSize);
    this.resize();

    this.copyPipeline = new CopyPipeline(this.device);

    this.commonState = new CommonState(this.device);
    this.commonState.setParameters({
      canvasSize: this.canvasSize,
      time: 0,
      deltaTime: 0,
    });

    this.agentGenerationPipeline = new AgentGenerationPipeline(
      this.device,
      this.commonState,
      settings.agentCount
    );
    this.agentGenerationPipeline.spawnFirstGeneration();

    this.agentPipeline = new AgentPipeline(
      this.device,
      this.commonState,
      this.agentGenerationPipeline.agentsBuffer
    );
    this.brushPipeline = new BrushPipeline(this.device, this.commonState);
    this.diffusionPipeline = new DiffusionPipeline(this.device, this.commonState);
    this.renderPipeline = new RenderPipeline(context, this.device, this.commonState);

    window.addEventListener('resize', this.resize.bind(this));
    canvas.addEventListener('mousemove', this.onSwipe.bind(this));
    canvas.addEventListener('touchmove', this.onSwipe.bind(this));
    canvas.addEventListener('mousedown', (e) => {
      if (!this.isSwipeActive) {
        this.brushPipeline.clearSwipes();
        this.isSwipeActive = true;
      }
      this.onSwipe(e);
    });

    canvas.addEventListener('touchstart', (e) => {
      if (!this.isSwipeActive) {
        this.brushPipeline.clearSwipes();
        this.isSwipeActive = true;
      }
      this.onSwipe(e);
    });

    window.addEventListener('mouseup', (e) => {
      this.onSwipe(e);
      this.isSwipeActive = false;
    });

    window.addEventListener('touchend', (e) => {
      this.onSwipe(e);
      this.isSwipeActive = false;
    });

    window.addEventListener('touchcancel', (e) => {
      this.onSwipe(e);
      this.isSwipeActive = false;
    });
  }

  public async start(): Promise<void> {
    requestAnimationFrame(this.render.bind(this));
    requestAnimationFrame(this.updateCounts.bind(this));
    return this.hasFinishedPromise;
  }

  private async updateCounts(): Promise<void> {
    if (this.hasFinished) {
      return;
    }
    const generationCounts = await this.agentGenerationPipeline.countAgents();
    this.gameRules.updateGenerationCounts(generationCounts);
    requestAnimationFrame(this.updateCounts.bind(this));
  }

  public get aliveAgentCounts(): {
    currentGenerationCount: number;
    nextGenerationCount: number;
  } {
    return this.gameRules.generationCounts;
  }

  public get maxAgentCount(): number {
    return this.agentGenerationPipeline.maxAgentCount;
  }

  private onSwipe(event: MouseEvent | TouchEvent) {
    if (!this.isSwipeActive || !event) {
      return;
    }

    if (event instanceof TouchEvent && event.touches.length === 0) {
      return;
    }

    const x = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
    const y = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;

    const position = vec2.fromValues(
      x * this.devicePixelRatio,
      this.canvas.height - y * this.devicePixelRatio
    );
    this.brushPipeline.addSwipe(position);
  }

  private resize() {
    this.canvas.width = this.canvas.clientWidth * this.devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * this.devicePixelRatio;
  }

  private async render(time: DOMHighResTimeStamp) {
    if (this.hasFinished) {
      this.resolveHasFinished();
      return;
    }

    const accentColor = GamePresentation.getGenerationColor(
      this.gameRules.nextGenerationId - 1
    );
    document.documentElement.style.setProperty(
      '--accent-color',
      `rgb(${accentColor.map((v) => v * 255).join(',')})`
    );

    const deltaTime = this.deltaTimeCalculator.calculateDeltaTimeInSeconds(time);

    time *= settings.renderSpeed;
    const timeInSeconds = time / 1000;
    const spawnAction = this.gameRules.getSpawnAction(timeInSeconds, this.canvasSize);

    [
      this.commonState,
      this.agentPipeline,
      this.brushPipeline,
      this.diffusionPipeline,
      this.renderPipeline,
    ].forEach((pipeline) =>
      pipeline.setParameters({
        time,
        evenGenerationAggression:
          this.gameRules.nextGenerationId % 2
            ? -1
            : this.gameRules.nextGenerationAgression,
        oddGenerationAggression:
          this.gameRules.nextGenerationId % 2
            ? this.gameRules.nextGenerationAgression
            : -1,
        nextGenerationId: this.gameRules.nextGenerationId,
        deltaTime,
        canvasSize: this.canvasSize,
        brushColor: GamePresentation.getGenerationColor(
          this.gameRules.nextGenerationId - 1
        ),
        evenGenerationColor: GamePresentation.getGenerationColor(
          this.gameRules.nextGenerationId % 2 == 0
            ? this.gameRules.nextGenerationId
            : this.gameRules.nextGenerationId - 1
        ),
        oddGenerationColor: GamePresentation.getGenerationColor(
          this.gameRules.nextGenerationId % 2 == 1
            ? this.gameRules.nextGenerationId
            : this.gameRules.nextGenerationId - 1
        ),
        ...settings,
        center: spawnAction.position,
        radius: spawnAction.radius,
      })
    );

    for (let i = 0; i < settings.renderSpeed; i++) {
      const commandEncoder = this.device.createCommandEncoder();

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

      this.device.queue.submit([commandEncoder.finish()]);
    }

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

  public async destroy() {
    this.hasFinished = true;
    await this.hasFinishedPromise;

    this.copyPipeline?.destroy();
    this.agentGenerationPipeline?.destroy();
    this.agentPipeline?.destroy();
    this.brushPipeline?.destroy();
    this.diffusionPipeline?.destroy();
    this.renderPipeline?.destroy();
    this.commonState?.destroy();
    this.trailMapA?.destroy();
    this.trailMapB?.destroy();
  }

  private get canvasSize(): vec2 {
    return vec2.fromValues(this.canvas.width, this.canvas.height);
  }

  private get devicePixelRatio(): number {
    return window.devicePixelRatio || 1;
  }
}
