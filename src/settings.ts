import { GameLoopSettings } from './game-loop/game-loop-settings';
import { AgentSettings } from './pipelines/agents/agent-settings';
import { BrushSettings } from './pipelines/brush/brush-settings';
import { DiffusionSettings } from './pipelines/diffusion/diffusion-settings';
import { RenderSettings } from './pipelines/render/render-settings';
import { persist } from './utils/persist';

export const settings: { [key: string]: number } & GameLoopSettings &
  AgentSettings &
  BrushSettings &
  DiffusionSettings &
  RenderSettings = persist({
  agentCount: 1_000_000,

  brushWidth: 12,
  brushWidthRandomness: 0.5,

  aggressionFactor: 3,
  nextGenerationSpawnRadius: 5,
  nextGenerationSpawnInterval: 600,

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

  maxAgentCountUpperLimit: 64_000_000, // requires restart

  // debug options
  renderSpeed: 1,
  simulatedDelayMs: 0,
});
