import { GenerationCounts } from '../pipelines/agents/agent-generation/generation-counts';
import { settings } from '../settings';
import { clamp, clamp01 } from '../utils/clamp';
import { mix } from '../utils/mix';
import { Random } from '../utils/random';

import { vec2 } from 'gl-matrix';

export interface SpawnAction {
  generation: number;
  position: vec2;
  radius: number;
}

export class GameRules {
  private static readonly DEAFULT_SPAWN_INTERVAL = 8;
  private static readonly DEAFULT_SPAWN_TIME_LENGTH = 2;
  private static readonly DEFAULT_SPAWN_RADIUS = 20;

  private lastSpawnTimeInSeconds = 0;
  private currentSpawnInterval = 0;
  private currentSpawnRadius = 0;
  private lastGenerationChangeTimeInSeconds = 0;

  public nextGenerationId = 1;
  public generationCounts: {
    currentGenerationCount: number;
    nextGenerationCount: number;
  } = {
    currentGenerationCount: 0,
    nextGenerationCount: 1,
  };

  public constructor(startingTimeInSeconds: number) {
    this.lastSpawnTimeInSeconds = startingTimeInSeconds;
    this.lastGenerationChangeTimeInSeconds = startingTimeInSeconds;
  }

  private lastSpawnAction: SpawnAction | undefined;

  public getSpawnAction(timeInSeconds: number, canvasSize: vec2): SpawnAction {
    if (
      this.lastSpawnAction &&
      timeInSeconds - this.lastSpawnTimeInSeconds < GameRules.DEAFULT_SPAWN_TIME_LENGTH
    ) {
      return this.lastSpawnAction;
    }

    this.currentSpawnInterval = mix(
      GameRules.DEAFULT_SPAWN_INTERVAL,
      GameRules.DEAFULT_SPAWN_INTERVAL / 5,
      clamp01((timeInSeconds - this.lastGenerationChangeTimeInSeconds) / 120)
    );

    this.currentSpawnRadius = mix(
      GameRules.DEFAULT_SPAWN_RADIUS,
      GameRules.DEFAULT_SPAWN_RADIUS * 3,
      clamp01((timeInSeconds - this.lastGenerationChangeTimeInSeconds) / 120)
    );

    const q = this.generationCounts.nextGenerationCount / settings.agentCount;

    if (
      timeInSeconds - this.lastSpawnTimeInSeconds < this.currentSpawnInterval ||
      q > 0.05
    ) {
      return {
        generation: this.nextGenerationId,
        position: vec2.create(),
        radius: 0,
      };
    }

    this.lastSpawnTimeInSeconds = timeInSeconds;

    this.lastSpawnAction = {
      generation: this.nextGenerationId,
      position: vec2.fromValues(
        Random.randomBetween(0, canvasSize.x),
        Random.randomBetween(0, canvasSize.y)
      ),
      radius: this.currentSpawnRadius,
    };

    return this.lastSpawnAction;
  }

  public updateGenerationCounts({
    evenGenerationCount,
    oddGenerationCount,
  }: GenerationCounts): void {
    const nextGenerationCount =
      this.nextGenerationId % 2 === 1 ? oddGenerationCount : evenGenerationCount;
    const currentGenerationCount =
      this.nextGenerationId % 2 === 1 ? evenGenerationCount : oddGenerationCount;

    const q = currentGenerationCount / settings.agentCount;

    if (currentGenerationCount <= 100 && q < 0.05) {
      this.nextGenerationId++;
      this.lastGenerationChangeTimeInSeconds = performance.now() / 1000;
    }

    this.generationCounts = {
      currentGenerationCount,
      nextGenerationCount,
    };
  }

  public getNextGenerationMoveSpeed(): number {
    const q = this.generationCounts.nextGenerationCount / settings.agentCount;
    return mix(settings.moveSpeed / 8, settings.moveSpeed, q ** 2);
  }

  public getInfectionProbability(): number {
    const q = this.generationCounts.nextGenerationCount / settings.agentCount;
    return clamp(mix(0.3, 1, q * 5), 0, 0.9);
  }

  public getSensorOffset(): number {
    const q = this.generationCounts.nextGenerationCount / settings.agentCount;
    return mix(20, settings.sensorOffsetDistance, q);
  }
}
