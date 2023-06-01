import { GameLoopSettings } from './game-loop/game-loop-settings';
import { AgentSettings } from './pipelines/agents/agent-settings';
import { BrushSettings } from './pipelines/brush/brush-settings';
import { DiffusionSettings } from './pipelines/diffusion/diffusion-settings';
import { RenderSettings } from './pipelines/render/render-settings';
import { persist } from './utils/persist';

const initialValues: GameLoopSettings &
  AgentSettings &
  BrushSettings &
  DiffusionSettings &
  RenderSettings = {
  agentCount: 1_001_500,

  currentGenerationAggression: -5,
  nextGenerationAggression: 0.2,

  moveSpeed: 74,
  turnSpeed: 45,
  sensorOffsetAngle: 31,
  sensorOffsetDistance: 43,
  turnWhenLost: 0.01,

  brushTrailWeight: 500,
  individualTrailWeight: 0.05,

  diffusionRateTrails: 0,
  decayRateTrails: 944,
  diffusionRateBrush: 0.35,
  decayRateBrush: 18,

  clarity: 0.7,
  brushSize: 12,

  brushSizeVariation: 0.5, // hidden on the UI

  startColorHue: 200,

  maxAgentCountUpperLimit: Number.POSITIVE_INFINITY, // requires restart

  // debug options
  renderSpeed: 1,
  simulatedDelayMs: 0,
};

export const settings: { [key: string]: number } & GameLoopSettings &
  AgentSettings &
  BrushSettings &
  DiffusionSettings &
  RenderSettings = persist({ ...initialValues });

export const resetSettings = () => {
  Object.assign(settings, initialValues);
};
