import { vec2 } from 'gl-matrix';

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
  private resolveHasFinished!: () => void;

  private activePointerId: number | null = null;

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
      settings.maxAgentCountUpperLimit
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
    canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
    canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
    canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
    canvas.addEventListener('pointercancel', this.onPointerUp.bind(this));
  }

  private onPointerDown(event: PointerEvent) {
    if (this.activePointerId !== null) {
      return;
    }
    this.activePointerId = event.pointerId;
    this.canvas.setPointerCapture(event.pointerId);
    this.brushPipeline.clearSwipes();
    this.addSwipeAt(event);
  }

  private onPointerMove(event: PointerEvent) {
    if (event.pointerId !== this.activePointerId) {
      return;
    }
    this.addSwipeAt(event);
  }

  private onPointerUp(event: PointerEvent) {
    if (event.pointerId !== this.activePointerId) {
      return;
    }
    this.addSwipeAt(event);
    this.canvas.releasePointerCapture(event.pointerId);
    this.activePointerId = null;
  }

  private addSwipeAt(event: PointerEvent) {
    const position = vec2.fromValues(
      event.clientX * this.devicePixelRatio,
      this.canvas.height - event.clientY * this.devicePixelRatio
    );
    this.brushPipeline.addSwipe(position);
  }

  private get isSwipeActive(): boolean {
    return this.activePointerId !== null;
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
    const generationCounts = await this.agentGenerationPipeline.countAgents(
      settings.agentCount
    );
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
      `rgb(${accentColor[0] * 255},${accentColor[1] * 255},${accentColor[2] * 255})`
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
        isNextGenerationOdd: this.gameRules.nextGenerationId % 2,
        nextGenerationSensorOffsetDistance: this.gameRules.getSensorOffset(),
        nextGenerationSpeed: this.gameRules.getNextGenerationMoveSpeed(),
        infectionProbability: this.gameRules.getInfectionProbability(),
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
