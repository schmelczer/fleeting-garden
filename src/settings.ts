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
  agentCount: 1_000,
  renderSpeed: 1,
  startingRadius: 0.15,

  trailWeight: 5,
  moveSpeed: 0.025,
  turnSpeed: 6,
  sensorAngleDegrees: 30,
  sensorOffsetDst: 0.025,

  decayRate: 0.02,
  diffusionRate: 0.8,

  swipeRadius: 0.003,
  swipeBlur: 0.002,
};
