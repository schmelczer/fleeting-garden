import { AgentPipeline } from '../pipelines/agents/agent-pipeline';
import { BrushPipeline } from '../pipelines/brush/brush-pipeline';
import { DiffusionPipeline } from '../pipelines/diffusion/diffusion-pipeline';
import { EraserAgentPipeline } from '../pipelines/eraser/eraser-agent-pipeline';
import { EraserTexturePipeline } from '../pipelines/eraser/eraser-texture-pipeline';
import { RenderPipeline } from '../pipelines/render/render-pipeline';
import { settings } from '../settings';
import { CanvasReadbackRequest } from './game-loop-types';
import { GpuProfiler } from './gpu-profiler';
import { SimulationTextures } from './simulation-textures';

const BRUSH_EFFECT_FRAMES_PER_SECOND = 60;
// How long the source map continues to be diffused after a brush stroke ends.
// 600 frames at ~60 FPS is roughly 10 seconds.
const SOURCE_ACTIVE_FRAMES_AFTER_WRITE = 600;

interface SimulationFramePipelines {
  agentPipeline: AgentPipeline;
  brushPipeline: BrushPipeline;
  eraserAgentPipeline: EraserAgentPipeline;
  eraserTexturePipeline: EraserTexturePipeline;
  diffusionPipeline: DiffusionPipeline;
  renderPipeline: RenderPipeline;
}

export class SimulationFrameRenderer {
  private sourceActiveFramesRemaining = 0;
  private sourceMapsCleared = true;

  public constructor(
    private readonly device: GPUDevice,
    private readonly textures: SimulationTextures,
    private readonly pipelines: SimulationFramePipelines,
    private readonly gpuProfiler: GpuProfiler | null = null
  ) {}

  public resetSourceMapActivity(): void {
    this.sourceActiveFramesRemaining = 0;
    this.sourceMapsCleared = true;
  }

  public get isSourceMapActive(): boolean {
    return this.sourceActiveFramesRemaining > 0;
  }

  public execute(
    isErasing: boolean,
    canvasReadbackRequest?: CanvasReadbackRequest | null
  ): void {
    const commandEncoder = this.device.createCommandEncoder();
    this.gpuProfiler?.beginFrame();

    // Clear the deposit map up-front so agents write fresh deposits each frame
    // and diffuse sees only this frame's contributions added to trailMapA.
    this.textures.clearDepositMap(commandEncoder);
    let wroteSourceMap = false;
    if (isErasing) {
      if (this.pipelines.eraserAgentPipeline.hasActiveMask()) {
        const eraserMask = this.textures.eraserMask.getTextureView();
        // Erase trailMapA directly — it's what agent and diffuse will read.
        this.pipelines.eraserTexturePipeline.executeCombined(
          commandEncoder,
          eraserMask,
          this.textures.sourceMapA.getTextureView(),
          this.textures.trailMapA.getTextureView(),
          this.gpuProfiler?.timestampWrites('eraserTexture')
        );
        this.pipelines.eraserAgentPipeline.execute(
          commandEncoder,
          eraserMask,
          this.gpuProfiler?.timestampWrites('eraserAgent')
        );
      }
    } else {
      wroteSourceMap = this.pipelines.brushPipeline.executeSource(
        commandEncoder,
        this.textures.sourceMapA.getTextureView(),
        this.gpuProfiler?.timestampWrites('brush')
      );
    }

    if (wroteSourceMap) {
      this.sourceActiveFramesRemaining = getSourceActiveFrameCount();
      this.sourceMapsCleared = false;
    }

    const useSourceMap = this.isSourceMapActive;
    if (!useSourceMap && !this.sourceMapsCleared) {
      this.textures.clearSourceMaps(commandEncoder);
      this.sourceMapsCleared = true;
    }

    this.pipelines.agentPipeline.execute(
      commandEncoder,
      this.textures.trailMapA.getTextureView(),
      this.textures.depositMap.getTextureView(),
      this.gpuProfiler?.timestampWrites('agent')
    );
    this.pipelines.diffusionPipeline.execute(
      commandEncoder,
      this.textures.trailMapA.getTextureView(),
      this.textures.trailMapB.getTextureView(),
      this.textures.trailMapA.getSize(),
      this.textures.depositMap.getTextureView(),
      this.gpuProfiler?.timestampWrites('trailDiffusion')
    );
    const canvasTexture = this.pipelines.renderPipeline.execute(
      commandEncoder,
      this.textures.trailMapB.getTextureView(),
      this.textures.sourceMapA.getTextureView(),
      useSourceMap,
      this.gpuProfiler?.timestampWrites('render')
    );
    canvasReadbackRequest?.encode(commandEncoder, canvasTexture);

    if (useSourceMap) {
      this.pipelines.diffusionPipeline.execute(
        commandEncoder,
        this.textures.sourceMapA.getTextureView(),
        this.textures.sourceMapB.getTextureView(),
        this.textures.sourceMapB.getSize(),
        null,
        this.gpuProfiler?.timestampWrites('sourceDiffusion')
      );
    }
    const afterGpuProfileSubmit = this.gpuProfiler?.resolve(commandEncoder);
    this.device.queue.submit([commandEncoder.finish()]);
    afterGpuProfileSubmit?.();
    canvasReadbackRequest?.afterSubmit();
    // After this frame's diffuse, trailMapB holds the fresh trail; swap so
    // trailMapA is "current trail" again for the next frame and any external
    // readers (e.g. export snapshot).
    this.textures.swapTrailMaps();
    if (useSourceMap) {
      this.textures.swapSourceMaps();
      this.sourceActiveFramesRemaining -= 1;
    }
  }
}

const getSourceActiveFrameCount = (): number => {
  const frameCount = settings.brushEffectDuration * BRUSH_EFFECT_FRAMES_PER_SECOND;
  if (Number.isFinite(frameCount) && frameCount > 0) {
    return Math.ceil(frameCount);
  }
  return Math.max(1, SOURCE_ACTIVE_FRAMES_AFTER_WRITE);
};
