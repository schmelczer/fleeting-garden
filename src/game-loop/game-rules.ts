import { GenerationCounts } from '../pipelines/agents/agent-generation/generation-counts';
import { settings } from '../settings';
import { clamp01 } from '../utils/clamp';
import { Random } from '../utils/random';

import { vec2 } from 'gl-matrix';

export interface SpawnAction {
  generation: number;
  position: vec2;
  count: number;
}

export class GameRules {
  private static SPAWN_INTERVAL = 3;

  private lastSpawnTimeInSeconds = 0;
  private nextGenerationId = 0;
  public generationCounts: GenerationCounts = {
    currentGenerationCount: 0,
    nextGenerationCount: 0,
  };

  public constructor(startingTimeInSeconds: number) {
    this.lastSpawnTimeInSeconds = startingTimeInSeconds;
  }

  public getSpawnAction(timeInSeconds: number, canvasSize: vec2): SpawnAction {
    if (timeInSeconds - this.lastSpawnTimeInSeconds < GameRules.SPAWN_INTERVAL) {
      return {
        generation: this.nextGenerationId,
        position: vec2.create(),
        count: 0,
      };
    }

    this.lastSpawnTimeInSeconds = timeInSeconds;

    return {
      generation: this.nextGenerationId,
      position: vec2.fromValues(
        Random.randomBetween(0, canvasSize.x),
        Random.randomBetween(0, canvasSize.y)
      ),
      count:
        settings.agentCount -
        this.generationCounts.nextGenerationCount -
        this.generationCounts.currentGenerationCount,
    };
  }

  public updateGenerationCounts({
    currentGenerationCount,
    nextGenerationCount,
  }: GenerationCounts): void {
    if (currentGenerationCount === 0) {
      this.nextGenerationId++;
    }

    this.generationCounts = {
      currentGenerationCount,
      nextGenerationCount,
    };
  }

  public get nextGenerationAgression(): number {
    if (this.generationCounts.currentGenerationCount === 0) {
      return 0;
    }

    return clamp01(
      (this.generationCounts.nextGenerationCount /
        this.generationCounts.currentGenerationCount -
        1) *
        settings.aggressionFactor
    );
  }
}
