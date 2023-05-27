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

  aggressionFactor: 3,

  moveSpeed: 80,
  turnSpeed: 550,
  sensorOffsetAngle: 30,
  sensorOffsetDistance: 30,
  turnWhenGoingInTheRightDirection: 0.05,
  turnWhenLost: 0.2,
  deinfectionProbability: 0.001,

  brushTrailWeight: 5,
  individualTrailWeight: 0.5,
  diffusionRateTrails: 2, // inverse
  decayRateTrails: 0.9, // inverse
  diffusionRateBrush: 4, // inverse
  decayRateBrush: 0.003,

  spawnRadius: 5,
  spawnInterval: 600,

  clarity: 2,
  brushWidth: 12,
  brushWidthVariation: 0.5,

  startColorHue: 200,

  maxAgentCountUpperLimit: Number.POSITIVE_INFINITY, // requires restart

  // debug options
  renderSpeed: 1,
  simulatedDelayMs: 0,
});
