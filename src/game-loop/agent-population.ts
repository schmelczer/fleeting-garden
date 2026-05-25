import { vec2 } from 'gl-matrix';

import { getRenderQualityBrushSize } from '../config/brush-size';
import { AgentGenerationPipeline } from '../pipelines/agents/agent-generation/agent-generation-pipeline';
import { AGENT_FLOAT_COUNT, writeAgentValues } from '../pipelines/agents/agent-limits';
import { getSafePixelRatio } from '../pipelines/brush/brush-pipeline';
import { settings } from '../settings';
import type { FramePerformance } from './frame-performance';
import { createIntroTitleAgents } from './intro-title-agents';

export const STROKE_AGENT_BATCH_CAPACITY = 2_400;
export const STROKE_DENSITY_MULTIPLIER = 110;

const INITIAL_INTRO_AGENT_COUNT = 180_000;

export class AgentPopulation {
  private activeCount = 0;
  // Current performance-aware limit; new agents above it replace old agents.
  private adaptiveCap: number;
  // Next active agent slot to overwrite when new agents exceed the current cap.
  private replacementCursor = 0;
  private canExpandAdaptiveCap = true;
  private shouldCompactAfterErase = false;
  private isCompacting = false;
  private pendingCompaction: Promise<void> | null = null;
  private readonly queuedAgentBatches: Array<Float32Array> = [];
  private pendingStrokeAgentCount = 0;
  private readonly strokeAgentData = new Float32Array(
    STROKE_AGENT_BATCH_CAPACITY * AGENT_FLOAT_COUNT
  );

  public constructor(
    private readonly pipeline: AgentGenerationPipeline,
    private readonly introSeed: number,
    private readonly getCanvasPixelRatio: () => number,
    private readonly framePerformance: FramePerformance
  ) {
    this.adaptiveCap = this.clampAndEnsureAdaptiveCap(
      this.framePerformance.adaptiveCapInitial
    );
  }

  public get activeAgentCount(): number {
    return this.activeCount;
  }

  public initializeIntroAgents(canvasSize: vec2): void {
    this.replaceIntroAgents(canvasSize, 0);
  }

  public replaceIntroAgents(canvasSize: vec2, progress: number): void {
    this.adaptiveCap = this.clampAndEnsureAdaptiveCap(this.adaptiveCap);
    const introAgentCount = Math.min(this.adaptiveCap, INITIAL_INTRO_AGENT_COUNT);
    const data = createIntroTitleAgents({
      count: introAgentCount,
      width: canvasSize[0],
      height: canvasSize[1],
      progress,
      seed: this.introSeed,
    });

    if (data.length === 0) {
      this.activeCount = 0;
      this.replacementCursor = 0;
      return;
    }

    this.pipeline.writeAgents(0, data);
    this.activeCount = data.length / AGENT_FLOAT_COUNT;
    this.replacementCursor = 0;
  }

  public onVibeChanged(): void {
    this.pendingStrokeAgentCount = 0;
    this.adaptiveCap = this.clampAndEnsureAdaptiveCap(this.adaptiveCap);
    this.trimActiveCountToBudget();
  }

  public beginStroke(): void {
    this.pendingStrokeAgentCount = 0;
  }

  public resizeAgents(scale: vec2): void {
    this.pipeline.resizeAgents(this.activeCount, scale);
  }

  public requestCompactionAfterErase(): void {
    this.shouldCompactAfterErase = true;
  }

  public compactAfterErase(isSwipeActive: boolean): void {
    if (!this.shouldCompactAfterErase || this.isCompacting || isSwipeActive) {
      return;
    }

    this.shouldCompactAfterErase = false;
    if (this.activeCount === 0) {
      return;
    }

    this.isCompacting = true;
    this.pendingCompaction = this.pipeline
      .compactAgents(this.activeCount)
      .then((compactedAgentCount) => {
        const finiteCompactedAgentCount = Number.isFinite(compactedAgentCount)
          ? Math.max(0, Math.floor(compactedAgentCount))
          : 0;
        this.activeCount = Math.min(this.activeCount, finiteCompactedAgentCount);
        this.clampReplacementCursor();
        this.trimActiveCountToBudget();
      })
      .catch((error: unknown) => {
        console.warn('Could not compact agents after erase.', error);
      })
      .finally(() => {
        this.isCompacting = false;
        this.pendingCompaction = null;
        this.flushQueuedAgentBatches();
      });
  }

