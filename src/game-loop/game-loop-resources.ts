import { vec2 } from 'gl-matrix';

import { appConfig, type GardenRuntimeSettings } from '../config';
import { AgentGenerationPipeline } from '../pipelines/agents/agent-generation/agent-generation-pipeline';
import { AgentPipeline } from '../pipelines/agents/agent-pipeline';
import { BrushPipeline } from '../pipelines/brush/brush-pipeline';
import { CommonState } from '../pipelines/common-state/common-state';
import { DiffusionPipeline } from '../pipelines/diffusion/diffusion-pipeline';
import { EraserAgentPipeline } from '../pipelines/eraser/eraser-agent-pipeline';
import { EraserTexturePipeline } from '../pipelines/eraser/eraser-texture-pipeline';
import { RenderPipeline } from '../pipelines/render/render-pipeline';
import { initializeContext } from '../utils/graphics/initialize-context';
import { CanvasReadbackRequest, RenderInputs } from './game-loop-types';
import { GpuProfiler } from './gpu-profiler';
import { SimulationFrameRenderer } from './simulation-frame';
import { SimulationTextures } from './simulation-textures';

interface FrameParameters extends RenderInputs {
  time: number;
  deltaTime: number;
  canvasSize: vec2;
  activeAgentCount: number;
  canvasPixelRatio: number;
  introProgress: number;
  selectedColorIndex: number;
  eraserPixelSize: number;
  runtimeSettings: GardenRuntimeSettings;
}

export class GameLoopResources {
  public readonly textures: SimulationTextures;
  public readonly commonState: CommonState;
  public readonly agentGenerationPipeline: AgentGenerationPipeline;
  public readonly agentPipeline: AgentPipeline;
  public readonly brushPipeline: BrushPipeline;
  public readonly eraserAgentPipeline: EraserAgentPipeline;
  public readonly eraserTexturePipeline: EraserTexturePipeline;
  public readonly diffusionPipeline: DiffusionPipeline;
  public readonly renderPipeline: RenderPipeline;
  public readonly gpuProfiler: GpuProfiler | null;

  private readonly frameRenderer: SimulationFrameRenderer;

  public constructor(
    canvas: HTMLCanvasElement,
    private readonly device: GPUDevice,
    private readonly canvasFormat: GPUTextureFormat,
    canvasSize: vec2,
    initialAgentCapacity: number,
    initialMaxAgentCount: number
  ) {
    const context = initializeContext({ device, canvas, format: canvasFormat });

    this.textures = new SimulationTextures(this.device, canvasSize);

    this.commonState = new CommonState(this.device);
    this.commonState.setParameters({
      canvasSize,
    });

    this.agentGenerationPipeline = new AgentGenerationPipeline(
      this.device,
      Math.min(initialMaxAgentCount, initialAgentCapacity)
    );

    this.agentPipeline = new AgentPipeline(
      this.device,
      this.commonState,
      () => this.agentGenerationPipeline.agentsBuffer
    );
    this.brushPipeline = new BrushPipeline(this.device, this.commonState);
    this.eraserAgentPipeline = new EraserAgentPipeline(
      this.device,
      () => this.agentGenerationPipeline.agentsBuffer
    );
    this.eraserTexturePipeline = new EraserTexturePipeline(this.device, this.commonState);
    this.diffusionPipeline = new DiffusionPipeline(this.device);
    this.renderPipeline = new RenderPipeline(context, this.device, this.canvasFormat);
    this.gpuProfiler = GpuProfiler.create(
      this.device,
      () => appConfig.tuningPane.showFpsOverlay
    );

    this.frameRenderer = new SimulationFrameRenderer(
      this.device,
      this.textures,
      {
        agentPipeline: this.agentPipeline,
        brushPipeline: this.brushPipeline,
        eraserAgentPipeline: this.eraserAgentPipeline,
        eraserTexturePipeline: this.eraserTexturePipeline,
        diffusionPipeline: this.diffusionPipeline,
        renderPipeline: this.renderPipeline,
      },
      this.gpuProfiler
    );
  }

  public resizeSimulationTo(nextSize: vec2): vec2 | null {
    return this.textures.resizeTo(nextSize);
  }

  public clearSimulation(): void {
    this.textures.clear();
    this.frameRenderer.resetSourceMapActivity();
  }

  public get isSourceMapActive(): boolean {
    return this.frameRenderer.isSourceMapActive;
  }

  public get gpuPassTimeMs(): number | undefined {
    return this.gpuProfiler?.latestTotalPassMs;
  }

  public setFrameParameters({
    time,
    deltaTime,
    canvasSize,
    activeAgentCount,
    canvasPixelRatio,
    introProgress,
    selectedColorIndex,
    channelColors,
    backgroundColor,
    eraserPixelSize,
    runtimeSettings,
  }: FrameParameters): void {
    this.commonState.setParameters({
      canvasSize,
    });
    this.agentPipeline.setParameters({
      ...runtimeSettings,
      deltaTime,
      time,
      agentCount: activeAgentCount,
      introMoveSpeed: appConfig.simulation.introMoveSpeed,
      introProgress,
    });
    this.brushPipeline.setParameters({
      ...runtimeSettings,
      pixelRatio: canvasPixelRatio,
      selectedColorIndex,
    });
    this.diffusionPipeline.setParameters(runtimeSettings);
    this.renderPipeline.setParameters({
      ...runtimeSettings,
      channelColors,
      backgroundColor,
    });
    this.eraserAgentPipeline.setParameters({
      agentCount: activeAgentCount,
      eraserSize: eraserPixelSize,
      eraserMaskAlphaThreshold: runtimeSettings.eraserMaskAlphaThreshold,
      maskSize: canvasSize,
    });
    this.eraserTexturePipeline.setParameters({
      eraserSize: eraserPixelSize,
      eraserLineDistanceEpsilon: runtimeSettings.eraserLineDistanceEpsilon,
      eraserClearRed: runtimeSettings.eraserClearRed,
      eraserClearGreen: runtimeSettings.eraserClearGreen,
      eraserClearBlue: runtimeSettings.eraserClearBlue,
      eraserClearAlpha: runtimeSettings.eraserClearAlpha,
    });
  }

  public executeFrame(
    isErasing: boolean,
    canvasReadbackRequest?: CanvasReadbackRequest | null
  ): void {
    this.frameRenderer.execute(isErasing, canvasReadbackRequest);
  }

  public destroy(): void {
    this.agentGenerationPipeline.destroy();
    this.agentPipeline.destroy();
    this.brushPipeline.destroy();
    this.eraserAgentPipeline.destroy();
    this.eraserTexturePipeline.destroy();
    this.diffusionPipeline.destroy();
    this.renderPipeline.destroy();
    this.gpuProfiler?.destroy();
    this.commonState.destroy();
    this.textures.destroy();
  }
}
