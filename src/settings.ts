import { GameLoopSettings } from './game-loop/game-loop-settings';
import { AgentSettings } from './pipelines/agents/agent-settings';
import { BrushSettings } from './pipelines/brush/brush-settings';
import { DiffusionSettings } from './pipelines/diffusion/diffusion-settings';
import { RenderSettings } from './pipelines/render/render-settings';

export const settings: GameLoopSettings &
  AgentSettings &
  BrushSettings &
  DiffusionSettings &
  RenderSettings = {
  agentCount: 4_000_000, // requires restart

  aggressionFactor: 3,
  nextGenerationSpawnRadius: 5,
  nextGenerationSpawnInterval: 1,

  renderSpeed: 2,
  simulatedDelayMs: 0,

  brushWidth: 12,
  brushWidthRandomness: 5.5,

  brushTrailWeight: 5,
  moveSpeed: 80,
  turnSpeed: 550,
  sensorOffsetAngle: 30,
  sensorOffsetDistance: 30,
  turnWhenGoingInTheRightDirection: 0.05,
  turnWhenLost: 0.2,
  individualTrailWeight: 0.5,
  deinfectionProbability: 0.001,

  diffusionRateTrails: 2, // inverse
  decayRateTrails: 0.9, // inverse
  diffusionRateBrush: 4, // inverse
  decayRateBrush: 0.003,

  clarity: 2,
  startColorHue: 200,
};
