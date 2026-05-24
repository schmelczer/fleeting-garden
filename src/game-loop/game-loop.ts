import { vec2 } from 'gl-matrix';

import { GardenAudio } from '../audio/garden-audio';
import { appConfig } from '../config';
import { activeVibe, settings } from '../settings';
import { DeltaTimeCalculator } from '../utils/delta-time-calculator';
import { rgbColorToCss, type RgbColor } from '../utils/rgb-color';
import { AgentPopulation } from './agent-population';
import { EraserPreview } from './eraser-preview';
import { ExportSnapshotRenderer } from './export-snapshot-renderer';
import { FramePerformance } from './frame-performance';
import { GameLoopResources } from './game-loop-resources';
import { GardenUi } from './game-loop-types';
import { getInternalRenderSize } from './internal-render-size';
import { IntroPrompt } from './intro-prompt';
import { PerfStatsOverlay } from './perf-stats-overlay';
import { GardenPointerInput } from './pointer-input';
import { PipelineStrokeOutput } from './stroke-output';
import { ToolbarContrastMonitor } from './toolbar-contrast-monitor';

export default class GameLoop {
  private readonly resources: GameLoopResources;
  private readonly audio = new GardenAudio(appConfig.audio);
  private readonly introPrompt: IntroPrompt;
  private readonly eraserPreview: EraserPreview;
  private readonly pointerInput: GardenPointerInput;
  private readonly agentPopulation: AgentPopulation;
  private readonly exportSnapshotRenderer: ExportSnapshotRenderer;
  private readonly framePerformance = new FramePerformance();
  private perfStatsOverlay: PerfStatsOverlay | null = null;
  private readonly toolbarContrastMonitor: ToolbarContrastMonitor;
  private readonly seedValue = Math.floor(Math.random() * 0xffffffff);
  private readonly seed = this.seedValue.toString(16);
  private readonly _canvasSize: vec2 = vec2.create();

