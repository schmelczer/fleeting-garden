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
  nextGenerationAggression: 0.5,

  moveSpeed: 90,
  turnSpeed: 78,
  sensorOffsetAngle: 41,
  sensorOffsetDistance: 45,
  turnWhenLost: 0.43,
  deinfectionProbability: 1,

  brushTrailWeight: 500,
  individualTrailWeight: 0.2,

  diffusionRateTrails: 0.29,
  decayRateTrails: 21.95,
  diffusionRateBrush: 0.25,
  decayRateBrush: 15,

  spawnRadius: 8,
  spawnInterval: 8,

  clarity: 0,
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
