export interface GameLoopSettings {
  maxAgentCountUpperLimit: number;
  agentCount: number;
  renderSpeed: number;
  simulatedDelayMs: number;

  aggressionFactor: number;
  spawnRadius: number;
  spawnInterval: number;

  startColorHue: number;
}