  private pendingIntroResizeAt: DOMHighResTimeStamp | null = null;
  private previousAccentColor = '';
  private previousGrainStrength = Number.NaN;
  private hasFinished = false;
  private animationFrameId: number | null = null;
  private destroyPromise: Promise<void> | null = null;
  private readonly finished = Promise.withResolvers<void>();

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly device: GPUDevice,
    private readonly canvasFormat: GPUTextureFormat,
    private readonly deltaTimeCalculator: DeltaTimeCalculator,
    private readonly ui: GardenUi
  ) {
    this.resize();
    this.resources = new GameLoopResources(
      canvas,
      device,
      this.canvasFormat,
      this.canvasSize,
      this.framePerformance.adaptiveCapInitial,
      settings.maxAgentCount
    );
    this.introPrompt = new IntroPrompt(ui.prompt);
    this.toolbarContrastMonitor = new ToolbarContrastMonitor(
      canvas,
      ui.toolbar,
      device,
      this.canvasFormat
    );
    this.agentPopulation = new AgentPopulation(
      this.resources.agentGenerationPipeline,
      this.seedValue,
      () => this.canvasPixelRatio,
      this.framePerformance
    );
    this.agentPopulation.initializeIntroAgents(this.canvasSize);
    this.pointerInput = new GardenPointerInput({
      canvas,
      audio: this.audio,
      strokeOutput: new PipelineStrokeOutput(
        this.resources.brushPipeline,
        this.resources.eraserAgentPipeline,
        this.resources.eraserTexturePipeline
      ),
      getCanvasPixelRatio: () => this.canvasPixelRatio,
      getMirrorSegmentCount: () => this.mirrorSegmentCount,
      onStartDrawing: () => {
        this.introPrompt.markStartedDrawing();
        this.agentPopulation.beginStroke();
      },
      onEraseGestureEnded: () => this.agentPopulation.requestCompactionAfterErase(),
      spawnStrokeAgents: (from, to) => this.agentPopulation.spawnStrokeAgents(from, to),
    });
    this.eraserPreview = new EraserPreview(
      canvas,
      ui.eraserPreview,
      () => this.pointerInput.isSwipeActive
    );
    this.exportSnapshotRenderer = new ExportSnapshotRenderer({
      device,
      renderPipeline: this.resources.renderPipeline,
      canvasFormat: this.canvasFormat,
      statusElement: ui.exportStatus,
      seed: this.seed,
      getSourceSize: () => {
        const size = this.resources.textures.trailMapA.getSize();
        return {
          width: size[0],
          height: size[1],
        };
      },
      getColorTextureView: () => this.resources.textures.trailMapA.getTextureView(),
      getSourceTextureView: () => this.resources.textures.sourceMapA.getTextureView(),
      getSourceActive: () => this.resources.isSourceMapActive,
      getVibeId: () => activeVibe.id,
    });

    this.syncPerfStatsOverlay();
  }

  public attachPointerInput(): void {
    this.pointerInput.attach();
    this.eraserPreview.attach();
  }

  public setEraseMode(isErasing: boolean): void {
    this.pointerInput.setEraseMode(isErasing);
    this.eraserPreview.setEraseMode(isErasing);
  }

  public updateEraserPreview(event?: PointerEvent): void {
    this.eraserPreview.update(event);
  }

  public onVibeChanged(): void {
    this.agentPopulation.onVibeChanged();
    this.syncPerfStatsOverlay();
  }

  public setAudioMuted(isMuted: boolean): void {
    this.audio.setMuted(isMuted);
  }

  public setAudioVolume(volume: number): void {
    this.audio.setMasterVolume(volume);
  }

  public startAudio(userGesture = false): void {
    this.audio.start(activeVibe, { userGesture });
  }

  public playVibeChangeAudio(userGesture = false): void {
    this.audio.changeVibe(activeVibe, { userGesture });
  }

  public async start(): Promise<void> {
    if (this.animationFrameId === null && !this.hasFinished) {
      this.animationFrameId = requestAnimationFrame(this.render);
    }
    return this.finished.promise;
  }

  public async exportSnapshot(): Promise<void> {
    return this.exportSnapshotRenderer.export();
  }

  public async destroy(): Promise<void> {
    this.destroyPromise ??= this.dispose();
    return this.destroyPromise;
  }

  private async dispose(): Promise<void> {
    this.hasFinished = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.pointerInput.detach();
    this.eraserPreview.detach();
    this.perfStatsOverlay?.destroy();
    this.perfStatsOverlay = null;
    this.toolbarContrastMonitor.destroy();
    this.introPrompt.destroy();
    await this.agentPopulation.waitForCompaction();
    this.resources.destroy();
    await this.audio.destroy();
    this.finished.resolve();
  }

  private readonly render = (time: DOMHighResTimeStamp) => {
    this.animationFrameId = null;
    if (this.hasFinished) {
      this.finished.resolve();
      return;
    }

    const deltaTime = this.deltaTimeCalculator.calculateDeltaTimeInSeconds(time);
    this.framePerformance.update(time);
    this.agentPopulation.updateAdaptiveCap();
    this.introPrompt.update(this.pendingIntroResizeAt === null ? deltaTime : 0);
    this.resize();
    this.resizeSimulationToCanvas(time);
    this.regenerateIntroAfterSettledResize(time);

    const channelColors = activeVibe.colors;
    const backgroundColor = activeVibe.backgroundColor;
    const runtimeSettings = { ...settings };
    const introProgress = this.introPrompt.progress;
    const canvasPixelRatio = this.canvasPixelRatio;
    const eraserPixelSize = runtimeSettings.eraserSize * canvasPixelRatio;
    const isErasing = this.pointerInput.isEraseMode;
    const accentColor =
      channelColors[runtimeSettings.selectedColorIndex] ?? channelColors[0];
    this.updateAccentColor(accentColor);
    this.updateGrainOverlay(runtimeSettings.backgroundGrainStrength);
    this.audio.update({
      vibe: activeVibe,
      isErasing,
    });

    this.resources.setFrameParameters({
      time,
      deltaTime,
      canvasSize: this.canvasSize,
      activeAgentCount: this.agentPopulation.activeAgentCount,
      canvasPixelRatio,
      introProgress,
      selectedColorIndex: runtimeSettings.selectedColorIndex,
      channelColors,
      backgroundColor,
      eraserPixelSize,
      runtimeSettings,
    });

    this.resources.executeFrame(
      isErasing,
      this.toolbarContrastMonitor.takeReadbackRequest(time)
    );

    this.pointerInput.clearSwipesIfIdle();
    this.agentPopulation.compactAfterErase(this.pointerInput.isSwipeActive);
    this.perfStatsOverlay?.update({
      time,
      fps: this.framePerformance.measuredFps,
      agentCount: this.agentPopulation.activeAgentCount,
      frameTimeMs: this.framePerformance.measuredFrameTimeMs,
      gpuPassTimeMs: this.resources.gpuPassTimeMs,
      renderWidth: this.canvas.width,
      renderHeight: this.canvas.height,
    });

    this.animationFrameId = requestAnimationFrame(this.render);
  };

  private syncPerfStatsOverlay(): void {
    if (appConfig.tuningPane.showFpsOverlay) {
      this.perfStatsOverlay ??= new PerfStatsOverlay(
        this.canvas.parentElement ?? document.body
      );
      return;
    }

    this.perfStatsOverlay?.destroy();
    this.perfStatsOverlay = null;
  }

  private updateAccentColor(color: RgbColor): void {
    const accentColor = rgbColorToCss(color);
    if (this.previousAccentColor === accentColor) {
      return;
    }

    this.previousAccentColor = accentColor;
    document.documentElement.style.setProperty('--accent-color', accentColor);
  }

  private updateGrainOverlay(strength: number): void {
    const safeStrength = Number.isFinite(strength) ? Math.max(0, strength) : 0;
    if (Object.is(this.previousGrainStrength, safeStrength)) {
      return;
    }

    this.previousGrainStrength = safeStrength;
    this.grainOverlay.hidden = safeStrength <= 0;
    this.grainOverlay.style.setProperty('--garden-grain-strength', String(safeStrength));
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const { width, height } = getInternalRenderSize({
      clientHeight: rect.height || this.canvas.clientHeight,
      clientWidth: rect.width || this.canvas.clientWidth,
      maxTextureDimension: this.device.limits.maxTextureDimension2D,
      targetAreaMegapixels: settings.internalRenderAreaMegapixels,
    });

    if (this.canvas.width === width && this.canvas.height === height) {
      return;
    }

    this.canvas.width = width;
    this.canvas.height = height;
  }

  private resizeSimulationToCanvas(time: DOMHighResTimeStamp): void {
    const scale = this.resources.resizeSimulationTo(this.canvasSize);
    if (!scale) {
      return;
    }

    this.agentPopulation.resizeAgents(scale);
    this.pointerInput.scaleLastPointerPosition(scale);

    if (this.introPrompt.shouldRegenerateTitleOnResize) {
      this.pendingIntroResizeAt = time;
    }
  }

  private regenerateIntroAfterSettledResize(time: DOMHighResTimeStamp): void {
    if (this.pendingIntroResizeAt === null) {
      return;
    }

    if (!this.introPrompt.shouldRegenerateTitleOnResize) {
      this.pendingIntroResizeAt = null;
      return;
    }

    if (time - this.pendingIntroResizeAt < appConfig.simulation.intro.resizeSettleMs) {
      return;
    }

    this.introPrompt.rewindToLeaveRemainingTime(
      appConfig.simulation.intro.resizeMinimumRemainingSeconds
    );
    this.resources.clearSimulation();
    this.agentPopulation.replaceIntroAgents(this.canvasSize, this.introPrompt.progress);
    this.pendingIntroResizeAt = null;
  }

  private get canvasSize(): vec2 {
    vec2.set(this._canvasSize, this.canvas.width, this.canvas.height);
    return this._canvasSize;
  }

  private get canvasPixelRatio(): number {
    const rect = this.canvas.getBoundingClientRect();
    const xScale = rect.width > 0 ? this.canvas.width / rect.width : 1;
    const yScale = rect.height > 0 ? this.canvas.height / rect.height : xScale;
    const ratio = (xScale + yScale) / 2;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  }

  private get mirrorSegmentCount(): number {
    const count = Number.isFinite(settings.mirrorSegmentCount)
      ? settings.mirrorSegmentCount
      : appConfig.toolbar.mirror.min;
    return Math.min(
      appConfig.toolbar.mirror.max,
      Math.max(appConfig.toolbar.mirror.min, Math.round(count))
    );
  }

  private get grainOverlay(): HTMLElement {
    return this.ui.grainOverlay;
  }
}
