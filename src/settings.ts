import { GameLoopSettings } from './game-loop/game-loop-settings';
import { AgentSettings } from './pipelines/agents/agent-settings';
import { BrushSettings } from './pipelines/brush/brush-settings';
import { DiffusionSettings } from './pipelines/diffusion/diffusion-settings';
import { RenderSettings } from './pipelines/render/render-settings';
import { rgb255 } from './utils/colors/rgb255';

const palette = {
  blue: rgb255(0, 110, 202),
  red: rgb255(232, 141, 122),
  green: rgb255(90, 188, 94),
  purple: rgb255(161, 90, 188),
  yellow: rgb255(255, 204, 0),
  beige: rgb255(229, 204, 175),
};

export const settings: GameLoopSettings &
  AgentSettings &
  BrushSettings &
  DiffusionSettings &
  RenderSettings = {
  agentCount: 500_000,
  renderSpeed: 1,
  startingRadius: 0.15,

  brushWidth: 20,
  brushWidthRandomness: 8,

  brushTrailWeight: 5,
  moveSpeed: 0.025,
  turnSpeed: 6,
  sensorAngleDegrees: 30,
  sensorOffsetDst: 0.025,

  diffusionRateTrails: 6,
  decayRateTrails: 1,
  diffusionRateBrush: 4,
  decayRateBrush: 0.15,

  brushColor: palette.blue,
  speciesColorA: palette.yellow,
  speciesColorB: palette.green,
};
