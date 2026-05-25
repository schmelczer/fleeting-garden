import { vec2 } from 'gl-matrix';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type AgentGenerationPipeline } from '../pipelines/agents/agent-generation/agent-generation-pipeline';
import { AGENT_FLOAT_COUNT } from '../pipelines/agents/agent-limits';
import { settings } from '../settings';
import {
  AgentPopulation,
  STROKE_AGENT_BATCH_CAPACITY,
  STROKE_DENSITY_MULTIPLIER,
} from './agent-population';
import { type FramePerformance } from './frame-performance';

const originalSettings = {
  brushSize: settings.brushSize,
  maxAgentCount: settings.maxAgentCount,
  selectedColorIndex: settings.selectedColorIndex,
  spawnPerPixel: settings.spawnPerPixel,
  strokeAngleJitterRadians: settings.strokeAngleJitterRadians,
};

class RecordingAgentGenerationPipeline {
  public readonly writtenAgentCounts: Array<number> = [];
  public readonly writtenAgentOffsets: Array<number> = [];
  public readonly writtenBatches: Array<Float32Array> = [];
  public readonly maxSupportedAgentCount = 1_000_000;
  public maxAgentCount = 1_000_000;
  private compactResolver: ((compactedAgentCount: number) => void) | null = null;

  public ensureMaxAgentCount(requestedMaxAgentCount: number): number {
    this.maxAgentCount = Math.max(this.maxAgentCount, requestedMaxAgentCount);
    return this.maxAgentCount;
  }

  public writeAgents(agentOffset: number, data: Float32Array): void {
    this.writtenAgentOffsets.push(agentOffset);
    this.writtenAgentCounts.push(data.length / AGENT_FLOAT_COUNT);
    this.writtenBatches.push(data.slice());
  }

  public compactAgents(): Promise<number> {
    return new Promise((resolve) => {
      this.compactResolver = resolve;
    });
  }

  public finishCompaction(compactedAgentCount: number): void {
    this.compactResolver?.(compactedAgentCount);
    this.compactResolver = null;
  }
}

const framePerformance = {
  adaptiveCapDecreaseAgents: 0,
  adaptiveCapInitial: 1_000_000,
  adaptiveCapMin: 0,
  hasAdaptiveCapHeadroom: true,
} as FramePerformance;

const createPopulation = (): {
  pipeline: RecordingAgentGenerationPipeline;
  population: AgentPopulation;
} => {
  const pipeline = new RecordingAgentGenerationPipeline();
  const population = new AgentPopulation(
    pipeline as unknown as AgentGenerationPipeline,
    0,
    () => 1,
    framePerformance
  );
  population.beginStroke();
  return { pipeline, population };
};

const setSpawnRate = (agentsPerPixel: number): void => {
  settings.spawnPerPixel = agentsPerPixel / STROKE_DENSITY_MULTIPLIER;
};

describe('AgentPopulation stroke spawning', () => {
  beforeEach(() => {
    settings.brushSize = 0;
    settings.maxAgentCount = 1_000_000;
    settings.selectedColorIndex = 0;
    settings.strokeAngleJitterRadians = 0;
    setSpawnRate(1);
  });

  afterEach(() => {
    Object.assign(settings, originalSettings);
  });

  it('spawns the same count for the same stroke length regardless of segmentation', () => {
    const segmented = createPopulation();
    for (let x = 0; x < 10; x++) {
      segmented.population.spawnStrokeAgents(
        vec2.fromValues(x, 0),
        vec2.fromValues(x + 1, 0)
      );
    }

    const singleSegment = createPopulation();
    singleSegment.population.spawnStrokeAgents(
      vec2.fromValues(0, 0),
      vec2.fromValues(10, 0)
    );

    expect(segmented.population.activeAgentCount).toBe(10);
    expect(singleSegment.population.activeAgentCount).toBe(10);
  });

  it('carries fractional spawn budget within a stroke', () => {
    setSpawnRate(0.5);
    const { population } = createPopulation();

    population.spawnStrokeAgents(vec2.fromValues(0, 0), vec2.fromValues(1, 0));
    expect(population.activeAgentCount).toBe(0);

    population.spawnStrokeAgents(vec2.fromValues(1, 0), vec2.fromValues(2, 0));
    expect(population.activeAgentCount).toBe(1);

    population.spawnStrokeAgents(vec2.fromValues(2, 0), vec2.fromValues(3, 0));
    expect(population.activeAgentCount).toBe(1);

    population.spawnStrokeAgents(vec2.fromValues(3, 0), vec2.fromValues(4, 0));
    expect(population.activeAgentCount).toBe(2);
  });

  it('chunks long stroke writes without clipping length-linear spawn counts', () => {
    const { pipeline, population } = createPopulation();
    const batchCapacity = STROKE_AGENT_BATCH_CAPACITY;
    const expectedAgentCount = batchCapacity + 10;

    population.spawnStrokeAgents(
      vec2.fromValues(0, 0),
      vec2.fromValues(expectedAgentCount, 0)
    );

    expect(population.activeAgentCount).toBe(expectedAgentCount);
    expect(pipeline.writtenAgentCounts).toEqual([batchCapacity, 10]);
  });

  it('spawns agents in the movement direction', () => {
    const { pipeline, population } = createPopulation();

    population.spawnStrokeAgents(vec2.fromValues(0, 0), vec2.fromValues(3, 0));

    expect(population.activeAgentCount).toBe(3);
    expect(pipeline.writtenBatches[0][2]).toBe(0);
  });

  it('clears active agents when an intro replacement has no generated agents', () => {
    const { population } = createPopulation();

    population.spawnStrokeAgents(vec2.fromValues(0, 0), vec2.fromValues(3, 0));
    expect(population.activeAgentCount).toBe(3);

    settings.maxAgentCount = 0;
    population.replaceIntroAgents(vec2.fromValues(100, 100), 0);

    expect(population.activeAgentCount).toBe(0);
  });

  it('queues stroke writes while async compaction is in flight', async () => {
    const { pipeline, population } = createPopulation();

    population.spawnStrokeAgents(vec2.fromValues(0, 0), vec2.fromValues(10, 0));
    population.requestCompactionAfterErase();
    population.compactAfterErase(false);

    population.spawnStrokeAgents(vec2.fromValues(10, 0), vec2.fromValues(15, 0));
    expect(population.activeAgentCount).toBe(10);
    expect(pipeline.writtenAgentCounts).toEqual([10]);

    pipeline.finishCompaction(6);
    await population.waitForCompaction();

    expect(population.activeAgentCount).toBe(11);
    expect(pipeline.writtenAgentOffsets).toEqual([0, 6]);
    expect(pipeline.writtenAgentCounts).toEqual([10, 5]);
  });
});