  public async waitForCompaction(): Promise<void> {
    await this.pendingCompaction;
  }

  public updateAdaptiveCap(): void {
    const previousCap = this.clampAndEnsureAdaptiveCap(this.adaptiveCap);
    this.canExpandAdaptiveCap = this.framePerformance.hasAdaptiveCapHeadroom;

    if (this.canExpandAdaptiveCap) {
      this.adaptiveCap = previousCap;
      this.trimActiveCountToBudget();
      return;
    }

    const decrease = this.framePerformance.adaptiveCapDecreaseAgents;
    const responsiveCap = Math.min(
      previousCap,
      this.clampAndEnsureAdaptiveCap(this.activeCount)
    );
    const nextCap = this.clampAndEnsureAdaptiveCap(responsiveCap - decrease);
    this.adaptiveCap = nextCap;
    this.trimActiveCountToBudget(decrease);
  }

  public spawnStrokeAgents(from: vec2, to: vec2): void {
    const deltaX = to[0] - from[0];
    const deltaY = to[1] - from[1];
    const length = Math.hypot(deltaX, deltaY);
    const spawnRate = getStrokeSpawnRate();
    if (!Number.isFinite(length) || length <= 0 || spawnRate <= 0) {
      return;
    }

    const expectedAgentCount = length * spawnRate + this.pendingStrokeAgentCount;
    if (!Number.isFinite(expectedAgentCount)) {
      this.pendingStrokeAgentCount = 0;
      return;
    }

    const count = Math.floor(expectedAgentCount);
    this.pendingStrokeAgentCount = expectedAgentCount - count;

    if (count <= 0) {
      return;
    }

    const baseAngle = Math.atan2(deltaY, deltaX);
    const spread =
      getRenderQualityBrushSize(
        settings.brushSize,
        settings.internalRenderAreaMegapixels
      ) * getSafePixelRatio(this.getCanvasPixelRatio());
    const batchCapacity = this.strokeAgentData.length / AGENT_FLOAT_COUNT;
    if (batchCapacity <= 0) {
      return;
    }

    for (let written = 0; written < count; written += batchCapacity) {
      const batchCount = Math.min(batchCapacity, count - written);
      this.populateStrokeAgentBatch({
        baseAngle,
        batchCount,
        from,
        spread,
        to,
        totalCount: count,
        written,
      });
      this.writeAgentBatch(
        this.strokeAgentData.subarray(0, batchCount * AGENT_FLOAT_COUNT)
      );
    }
  }

  private populateStrokeAgentBatch({
    baseAngle,
    batchCount,
    from,
    spread,
    to,
    totalCount,
    written,
  }: {
    baseAngle: number;
    batchCount: number;
    from: vec2;
    spread: number;
    to: vec2;
    totalCount: number;
    written: number;
  }): void {
    for (let i = 0; i < batchCount; i++) {
      const agentIndex = written + i;
      const t = totalCount === 1 ? 0.5 : agentIndex / (totalCount - 1);
      const x = from[0] + (to[0] - from[0]) * t;
      const y = from[1] + (to[1] - from[1]) * t;
      const angle = baseAngle + (Math.random() - 0.5) * settings.strokeAngleJitterRadians;
      const positionX = x + (Math.random() - 0.5) * spread;
      const positionY = y + (Math.random() - 0.5) * spread;

      writeAgentValues(this.strokeAgentData, i, {
        positionX,
        positionY,
        angle,
        colorIndex: settings.selectedColorIndex,
        targetPositionX: -1,
        targetPositionY: -1,
        targetAngle: angle,
        introDelay: 0,
      });
    }
  }

