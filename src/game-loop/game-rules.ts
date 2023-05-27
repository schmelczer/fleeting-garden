import { GenerationCounts } from '../pipelines/agents/agent-generation/generation-counts';
import { settings } from '../settings';
import { clamp01 } from '../utils/clamp';
import { Random } from '../utils/random';

import { vec2 } from 'gl-matrix';

export interface SpawnAction {
  generation: number;
  position: vec2;
  radius: number;
}

export class GameRules {
  private lastSpawnTimeInSeconds = 0;
  public nextGenerationId = 1;
  public generationCounts: {
    currentGenerationCount: number;
    nextGenerationCount: number;
  } = {
    currentGenerationCount: 0,
    nextGenerationCount: 0,
  };

  public constructor(startingTimeInSeconds: number) {
    this.lastSpawnTimeInSeconds = startingTimeInSeconds;
  }

  public getSpawnAction(timeInSeconds: number, canvasSize: vec2): SpawnAction {
    if (timeInSeconds - this.lastSpawnTimeInSeconds < settings.spawnInterval) {
      return {
        generation: this.nextGenerationId,
        position: vec2.create(),
        radius: 0,
      };
    }

    this.lastSpawnTimeInSeconds = timeInSeconds;

    return {
      generation: this.nextGenerationId,
      position: vec2.fromValues(
        Random.randomBetween(0, canvasSize.x),
        Random.randomBetween(0, canvasSize.y)
      ),
      radius: settings.spawnRadius,
    };
  }

  public updateGenerationCounts({
    evenGenerationCount,
    oddGenerationCount,
  }: GenerationCounts): void {
    const nextGenerationCount =
      this.nextGenerationId % 2 === 1 ? oddGenerationCount : evenGenerationCount;
    const currentGenerationCount =
      this.nextGenerationId % 2 === 1 ? evenGenerationCount : oddGenerationCount;

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