  private writeAgentBatch(data: Float32Array): void {
    if (data.length === 0) {
      return;
    }

    if (this.isCompacting) {
      this.queuedAgentBatches.push(data.slice());
      return;
    }

    const count = data.length / AGENT_FLOAT_COUNT;
    this.adaptiveCap = this.clampAndEnsureAdaptiveCap(this.adaptiveCap);
    this.expandAdaptiveCapForPendingAgents(count);

    const available = Math.max(0, this.adaptiveCap - this.activeCount);
    const appendCount = Math.min(count, available);

    if (appendCount > 0) {
      this.pipeline.writeAgents(
        this.activeCount,
        data.subarray(0, appendCount * AGENT_FLOAT_COUNT)
      );
      this.activeCount += appendCount;
    }

    let sourceAgentOffset = appendCount;
    while (sourceAgentOffset < count && this.activeCount > 0) {
      const targetAgentOffset = this.replacementCursor % this.activeCount;
      const chunkAgentCount = Math.min(
        count - sourceAgentOffset,
        this.activeCount - targetAgentOffset
      );

      this.pipeline.writeAgents(
        targetAgentOffset,
        data.subarray(
          sourceAgentOffset * AGENT_FLOAT_COUNT,
          (sourceAgentOffset + chunkAgentCount) * AGENT_FLOAT_COUNT
        )
      );

      sourceAgentOffset += chunkAgentCount;
      this.replacementCursor = (targetAgentOffset + chunkAgentCount) % this.activeCount;
    }
  }

  private flushQueuedAgentBatches(): void {
    const batches = this.queuedAgentBatches.splice(0);
    batches.forEach((batch) => this.writeAgentBatch(batch));
  }

  private expandAdaptiveCapForPendingAgents(requestedAgentCount: number): void {
    const available = Math.max(0, this.adaptiveCap - this.activeCount);
    if (requestedAgentCount <= available || !this.canExpandAdaptiveCap) {
      return;
    }

    const currentCap = this.clampAndEnsureAdaptiveCap(this.adaptiveCap);
    const pendingAgentCount = requestedAgentCount - available;
    this.adaptiveCap = this.clampAndEnsureAdaptiveCap(currentCap + pendingAgentCount);
  }

  private trimActiveCountToBudget(maxDecrease = Number.POSITIVE_INFINITY): void {
    if (this.activeCount <= this.adaptiveCap) {
      return;
    }

    this.activeCount = Math.max(
      this.adaptiveCap,
      this.activeCount - Math.max(1, Math.ceil(maxDecrease))
    );
    this.clampReplacementCursor();
  }

  private clampReplacementCursor(): void {
    this.replacementCursor =
      this.activeCount === 0 ? 0 : this.replacementCursor % this.activeCount;
  }

  private clampAndEnsureAdaptiveCap(value: number): number {
    const runtimeMaxCap =
      settings.maxAgentCount === Number.POSITIVE_INFINITY
        ? Number.POSITIVE_INFINITY
        : Number.isFinite(settings.maxAgentCount)
          ? Math.max(0, Math.floor(settings.maxAgentCount))
          : Math.max(0, Math.floor(this.pipeline.maxAgentCount));
    const maxCap = Math.min(this.pipeline.maxSupportedAgentCount, runtimeMaxCap);
    const minCap = Math.min(this.framePerformance.adaptiveCapMin, maxCap);
    const finiteValue = Number.isFinite(value) ? value : minCap;
    const nextCap = Math.min(maxCap, Math.max(minCap, Math.round(finiteValue)));
    return Math.min(
      nextCap,
      this.pipeline.ensureMaxAgentCount(nextCap, this.activeCount)
    );
  }
}

const getStrokeSpawnRate = (): number => {
  const spawnPerPixel = Number.isFinite(settings.spawnPerPixel)
    ? settings.spawnPerPixel
    : 0;
  return Math.max(0, spawnPerPixel * STROKE_DENSITY_MULTIPLIER);
};
